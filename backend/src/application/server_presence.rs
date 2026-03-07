use crate::{
    domain::{
        db::{DbLiveServerTarget, DbServerPresenceAuth},
        models::{ServerPlayer, ServerPlayersSnapshot, ServerPresenceReceipt},
    },
    error::{AppError, AppResult},
    http::requests::{ServerPresencePlayerReport, ServerPresenceReportBody},
    support::{
        convert::trim_to_none,
        time::{datetime_to_iso, now_utc, seconds_ago_from},
    },
};
use axum::http::StatusCode;
use redis::Client as RedisClient;
use sqlx::MySqlPool;
use std::collections::HashMap;

const PLAYER_PRESENCE_KEY_PREFIX: &str = "kzguard:server:presence:";

#[derive(Debug, Clone)]
pub(crate) struct LiveServerPlayerTarget {
    pub(crate) server_name: String,
    pub(crate) community_name: String,
    pub(crate) ip: String,
    pub(crate) port: i32,
    pub(crate) rcon_password: String,
    pub(crate) player: ServerPlayer,
}

pub(crate) async fn report_server_presence(
    pool: &MySqlPool,
    redis: &RedisClient,
    ttl_seconds: u64,
    body: ServerPresenceReportBody,
    provided_plugin_token: &str,
) -> AppResult<ServerPresenceReceipt> {
    let server_id = body.server_id.trim();
    if server_id.is_empty() {
        return Err(AppError::http(StatusCode::BAD_REQUEST, "缺少服务器 ID"));
    }

    if body.players.len() > 128 {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "单次上报玩家数量过多，请检查插件上报内容",
        ));
    }

    let server = sqlx::query_as::<_, DbServerPresenceAuth>(
        "SELECT id, plugin_token FROM servers WHERE id = ?",
    )
    .bind(server_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到对应服务器，请确认 serverId 配置"))?;

    if server.plugin_token.trim() != provided_plugin_token.trim() {
        return Err(AppError::http(StatusCode::UNAUTHORIZED, "服务器 plugin_token 校验失败"));
    }

    let now = now_utc();
    let reported_at = datetime_to_iso(now);
    let players = body
        .players
        .into_iter()
        .map(|player| normalize_player_report(player, now, &reported_at))
        .collect::<Vec<_>>();

    let snapshot = ServerPlayersSnapshot {
        server_id: server_id.to_string(),
        reported_at: Some(reported_at.clone()),
        player_count: players.len(),
        players,
    };

    save_snapshot(redis, ttl_seconds, &snapshot).await?;

    Ok(ServerPresenceReceipt {
        server_id: server.id,
        reported_at,
        player_count: snapshot.player_count,
    })
}

pub(crate) async fn get_server_players_snapshot(
    pool: &MySqlPool,
    redis: &RedisClient,
    community_id: &str,
    server_id: &str,
) -> AppResult<ServerPlayersSnapshot> {
    ensure_server_belongs_to_community(pool, community_id, server_id).await?;
    load_server_players_snapshot(redis, server_id).await
}

pub(crate) async fn load_server_players_snapshot(
    redis: &RedisClient,
    server_id: &str,
) -> AppResult<ServerPlayersSnapshot> {
    let mut connection = redis.get_multiplexed_async_connection().await?;
    let payload = redis::cmd("GET")
        .arg(snapshot_key(server_id))
        .query_async::<Option<String>>(&mut connection)
        .await?;

    match payload {
        Some(payload) => Ok(serde_json::from_str::<ServerPlayersSnapshot>(&payload).unwrap_or_else(
            |_| empty_snapshot(server_id),
        )),
        None => Ok(empty_snapshot(server_id)),
    }
}

pub(crate) async fn load_snapshots_by_server_ids(
    redis: &RedisClient,
    server_ids: &[String],
) -> AppResult<HashMap<String, ServerPlayersSnapshot>> {
    if server_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let keys = server_ids.iter().map(|server_id| snapshot_key(server_id)).collect::<Vec<_>>();
    let mut connection = redis.get_multiplexed_async_connection().await?;
    let values = redis::cmd("MGET")
        .arg(keys)
        .query_async::<Vec<Option<String>>>(&mut connection)
        .await?;

    let mut snapshots = HashMap::with_capacity(server_ids.len());

    for (server_id, payload) in server_ids.iter().zip(values.into_iter()) {
        if let Some(payload) = payload {
            let snapshot = serde_json::from_str::<ServerPlayersSnapshot>(&payload)
                .unwrap_or_else(|_| empty_snapshot(server_id));
            snapshots.insert(server_id.clone(), snapshot);
        }
    }

    Ok(snapshots)
}

