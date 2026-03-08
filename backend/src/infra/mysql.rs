use crate::{
    config::{Config, MySqlConfig},
    domain::models::BanRecord,
    error::AppResult,
    infra::seed::seed_data,
    support::{
        convert::bool_to_i32,
        ids::generate_plugin_token,
        steam::resolve_steam_identifiers_strict,
        time::iso_to_mysql,
    },
};
use sqlx::{
    Connection, Executor, MySqlConnection, MySqlPool,
    mysql::{MySqlConnectOptions, MySqlPoolOptions},
};

pub(crate) async fn init_database(config: &Config) -> AppResult<MySqlPool> {
    create_database_if_needed(&config.mysql).await?;
    let options = MySqlConnectOptions::new()
        .host(&config.mysql.host)
        .port(config.mysql.port)
        .username(&config.mysql.user)
        .password(&config.mysql.password)
        .database(&config.mysql.database);

    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .connect_with(options)
        .await?;

    create_tables(&pool).await?;
    seed_if_empty(&pool).await?;
    crate::application::auth::ensure_default_system_admin(&pool, &config.default_admin).await?;

    Ok(pool)
}

pub(crate) async fn create_database_if_needed(config: &MySqlConfig) -> AppResult<()> {
    let options = MySqlConnectOptions::new()
        .host(&config.host)
        .port(config.port)
        .username(&config.user)
        .password(&config.password);

    let mut connection = MySqlConnection::connect_with(&options).await?;
    let database = config.database.replace('`', "``");
    let sql = format!(
        "CREATE DATABASE IF NOT EXISTS `{}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        database
    );
    sqlx::query(&sql).execute(&mut connection).await?;
    Ok(())
}

async fn ensure_servers_column(pool: &MySqlPool, column_name: &str, column_ddl: &str) -> AppResult<()> {
    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'servers' AND COLUMN_NAME = ?",
    )
    .bind(column_name)
    .fetch_one(pool)
    .await?;

    if exists == 0 {
        let sql = format!("ALTER TABLE servers ADD COLUMN {} {}", column_name, column_ddl);
        sqlx::query(&sql).execute(pool).await?;
    }

    Ok(())
}

async fn ensure_ban_records_column(pool: &MySqlPool, column_name: &str, column_ddl: &str) -> AppResult<()> {
    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ban_records' AND COLUMN_NAME = ?",
    )
    .bind(column_name)
    .fetch_one(pool)
    .await?;

    if exists == 0 {
        let sql = format!("ALTER TABLE ban_records ADD COLUMN {} {}", column_name, column_ddl);
        sqlx::query(&sql).execute(pool).await?;
    }

    Ok(())
}

async fn ensure_whitelist_players_column(pool: &MySqlPool, column_name: &str, column_ddl: &str) -> AppResult<()> {
    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whitelist_players' AND COLUMN_NAME = ?",
    )
    .bind(column_name)
    .fetch_one(pool)
    .await?;

    if exists == 0 {
        let sql = format!("ALTER TABLE whitelist_players ADD COLUMN {} {}", column_name, column_ddl);
        sqlx::query(&sql).execute(pool).await?;
    }

    Ok(())
}

