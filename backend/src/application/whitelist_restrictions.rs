use crate::{
    application::{
        admins::get_operator_snapshot, mappers::map_whitelist_player,
        operation_logs::append_operation_log,
    },
    domain::{
        db::{DbServerIdOnly, DbWhitelistPlayer},
        models::{OperatorSnapshot, WhitelistRestriction},
    },
    error::{AppError, AppResult},
    support::time::{iso_to_mysql, now_iso},
};
use axum::http::StatusCode;
use sqlx::MySqlPool;
use std::collections::{HashMap, HashSet};

pub(crate) async fn list_whitelist_restrictions(
    pool: &MySqlPool,
) -> AppResult<Vec<WhitelistRestriction>> {
    let rows = sqlx::query_as::<_, DbWhitelistPlayer>(
        r#"
        SELECT wp.*
          FROM whitelist_player_restrictions wr
          INNER JOIN whitelist_players wp ON wp.id = wr.player_id
         WHERE wp.status = 'approved'
         ORDER BY wr.updated_at DESC, wp.applied_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let allowed_server_map = load_allowed_server_ids_by_player_id(pool).await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let player = map_whitelist_player(row);
            let player_id = player.id.clone();

            WhitelistRestriction {
                player_id: player_id.clone(),
                nickname: player.nickname,
                steam_id64: player.steam_id64,
                steam_id: player.steam_id,
                steam_id3: player.steam_id3,
                contact: player.contact,
                note: player.note,
                source: player.source,
                applied_at: player.applied_at,
                reviewed_at: player.reviewed_at,
                allowed_server_ids: allowed_server_map
                    .get(&player_id)
                    .cloned()
                    .unwrap_or_default(),
            }
        })
        .collect())
}

pub(crate) async fn add_whitelist_restriction(
    pool: &MySqlPool,
    player_id: &str,
    server_ids: Vec<String>,
    operator_id: Option<String>,
) -> AppResult<WhitelistRestriction> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    ensure_system_admin(&operator, "仅系统管理员可以将玩家添加到限制页")?;
    let player = get_approved_whitelist_player(pool, player_id).await?;
    let normalized_server_ids = normalize_server_ids(server_ids);
    ensure_server_ids_exist(pool, &normalized_server_ids).await?;
    let now = now_iso();

    let mut tx = pool.begin().await?;
    upsert_whitelist_restriction_servers(&mut tx, player_id, &now, &normalized_server_ids).await?;
    tx.commit().await?;

    append_operation_log(
        pool,
        "whitelist_restriction_added",
        format!(
            "将玩家 {} 添加到了玩家限制页，当前允许进入 {} 台服务器。",
            player.nickname,
            normalized_server_ids.len()
        ),
        &operator,
    )
    .await?;

    get_whitelist_restriction_by_player_id(pool, player_id).await
}

pub(crate) async fn update_whitelist_restriction_servers(
    pool: &MySqlPool,
    player_id: &str,
    server_ids: Vec<String>,
    operator_id: Option<String>,
) -> AppResult<WhitelistRestriction> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    ensure_system_admin(&operator, "仅系统管理员可以设置玩家限制服务器")?;
    let player = get_approved_whitelist_player(pool, player_id).await?;
    let normalized_server_ids = normalize_server_ids(server_ids);
    ensure_server_ids_exist(pool, &normalized_server_ids).await?;
    let now = now_iso();

    let mut tx = pool.begin().await?;
    upsert_whitelist_restriction_servers(&mut tx, player_id, &now, &normalized_server_ids).await?;
    tx.commit().await?;

    append_operation_log(
        pool,
        "whitelist_restriction_updated",
        format!(
            "更新了玩家 {} 的限制服务器，当前允许进入 {} 台服务器。",
            player.nickname,
            normalized_server_ids.len()
        ),
        &operator,
    )
    .await?;

    get_whitelist_restriction_by_player_id(pool, player_id).await
}

pub(crate) async fn delete_whitelist_restriction(
    pool: &MySqlPool,
    player_id: &str,
    operator_id: Option<String>,
) -> AppResult<()> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    ensure_system_admin(&operator, "仅系统管理员可以移出玩家限制页")?;
    let restriction = get_whitelist_restriction_by_player_id(pool, player_id).await?;

    sqlx::query("DELETE FROM whitelist_player_restrictions WHERE player_id = ?")
        .bind(player_id)
        .execute(pool)
        .await?;

    append_operation_log(
        pool,
        "whitelist_restriction_removed",
        format!("将玩家 {} 移出了玩家限制页。", restriction.nickname),
        &operator,
    )
    .await?;

    Ok(())
}

