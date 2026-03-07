use crate::{
    application::{
        admins::get_operator_snapshot, operation_logs::append_operation_log, server_presence,
    },
    domain::{db::*, models::*},
    error::{AppError, AppResult},
    http::requests::{ServerDraft, ServerSettingsDraft},
    support::{
        convert::bool_to_i32,
        ids::{generate_plugin_token, prefixed_id},
        rcon::{execute_rcon_command, verify_rcon_connection},
        time::{iso_to_mysql, naive_to_iso, now_iso},
        validation::{require_non_empty, validate_server_fields},
    },
};
use axum::http::StatusCode;
use redis::Client as RedisClient;
use sqlx::MySqlPool;
use std::collections::HashMap;

async fn require_community_name(pool: &MySqlPool, community_id: &str) -> AppResult<DbCommunityName> {
    let community =
        sqlx::query_as::<_, DbCommunityName>("SELECT name FROM communities WHERE id = ?")
            .bind(community_id)
            .fetch_optional(pool)
            .await?;

    community.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标社区"))
}

async fn load_community_by_id(
    pool: &MySqlPool,
    redis: &RedisClient,
    community_id: &str,
) -> AppResult<Community> {
    list_communities(pool, redis)
        .await?
        .into_iter()
        .find(|community| community.id == community_id)
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标社区"))
}

async fn verify_server_draft_connection(draft: &ServerDraft) -> AppResult<String> {
    validate_server_fields(
        None,
        &draft.ip,
        draft.port,
        &draft.rcon_password,
        draft.min_entry_rating,
        draft.min_steam_level,
    )?;

    verify_rcon_connection(draft)
        .await
        .map_err(|message| AppError::http(StatusCode::BAD_REQUEST, message))?;

    Ok(now_iso())
}

async fn verify_server_settings_connection(
    server_name: &str,
    draft: &ServerSettingsDraft,
) -> AppResult<String> {
    let connection_draft = ServerDraft {
        name: server_name.to_string(),
        ip: draft.ip.clone(),
        port: draft.port,
        rcon_password: draft.rcon_password.clone(),
        whitelist_enabled: draft.whitelist_enabled,
        entry_verification_enabled: draft.entry_verification_enabled,
        min_entry_rating: draft.min_entry_rating,
        min_steam_level: draft.min_steam_level,
    };

    verify_server_draft_connection(&connection_draft).await
}

pub(crate) async fn list_communities(
    pool: &MySqlPool,
    redis: &RedisClient,
) -> AppResult<Vec<Community>> {
    let community_rows =
        sqlx::query_as::<_, DbCommunity>("SELECT * FROM communities ORDER BY created_at DESC")
            .fetch_all(pool)
            .await?;

    let server_rows =
        sqlx::query_as::<_, DbServer>("SELECT * FROM servers ORDER BY rcon_verified_at DESC")
            .fetch_all(pool)
            .await?;

    let server_ids = server_rows
        .iter()
        .map(|server| server.id.clone())
        .collect::<Vec<_>>();
    let mut snapshot_map = server_presence::load_snapshots_by_server_ids(redis, &server_ids).await?;

    let mut server_map: HashMap<String, Vec<Server>> = HashMap::new();
    for server in server_rows {
        let snapshot = snapshot_map.remove(&server.id);
        let online_players = snapshot
            .as_ref()
            .map(|snapshot| snapshot.players.clone())
            .unwrap_or_default();
        let player_reported_at = snapshot.and_then(|snapshot| snapshot.reported_at);

        server_map
            .entry(server.community_id.clone())
            .or_default()
            .push(Server {
                id: server.id,
                name: server.name,
                ip: server.ip,
                port: server.port,
                rcon_password: server.rcon_password,
                plugin_token: server.plugin_token,
                rcon_verified_at: naive_to_iso(server.rcon_verified_at),
                whitelist_enabled: server.whitelist_enabled != 0,
                entry_verification_enabled: server.entry_verification_enabled != 0,
                min_entry_rating: server.min_entry_rating,
                min_steam_level: server.min_steam_level,
                player_reported_at,
                online_players,
            });
    }

    Ok(community_rows
        .into_iter()
        .map(|community| Community {
            id: community.id.clone(),
            name: community.name,
            created_at: naive_to_iso(community.created_at),
            servers: server_map.remove(&community.id).unwrap_or_default(),
        })
        .collect())
}