async fn ensure_whitelist_player_identifiers(pool: &MySqlPool) -> AppResult<()> {
    let rows = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, steam_id, steam_id64, steam_id3 FROM whitelist_players",
    )
    .fetch_all(pool)
    .await?;

    for (player_id, steam_id, steam_id64, steam_id3) in rows {
        if !steam_id64.trim().is_empty() && !steam_id3.trim().is_empty() {
            continue;
        }

        let Ok(identifiers) = resolve_steam_identifiers_strict(&steam_id) else {
            continue;
        };

        sqlx::query("UPDATE whitelist_players SET steam_id64 = ?, steam_id = ?, steam_id3 = ? WHERE id = ?")
            .bind(&identifiers.steam_id64)
            .bind(&identifiers.steam_id)
            .bind(&identifiers.steam_id3)
            .bind(&player_id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

async fn ensure_server_plugin_tokens(pool: &MySqlPool) -> AppResult<()> {
    let rows = sqlx::query_as::<_, (String, String)>("SELECT id, plugin_token FROM servers")
        .fetch_all(pool)
        .await?;

    for (server_id, plugin_token) in rows {
        if !plugin_token.trim().is_empty() {
            continue;
        }

        sqlx::query("UPDATE servers SET plugin_token = ? WHERE id = ?")
            .bind(generate_plugin_token())
            .bind(server_id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub(crate) async fn create_tables(pool: &MySqlPool) -> AppResult<()> {
    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS communities (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at DATETIME(3) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS servers (
          id VARCHAR(64) PRIMARY KEY,
          community_id VARCHAR(64) NOT NULL,
          name VARCHAR(255) NOT NULL,
          ip VARCHAR(45) NOT NULL,
          port INT NOT NULL,
          rcon_password VARCHAR(255) NOT NULL,
          restart_command TEXT NULL,
          plugin_token VARCHAR(128) NOT NULL DEFAULT '',
          rcon_verified_at DATETIME(3) NOT NULL,
          whitelist_enabled TINYINT(1) NOT NULL DEFAULT 0,
          entry_verification_enabled TINYINT(1) NOT NULL DEFAULT 0,
          min_entry_rating INT NOT NULL DEFAULT 0,
          min_steam_level INT NOT NULL DEFAULT 0,
          CONSTRAINT fk_servers_community FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
          INDEX idx_servers_community_id (community_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    ensure_servers_column(pool, "restart_command", "TEXT NULL AFTER rcon_password").await?;
    ensure_servers_column(pool, "plugin_token", "VARCHAR(128) NOT NULL DEFAULT ''").await?;
    ensure_servers_column(pool, "min_entry_rating", "INT NOT NULL DEFAULT 0").await?;
    ensure_servers_column(pool, "min_steam_level", "INT NOT NULL DEFAULT 0").await?;
    ensure_server_plugin_tokens(pool).await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS server_players (
          id VARCHAR(64) PRIMARY KEY,
          server_id VARCHAR(64) NOT NULL,
          nickname VARCHAR(255) NOT NULL,
          steam_id VARCHAR(255) NOT NULL,
          ip_address VARCHAR(45) NOT NULL,
          connected_at DATETIME(3) NOT NULL,
          ping INT NOT NULL,
          CONSTRAINT fk_server_players_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
          INDEX idx_server_players_server_id (server_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS whitelist_players (
          id VARCHAR(64) PRIMARY KEY,
          nickname VARCHAR(255) NOT NULL,
          steam_id64 VARCHAR(32) NOT NULL DEFAULT '',
          steam_id VARCHAR(255) NOT NULL,
          steam_id3 VARCHAR(255) NOT NULL DEFAULT '',
          contact VARCHAR(255) NULL,
          note TEXT NULL,
          status VARCHAR(32) NOT NULL,
          source VARCHAR(32) NOT NULL,
          applied_at DATETIME(3) NOT NULL,
          reviewed_at DATETIME(3) NULL,
          INDEX idx_whitelist_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    ensure_whitelist_players_column(pool, "steam_id64", "VARCHAR(32) NOT NULL DEFAULT '' AFTER nickname").await?;
    ensure_whitelist_players_column(pool, "steam_id3", "VARCHAR(255) NOT NULL DEFAULT '' AFTER steam_id").await?;
    ensure_whitelist_player_identifiers(pool).await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS whitelist_player_restrictions (
          player_id VARCHAR(64) PRIMARY KEY,
          created_at DATETIME(3) NOT NULL,
          updated_at DATETIME(3) NOT NULL,
          CONSTRAINT fk_whitelist_restrictions_player FOREIGN KEY (player_id) REFERENCES whitelist_players(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS whitelist_player_restriction_servers (
          player_id VARCHAR(64) NOT NULL,
          server_id VARCHAR(64) NOT NULL,
          PRIMARY KEY (player_id, server_id),
          CONSTRAINT fk_whitelist_restriction_servers_player FOREIGN KEY (player_id) REFERENCES whitelist_players(id) ON DELETE CASCADE,
          CONSTRAINT fk_whitelist_restriction_servers_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
          INDEX idx_whitelist_restriction_server_id (server_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS ban_records (
          id VARCHAR(64) PRIMARY KEY,
          nickname VARCHAR(255) NULL,
          ban_type VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL,
          steam_identifier VARCHAR(255) NOT NULL,
          steam_id64 VARCHAR(32) NOT NULL,
          steam_id VARCHAR(255) NOT NULL,
          steam_id3 VARCHAR(255) NOT NULL,
          ip_address VARCHAR(45) NULL,
          reason TEXT NOT NULL,
          duration_seconds INT NULL,
          banned_at DATETIME(3) NOT NULL,
          server_id VARCHAR(64) NULL,
          server_name VARCHAR(255) NOT NULL,
          community_name VARCHAR(255) NULL,
          operator_id VARCHAR(64) NOT NULL,
          operator_name VARCHAR(255) NOT NULL,
          operator_role VARCHAR(32) NOT NULL,
          source VARCHAR(32) NOT NULL,
          updated_at DATETIME(3) NULL,
          revoked_at DATETIME(3) NULL,
          revoked_by_operator_id VARCHAR(64) NULL,
          revoked_by_operator_name VARCHAR(255) NULL,
          revoked_by_operator_role VARCHAR(32) NULL,
          INDEX idx_ban_status (status),
          INDEX idx_ban_type (ban_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    ensure_ban_records_column(pool, "server_id", "VARCHAR(64) NULL AFTER banned_at").await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS website_admins (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(255) NOT NULL UNIQUE,
          display_name VARCHAR(255) NOT NULL,
          role VARCHAR(32) NOT NULL,
          password VARCHAR(255) NOT NULL,
          email VARCHAR(255) NULL,
          note TEXT NULL,
          created_at DATETIME(3) NOT NULL,
          updated_at DATETIME(3) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS operation_logs (
          id VARCHAR(64) PRIMARY KEY,
          created_at DATETIME(3) NOT NULL,
          operator_id VARCHAR(64) NOT NULL,
          operator_name VARCHAR(255) NOT NULL,
          operator_role VARCHAR(32) NOT NULL,
          action VARCHAR(64) NOT NULL,
          detail TEXT NOT NULL,
          INDEX idx_operation_logs_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS admin_sessions (
          id VARCHAR(64) PRIMARY KEY,
          admin_id VARCHAR(64) NOT NULL,
          token VARCHAR(128) NOT NULL UNIQUE,
          created_at DATETIME(3) NOT NULL,
          expires_at DATETIME(3) NOT NULL,
          revoked_at DATETIME(3) NULL,
          user_agent VARCHAR(512) NULL,
          ip_address VARCHAR(45) NULL,
          CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES website_admins(id) ON DELETE CASCADE,
          INDEX idx_admin_sessions_admin_id (admin_id),
          INDEX idx_admin_sessions_expires_at (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    Ok(())
}

pub(crate) async fn seed_if_empty(pool: &MySqlPool) -> AppResult<()> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM communities")
        .fetch_one(pool)
        .await?;

    if count > 0 {
        return Ok(());
    }

    let seed = seed_data();
    let mut tx = pool.begin().await?;

    for community in &seed.communities {
        sqlx::query("INSERT INTO communities (id, name, created_at) VALUES (?, ?, ?)")
            .bind(&community.id)
            .bind(&community.name)
            .bind(iso_to_mysql(&community.created_at))
            .execute(&mut *tx)
            .await?;

        for server in &community.servers {
            sqlx::query(
                r#"
                INSERT INTO servers (
                  id, community_id, name, ip, port, rcon_password, restart_command, plugin_token, rcon_verified_at, whitelist_enabled, entry_verification_enabled, min_entry_rating, min_steam_level
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&server.id)
            .bind(&community.id)
            .bind(&server.name)
            .bind(&server.ip)
            .bind(server.port)
            .bind(&server.rcon_password)
            .bind(&server.restart_command)
            .bind(&server.plugin_token)
            .bind(iso_to_mysql(&server.rcon_verified_at))
            .bind(bool_to_i32(server.whitelist_enabled))
            .bind(bool_to_i32(server.entry_verification_enabled))
            .bind(server.min_entry_rating)
            .bind(server.min_steam_level)
            .execute(&mut *tx)
            .await?;

            for player in &server.online_players {
                sqlx::query(
                    r#"
                    INSERT INTO server_players (
                      id, server_id, nickname, steam_id, ip_address, connected_at, ping
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    "#,
                )
                .bind(&player.id)
                .bind(&server.id)
                .bind(&player.nickname)
                .bind(&player.steam_id)
                .bind(&player.ip_address)
                .bind(iso_to_mysql(&player.connected_at))
                .bind(player.ping)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    for player in &seed.whitelist {
        sqlx::query(
            r#"
            INSERT INTO whitelist_players (
              id, nickname, steam_id64, steam_id, steam_id3, contact, note, status, source, applied_at, reviewed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&player.id)
        .bind(&player.nickname)
        .bind(&player.steam_id64)
        .bind(&player.steam_id)
        .bind(&player.steam_id3)
        .bind(&player.contact)
        .bind(&player.note)
        .bind(&player.status)
        .bind(&player.source)
        .bind(iso_to_mysql(&player.applied_at))
        .bind(player.reviewed_at.as_ref().map(|value| iso_to_mysql(value)))
        .execute(&mut *tx)
        .await?;
    }

    for ban in &seed.bans {
        insert_ban_record(&mut *tx, ban).await?;
    }

    for admin in &seed.admins {
        sqlx::query(
            r#"
            INSERT INTO website_admins (
              id, username, display_name, role, password, email, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&admin.id)
        .bind(&admin.username)
        .bind(&admin.display_name)
        .bind(&admin.role)
        .bind(&admin.password)
        .bind(&admin.email)
        .bind(&admin.note)
        .bind(iso_to_mysql(&admin.created_at))
        .bind(iso_to_mysql(&admin.updated_at))
        .execute(&mut *tx)
        .await?;
    }

    for log in &seed.operation_logs {
        sqlx::query(
            r#"
            INSERT INTO operation_logs (
              id, created_at, operator_id, operator_name, operator_role, action, detail
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&log.id)
        .bind(iso_to_mysql(&log.created_at))
        .bind(&log.operator_id)
        .bind(&log.operator_name)
        .bind(&log.operator_role)
        .bind(&log.action)
        .bind(&log.detail)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub(crate) async fn insert_ban_record<'e, E>(
    executor: E,
    ban: &BanRecord,
) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = sqlx::MySql>,
{
    sqlx::query(
        r#"
        INSERT INTO ban_records (
          id, nickname, ban_type, status, steam_identifier, steam_id64, steam_id, steam_id3, ip_address,
          reason, duration_seconds, banned_at, server_id, server_name, community_name, operator_id, operator_name,
          operator_role, source, updated_at, revoked_at, revoked_by_operator_id, revoked_by_operator_name, revoked_by_operator_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&ban.id)
    .bind(&ban.nickname)
    .bind(&ban.ban_type)
    .bind(&ban.status)
    .bind(&ban.steam_identifier)
    .bind(&ban.steam_id64)
    .bind(&ban.steam_id)
    .bind(&ban.steam_id3)
    .bind(&ban.ip_address)
    .bind(&ban.reason)
    .bind(ban.duration_seconds)
    .bind(iso_to_mysql(&ban.banned_at))
    .bind(&ban.server_id)
    .bind(&ban.server_name)
    .bind(&ban.community_name)
    .bind(&ban.operator_id)
    .bind(&ban.operator_name)
    .bind(&ban.operator_role)
    .bind(&ban.source)
    .bind(ban.updated_at.as_ref().map(|value| iso_to_mysql(value)))
    .bind(ban.revoked_at.as_ref().map(|value| iso_to_mysql(value)))
    .bind(&ban.revoked_by_operator_id)
    .bind(&ban.revoked_by_operator_name)
    .bind(&ban.revoked_by_operator_role)
    .execute(executor)
    .await?;

    Ok(())
}