pub(crate) async fn resolve_live_player_target(
    pool: &MySqlPool,
    redis: &RedisClient,
    community_id: &str,
    server_id: &str,
    player_id: &str,
) -> AppResult<LiveServerPlayerTarget> {
    let server = sqlx::query_as::<_, DbLiveServerTarget>(
        r#"
        SELECT s.name, c.name AS community_name, s.ip, s.port, s.rcon_password
          FROM servers s
          INNER JOIN communities c ON c.id = s.community_id
         WHERE s.id = ? AND s.community_id = ?
        "#,
    )
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标服务器"))?;

    let snapshot = load_server_players_snapshot(redis, server_id).await?;
    let player = snapshot
        .players
        .into_iter()
        .find(|player| player.id == player_id)
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标玩家或玩家已离线"))?;

    Ok(LiveServerPlayerTarget {
        server_name: server.name,
        community_name: server.community_name,
        ip: server.ip,
        port: server.port,
        rcon_password: server.rcon_password,
        player,
    })
}

pub(crate) async fn remove_player_from_snapshot(
    redis: &RedisClient,
    ttl_seconds: u64,
    server_id: &str,
    player_id: &str,
) -> AppResult<()> {
    let mut snapshot = load_server_players_snapshot(redis, server_id).await?;
    snapshot.players.retain(|player| player.id != player_id);
    snapshot.player_count = snapshot.players.len();
    save_snapshot(redis, ttl_seconds, &snapshot).await?;
    Ok(())
}

async fn save_snapshot(
    redis: &RedisClient,
    ttl_seconds: u64,
    snapshot: &ServerPlayersSnapshot,
) -> AppResult<()> {
    let payload = serde_json::to_string(snapshot)?;
    let mut connection = redis.get_multiplexed_async_connection().await?;
    redis::cmd("SET")
        .arg(snapshot_key(&snapshot.server_id))
        .arg(payload)
        .arg("EX")
        .arg(ttl_seconds)
        .query_async::<()>(&mut connection)
        .await?;
    Ok(())
}

async fn ensure_server_belongs_to_community(
    pool: &MySqlPool,
    community_id: &str,
    server_id: &str,
) -> AppResult<()> {
    let exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM servers WHERE id = ? AND community_id = ?",
    )
    .bind(server_id)
    .bind(community_id)
    .fetch_one(pool)
    .await?;

    if exists == 0 {
        return Err(AppError::http(StatusCode::NOT_FOUND, "未找到目标服务器"));
    }

    Ok(())
}

fn normalize_player_report(
    player: ServerPresencePlayerReport,
    now: chrono::DateTime<chrono::Utc>,
    reported_at: &str,
) -> ServerPlayer {
    let steam_id = player.steam_id.trim().to_string();
    let steam_id64 = trim_to_none(player.steam_id64);
    let steam_id3 = trim_to_none(player.steam_id3);
    let fallback_id = if !steam_id.is_empty() {
        steam_id.clone()
    } else {
        format!("userid-{}", player.user_id)
    };

    ServerPlayer {
        id: steam_id64.clone().unwrap_or(fallback_id),
        user_id: player.user_id,
        nickname: if player.nickname.trim().is_empty() {
            format!("玩家#{}", player.user_id)
        } else {
            player.nickname.trim().to_string()
        },
        steam_id: if steam_id.is_empty() {
            "UNKNOWN".to_string()
        } else {
            steam_id
        },
        steam_id64,
        steam_id3,
        ip_address: trim_to_none(player.ip_address).unwrap_or_else(|| "未知 IP".to_string()),
        connected_at: seconds_ago_from(now, player.connected_seconds),
        ping: player.ping.max(0),
        last_reported_at: Some(reported_at.to_string()),
    }
}

fn empty_snapshot(server_id: &str) -> ServerPlayersSnapshot {
    ServerPlayersSnapshot {
        server_id: server_id.to_string(),
        reported_at: None,
        player_count: 0,
        players: vec![],
    }
}

fn snapshot_key(server_id: &str) -> String {
    format!("{}{server_id}", PLAYER_PRESENCE_KEY_PREFIX)
}
