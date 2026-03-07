use crate::{
    application::{
        admins::get_operator_snapshot, mappers::map_server_player,
        operation_logs::append_operation_log,
    },
    domain::{db::*, models::*},
    error::{AppError, AppResult},
    http::requests::{ServerDraft, ServerSettingsDraft},
    support::{
        convert::bool_to_i32,
        ids::prefixed_id,
        rcon::verify_rcon_connection,
        time::{iso_to_mysql, naive_to_iso, now_iso},
        validation::{require_non_empty, validate_server_fields},
    },
};
use axum::http::StatusCode;
use sqlx::MySqlPool;
use std::collections::HashMap;

pub(crate) async fn list_communities(pool: &MySqlPool) -> AppResult<Vec<Community>> {
    let community_rows =
        sqlx::query_as::<_, DbCommunity>("SELECT * FROM communities ORDER BY created_at DESC")
            .fetch_all(pool)
            .await?;

    let server_rows =
        sqlx::query_as::<_, DbServer>("SELECT * FROM servers ORDER BY rcon_verified_at DESC")
            .fetch_all(pool)
            .await?;

    let player_rows = sqlx::query_as::<_, DbServerPlayer>(
        "SELECT * FROM server_players ORDER BY connected_at DESC",
    )
    .fetch_all(pool)
    .await?;

    let mut player_map: HashMap<String, Vec<ServerPlayer>> = HashMap::new();
    for player in player_rows {
        player_map
            .entry(player.server_id.clone())
            .or_default()
            .push(map_server_player(player));
    }

    let mut server_map: HashMap<String, Vec<Server>> = HashMap::new();
    for server in server_rows {
        let online_players = player_map.remove(&server.id).unwrap_or_default();
        server_map
            .entry(server.community_id.clone())
            .or_default()
            .push(Server {
                id: server.id,
                name: server.name,
                ip: server.ip,
                port: server.port,
                rcon_password: server.rcon_password,
                rcon_verified_at: naive_to_iso(server.rcon_verified_at),
                whitelist_enabled: server.whitelist_enabled != 0,
                entry_verification_enabled: server.entry_verification_enabled != 0,
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
    )?;

    let community =
        sqlx::query_as::<_, DbCommunityName>("SELECT name FROM communities WHERE id = ?")
            .bind(community_id)
            .fetch_optional(pool)
            .await?;

    let community =
        community.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标社区"))?;

    if !verify_rcon_connection(&draft).await {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "RCON 校验失败，请检查服务器信息",
        ));
    }

    let server = Server {
        id: prefixed_id("server"),
        name: draft.name.trim().to_string(),
        ip: draft.ip.trim().to_string(),
        port: draft.port,
        rcon_password: draft.rcon_password,
        rcon_verified_at: now_iso(),
        whitelist_enabled: draft.whitelist_enabled,
        entry_verification_enabled: draft.entry_verification_enabled,
        online_players: vec![],
    };

    sqlx::query(
        r#"
        INSERT INTO servers (
          id, community_id, name, ip, port, rcon_password, rcon_verified_at, whitelist_enabled, entry_verification_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&server.id)
    .bind(community_id)
    .bind(&server.name)
    .bind(&server.ip)
    .bind(server.port)
    .bind(&server.rcon_password)
    .bind(iso_to_mysql(&server.rcon_verified_at))
    .bind(bool_to_i32(server.whitelist_enabled))
    .bind(bool_to_i32(server.entry_verification_enabled))
    .execute(pool)
    .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_created",
        format!(
            "向社区 “{}” 添加服务器 {}（{}:{}），并完成 RCON 校验。",
            community.name, server.name, server.ip, server.port
        ),
        &operator,
    )
    .await?;

    Ok(server)
}

pub(crate) async fn update_server_settings(
    pool: &MySqlPool,
    community_id: &str,
    server_id: &str,
    draft: ServerSettingsDraft,
    operator_id: Option<String>,
) -> AppResult<Server> {
    validate_server_fields(None, &draft.ip, draft.port, &draft.rcon_password)?;

    let existing_server = sqlx::query_as::<_, DbServerWithCommunity>(
        r#"
        SELECT s.id, s.name, c.name AS community_name
        FROM servers s
        INNER JOIN communities c ON c.id = s.community_id
        WHERE s.id = ? AND s.community_id = ?
        "#,
    )
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(pool)
    .await?;

    let existing_server =
        existing_server.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标服务器"))?;
    let verified_at = now_iso();

    sqlx::query(
        r#"
        UPDATE servers
           SET ip = ?, port = ?, rcon_password = ?, rcon_verified_at = ?, whitelist_enabled = ?, entry_verification_enabled = ?
         WHERE id = ? AND community_id = ?
        "#,
    )
    .bind(draft.ip.trim())
    .bind(draft.port)
    .bind(&draft.rcon_password)
    .bind(iso_to_mysql(&verified_at))
    .bind(bool_to_i32(draft.whitelist_enabled))
    .bind(bool_to_i32(draft.entry_verification_enabled))
    .bind(server_id)
    .bind(community_id)
    .execute(pool)
    .await?;

    let player_rows = sqlx::query_as::<_, DbServerPlayer>(
        "SELECT * FROM server_players WHERE server_id = ? ORDER BY connected_at DESC",
    )
    .bind(server_id)
    .fetch_all(pool)
    .await?;

    let community_name = existing_server.community_name.clone();
    let server = Server {
        id: existing_server.id,
        name: existing_server.name,
        ip: draft.ip.trim().to_string(),
        port: draft.port,
        rcon_password: draft.rcon_password,
        rcon_verified_at: verified_at,
        whitelist_enabled: draft.whitelist_enabled,
        entry_verification_enabled: draft.entry_verification_enabled,
        online_players: player_rows.into_iter().map(map_server_player).collect(),
    };

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_updated",
        format!(
            "更新了社区 “{}” 下服务器 {} 的连接参数为 {}:{}，白名单{}，进服验证{}。",
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
            }
        ),
        &operator,
    )
    .await?;

    Ok(server)
}

pub(crate) async fn kick_server_player(
    pool: &MySqlPool,
    community_id: &str,
    server_id: &str,
    player_id: &str,
    reason: String,
    operator_id: Option<String>,
) -> AppResult<()> {
    require_non_empty(&reason, "请输入踢出理由")?;

    let target = sqlx::query_as::<_, DbKickTarget>(
        r#"
        SELECT sp.nickname, s.name AS server_name
          FROM server_players sp
          INNER JOIN servers s ON s.id = sp.server_id
         WHERE sp.id = ? AND sp.server_id = ? AND s.community_id = ?
        "#,
    )
    .bind(player_id)
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(pool)
    .await?;

    let target = target.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标玩家"))?;

    sqlx::query("DELETE FROM server_players WHERE id = ? AND server_id = ?")
        .bind(player_id)
        .bind(server_id)
        .execute(pool)
        .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_player_kicked",
        format!(
            "从服务器 {} 踢出了玩家 {}。原因：{}",
            target.server_name,
            target.nickname,
            reason.trim()
        ),
        &operator,
    )
    .await?;

    Ok(())
}