pub(crate) async fn create_community(
    pool: &MySqlPool,
    name: String,
    operator_id: Option<String>,
) -> AppResult<Community> {
    require_non_empty(&name, "请输入社区名称")?;

    let community = Community {
        id: prefixed_id("community"),
        name: name.trim().to_string(),
        created_at: now_iso(),
        servers: vec![],
    };

    sqlx::query("INSERT INTO communities (id, name, created_at) VALUES (?, ?, ?)")
        .bind(&community.id)
        .bind(&community.name)
        .bind(iso_to_mysql(&community.created_at))
        .execute(pool)
        .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "community_created",
        format!("新增社区 “{}”。", community.name),
        &operator,
    )
    .await?;

    Ok(community)
}

pub(crate) async fn update_community(
    pool: &MySqlPool,
    redis: &RedisClient,
    community_id: &str,
    name: String,
    operator_id: Option<String>,
) -> AppResult<Community> {
    require_non_empty(&name, "请输入社区名称")?;

    let existing = sqlx::query_as::<_, DbCommunity>("SELECT * FROM communities WHERE id = ?")
        .bind(community_id)
        .fetch_optional(pool)
        .await?;

    let existing = existing.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标社区"))?;
    let next_name = name.trim().to_string();

    if existing.name == next_name {
        return load_community_by_id(pool, redis, community_id).await;
    }

    sqlx::query("UPDATE communities SET name = ? WHERE id = ?")
        .bind(&next_name)
        .bind(community_id)
        .execute(pool)
        .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "community_updated",
        format!("将社区 “{}” 重命名为 “{}”。", existing.name, next_name),
        &operator,
    )
    .await?;

    load_community_by_id(pool, redis, community_id).await
}

pub(crate) async fn delete_community(
    pool: &MySqlPool,
    community_id: &str,
    operator_id: Option<String>,
) -> AppResult<()> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let community = require_community_name(pool, community_id).await?;

    sqlx::query("DELETE FROM communities WHERE id = ?")
        .bind(community_id)
        .execute(pool)
        .await?;

    append_operation_log(
        pool,
        "community_deleted",
        format!("删除了社区 “{}”。", community.name),
        &operator,
    )
    .await?;

    Ok(())
}

pub(crate) async fn verify_server_rcon(
    pool: &MySqlPool,
    community_id: &str,
    draft: ServerDraft,
) -> AppResult<RconVerificationResult> {
    let _community = require_community_name(pool, community_id).await?;
    let verified_at = verify_server_draft_connection(&draft).await?;

    Ok(RconVerificationResult { verified_at })
}

pub(crate) async fn create_server(
    pool: &MySqlPool,
    community_id: &str,
    draft: ServerDraft,
    operator_id: Option<String>,
) -> AppResult<Server> {
    validate_server_fields(
        Some(&draft.name),
        &draft.ip,
        draft.port,
        &draft.rcon_password,
        draft.min_entry_rating,
        draft.min_steam_level,
    )?;

    let community = require_community_name(pool, community_id).await?;
    let verified_at = verify_server_draft_connection(&draft).await?;

    let server = Server {
        id: prefixed_id("server"),
        name: draft.name.trim().to_string(),
        ip: draft.ip.trim().to_string(),
        port: draft.port,
        rcon_password: draft.rcon_password,
        plugin_token: generate_plugin_token(),
        rcon_verified_at: verified_at.clone(),
        whitelist_enabled: draft.whitelist_enabled,
        entry_verification_enabled: draft.entry_verification_enabled,
        min_entry_rating: draft.min_entry_rating,
        min_steam_level: draft.min_steam_level,
        player_reported_at: None,
        online_players: vec![],
    };

    sqlx::query(
        r#"
        INSERT INTO servers (
          id, community_id, name, ip, port, rcon_password, plugin_token, rcon_verified_at, whitelist_enabled, entry_verification_enabled, min_entry_rating, min_steam_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&server.id)
    .bind(community_id)
    .bind(&server.name)
    .bind(&server.ip)
    .bind(server.port)
    .bind(&server.rcon_password)
    .bind(&server.plugin_token)
    .bind(iso_to_mysql(&server.rcon_verified_at))
    .bind(bool_to_i32(server.whitelist_enabled))
    .bind(bool_to_i32(server.entry_verification_enabled))
    .bind(server.min_entry_rating)
    .bind(server.min_steam_level)
    .execute(pool)
    .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_created",
        format!(
            "向社区 “{}” 添加服务器 {}（{}:{}），并完成 RCON 校验。{}",
            community.name,
            server.name,
            server.ip,
            server.port,
            if server.entry_verification_enabled {
                format!(
                    " 进服验证门槛：最低 rating {}，最低 Steam 等级 {}。",
                    server.min_entry_rating, server.min_steam_level
                )
            } else {
                String::new()
            }
        ),
        &operator,
    )
    .await?;

    Ok(server)
}