pub(crate) async fn cleanup_whitelist_restriction_for_player(
    pool: &MySqlPool,
    player_id: &str,
) -> AppResult<()> {
    sqlx::query("DELETE FROM whitelist_player_restrictions WHERE player_id = ?")
        .bind(player_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub(crate) async fn load_restricted_player_allowed_server_ids_by_steam_id64(
    pool: &MySqlPool,
) -> AppResult<HashMap<String, HashSet<String>>> {
    let player_rows = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT wp.steam_id64, wr.player_id
          FROM whitelist_player_restrictions wr
          INNER JOIN whitelist_players wp ON wp.id = wr.player_id
         WHERE wp.status = 'approved' AND wp.steam_id64 <> ''
        "#,
    )
    .fetch_all(pool)
    .await?;

    let allowed_server_map = load_allowed_server_ids_by_player_id(pool).await?;
    let mut restriction_map = HashMap::new();

    for (steam_id64, player_id) in player_rows {
        restriction_map.insert(
            steam_id64,
            allowed_server_map
                .get(&player_id)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .collect(),
        );
    }

    Ok(restriction_map)
}

async fn get_whitelist_restriction_by_player_id(
    pool: &MySqlPool,
    player_id: &str,
) -> AppResult<WhitelistRestriction> {
    let row = sqlx::query_as::<_, DbWhitelistPlayer>(
        r#"
        SELECT wp.*
          FROM whitelist_player_restrictions wr
          INNER JOIN whitelist_players wp ON wp.id = wr.player_id
         WHERE wr.player_id = ? AND wp.status = 'approved'
        "#,
    )
    .bind(player_id)
    .fetch_optional(pool)
    .await?;
    let player = row
        .map(map_whitelist_player)
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标限制玩家"))?;
    let allowed_server_ids = load_allowed_server_ids_by_player_id(pool)
        .await?
        .remove(player_id)
        .unwrap_or_default();

    Ok(WhitelistRestriction {
        player_id: player.id,
        nickname: player.nickname,
        steam_id64: player.steam_id64,
        steam_id: player.steam_id,
        steam_id3: player.steam_id3,
        contact: player.contact,
        note: player.note,
        source: player.source,
        applied_at: player.applied_at,
        reviewed_at: player.reviewed_at,
        allowed_server_ids,
    })
}

async fn get_approved_whitelist_player(pool: &MySqlPool, player_id: &str) -> AppResult<crate::domain::models::WhitelistPlayer> {
    let row = sqlx::query_as::<_, DbWhitelistPlayer>(
        "SELECT * FROM whitelist_players WHERE id = ? AND status = 'approved'",
    )
    .bind(player_id)
    .fetch_optional(pool)
    .await?;

    row.map(map_whitelist_player)
        .ok_or_else(|| AppError::http(StatusCode::BAD_REQUEST, "仅已通过白名单的玩家可添加到限制页"))
}

async fn load_allowed_server_ids_by_player_id(
    pool: &MySqlPool,
) -> AppResult<HashMap<String, Vec<String>>> {
    let rows = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT player_id, server_id
          FROM whitelist_player_restriction_servers
         ORDER BY player_id ASC, server_id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut allowed_server_map = HashMap::<String, Vec<String>>::new();
    for (player_id, server_id) in rows {
        allowed_server_map.entry(player_id).or_default().push(server_id);
    }

    Ok(allowed_server_map)
}

async fn ensure_server_ids_exist(pool: &MySqlPool, server_ids: &[String]) -> AppResult<()> {
    if server_ids.is_empty() {
        return Ok(());
    }

    let existing_server_ids = sqlx::query_as::<_, DbServerIdOnly>(
        "SELECT id FROM servers ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| row.id)
    .collect::<HashSet<_>>();

    let missing_server_ids = server_ids
        .iter()
        .filter(|server_id| !existing_server_ids.contains(server_id.as_str()))
        .cloned()
        .collect::<Vec<_>>();

    if !missing_server_ids.is_empty() {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            format!("存在无效的服务器 ID：{}", missing_server_ids.join("、")),
        ));
    }

    Ok(())
}

async fn upsert_whitelist_restriction_servers(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    player_id: &str,
    now: &str,
    server_ids: &[String],
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO whitelist_player_restrictions (player_id, created_at, updated_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)
        "#,
    )
    .bind(player_id)
    .bind(iso_to_mysql(now))
    .bind(iso_to_mysql(now))
    .execute(&mut **tx)
    .await?;

    sqlx::query("DELETE FROM whitelist_player_restriction_servers WHERE player_id = ?")
        .bind(player_id)
        .execute(&mut **tx)
        .await?;

    for server_id in server_ids {
        sqlx::query(
            r#"
            INSERT INTO whitelist_player_restriction_servers (player_id, server_id)
            VALUES (?, ?)
            "#,
        )
        .bind(player_id)
        .bind(server_id)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

fn normalize_server_ids(server_ids: Vec<String>) -> Vec<String> {
    let mut unique_server_ids = Vec::<String>::new();
    let mut seen = HashSet::<String>::new();

    for server_id in server_ids {
        let trimmed = server_id.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        unique_server_ids.push(trimmed.to_string());
    }

    unique_server_ids.sort();
    unique_server_ids
}

fn ensure_system_admin(operator: &OperatorSnapshot, message: &str) -> AppResult<()> {
    if operator.role != "system_admin" {
        return Err(AppError::http(StatusCode::FORBIDDEN, message));
    }

    Ok(())
}