pub(crate) async fn update_server_settings(
    pool: &MySqlPool,
    redis: &RedisClient,
    community_id: &str,
    server_id: &str,
    draft: ServerSettingsDraft,
    operator_id: Option<String>,
) -> AppResult<Server> {
    validate_server_fields(
        None,
        &draft.ip,
        draft.port,
        &draft.rcon_password,
        draft.min_entry_rating,
        draft.min_steam_level,
    )?;

    let existing_server = sqlx::query_as::<_, DbServer>(
        r#"
        SELECT s.*
        FROM servers s
        WHERE s.id = ? AND s.community_id = ?
        "#,
    )
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(pool)
    .await?;

    let existing_server =
        existing_server.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标服务器"))?;
    let verified_at = verify_server_settings_connection(&existing_server.name, &draft).await?;

    sqlx::query(
        r#"
        UPDATE servers
           SET ip = ?, port = ?, rcon_password = ?, rcon_verified_at = ?, whitelist_enabled = ?, entry_verification_enabled = ?, min_entry_rating = ?, min_steam_level = ?
         WHERE id = ? AND community_id = ?
        "#,
    )
    .bind(draft.ip.trim())
    .bind(draft.port)
    .bind(&draft.rcon_password)
    .bind(iso_to_mysql(&verified_at))
    .bind(bool_to_i32(draft.whitelist_enabled))
    .bind(bool_to_i32(draft.entry_verification_enabled))
    .bind(draft.min_entry_rating)
    .bind(draft.min_steam_level)
    .bind(server_id)
    .bind(community_id)
    .execute(pool)
    .await?;

    let snapshot = server_presence::load_server_players_snapshot(redis, server_id).await?;

    let community = require_community_name(pool, community_id).await?;
    let community_name = community.name.clone();
    let server = Server {
        id: existing_server.id,
        name: existing_server.name,
        ip: draft.ip.trim().to_string(),
        port: draft.port,
        rcon_password: draft.rcon_password,
        plugin_token: existing_server.plugin_token,
        rcon_verified_at: verified_at,
        whitelist_enabled: draft.whitelist_enabled,
        entry_verification_enabled: draft.entry_verification_enabled,
        min_entry_rating: draft.min_entry_rating,
        min_steam_level: draft.min_steam_level,
        player_reported_at: snapshot.reported_at.clone(),
        online_players: snapshot.players,
    };

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_updated",
        format!(
            "更新了社区 “{}” 下服务器 {} 的连接参数为 {}:{}，白名单{}，进服验证{}。{}",
            community_name,
            server.name,
            server.ip,
            server.port,
            if server.whitelist_enabled {
                "开启"
            } else {
                "关闭"
            },
            if server.entry_verification_enabled {
                "开启"
            } else {
                "关闭"
            },
            if server.entry_verification_enabled {
                format!(
                    " 进服验证门槛：最低 rating {}，最低 Steam 等级 {}。",
                    server.min_entry_rating, server.min_steam_level
                )
            } else {
                String::new()
            }
        ),
        &operator,
    )
    .await?;

    Ok(server)
}


pub(crate) async fn reset_server_plugin_token(
    pool: &MySqlPool,
    redis: &RedisClient,
    community_id: &str,
    server_id: &str,
    operator_id: Option<String>,
) -> AppResult<Server> {
    let existing_server = sqlx::query_as::<_, DbServer>(
        r#"
        SELECT s.*
          FROM servers s
         WHERE s.id = ? AND s.community_id = ?
        "#,
    )
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(pool)
    .await?;

    let existing_server =
        existing_server.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标服务器"))?;
    let community = require_community_name(pool, community_id).await?;
    let next_plugin_token = generate_plugin_token();

    sqlx::query(
        r#"
        UPDATE servers
           SET plugin_token = ?
         WHERE id = ? AND community_id = ?
        "#,
    )
    .bind(&next_plugin_token)
    .bind(server_id)
    .bind(community_id)
    .execute(pool)
    .await?;

    let snapshot = server_presence::load_server_players_snapshot(redis, server_id).await?;
    let server = Server {
        id: existing_server.id,
        name: existing_server.name,
        ip: existing_server.ip,
        port: existing_server.port,
        rcon_password: existing_server.rcon_password,
        plugin_token: next_plugin_token,
        rcon_verified_at: naive_to_iso(existing_server.rcon_verified_at),
        whitelist_enabled: existing_server.whitelist_enabled != 0,
        entry_verification_enabled: existing_server.entry_verification_enabled != 0,
        min_entry_rating: existing_server.min_entry_rating,
        min_steam_level: existing_server.min_steam_level,
        player_reported_at: snapshot.reported_at.clone(),
        online_players: snapshot.players,
    };

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_plugin_token_reset",
        format!(
            "重置了社区 “{}” 下服务器 {} 的 Plugin Token，请同步更新游戏服共享配置。",
            community.name, server.name
        ),
        &operator,
    )
    .await?;

    Ok(server)
}

pub(crate) async fn delete_server(
    pool: &MySqlPool,
    community_id: &str,
    server_id: &str,
    operator_id: Option<String>,
) -> AppResult<()> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let server = sqlx::query_as::<_, DbServerDeleteTarget>(
        r#"
        SELECT s.name, s.ip, s.port, c.name AS community_name
          FROM servers s
          INNER JOIN communities c ON c.id = s.community_id
         WHERE s.id = ? AND s.community_id = ?
        "#,
    )
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(pool)
    .await?;

    let server =
        server.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标服务器"))?;

    sqlx::query("DELETE FROM servers WHERE id = ? AND community_id = ?")
        .bind(server_id)
        .bind(community_id)
        .execute(pool)
        .await?;

    append_operation_log(
        pool,
        "server_deleted",
        format!(
            "删除了社区 “{}” 下的服务器 {}（{}:{}）。",
            server.community_name, server.name, server.ip, server.port
        ),
        &operator,
    )
    .await?;

    Ok(())
}

pub(crate) async fn kick_server_player(
    pool: &MySqlPool,
    redis: &RedisClient,
    ttl_seconds: u64,
    community_id: &str,
    server_id: &str,
    player_id: &str,
    reason: String,
    operator_id: Option<String>,
) -> AppResult<()> {
    require_non_empty(&reason, "请输入踢出理由")?;

    let target =
        server_presence::resolve_live_player_target(pool, redis, community_id, server_id, player_id)
            .await?;

    let command = format!(
        "kzguard_kick_userid {} {}",
        target.player.user_id,
        quote_rcon_argument(reason.trim()),
    );

    let response = execute_rcon_command(
        &target.ip,
        target.port,
        &target.rcon_password,
        &command,
    )
    .await
    .map_err(|message| AppError::http(StatusCode::BAD_REQUEST, message))?;

    ensure_kzguard_command_available(&response)?;
    server_presence::remove_player_from_snapshot(redis, ttl_seconds, server_id, player_id).await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_player_kicked",
        format!(
            "从服务器 {} 踢出了玩家 {}。原因：{}",
            target.server_name,
            target.player.nickname,
            reason.trim()
        ),
        &operator,
    )
    .await?;

    Ok(())
}

pub(crate) fn ensure_kzguard_command_available(response: &str) -> AppResult<()> {
    let normalized = response.to_ascii_lowercase();
    if normalized.contains("unknown command") || normalized.contains("not found") {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "服务器尚未安装或启用 KZ Guard SourceMod 插件命令",
        ));
    }

    Ok(())
}

pub(crate) fn quote_rcon_argument(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{}\"", escaped)
}
