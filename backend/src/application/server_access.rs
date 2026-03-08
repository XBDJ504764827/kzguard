use crate::{
    config::AccessControlConfig,
    domain::{
        db::{DbServerAccessTarget, DbWhitelistPlayer},
        models::{
            PlayerAccessProfile, ResolvedSteamIdentifiers, ServerAccessDecision,
            ServerAccessPlayer, ServerAccessSnapshot,
        },
    },
    error::{AppError, AppResult},
    support::{
        steam::{fetch_gokz_rating, fetch_steam_level, resolve_steam_identifiers_strict},
        time::now_iso,
    },
};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use redis::Client as RedisClient;
use reqwest::Client as HttpClient;
use sqlx::MySqlPool;
use std::collections::{HashMap, HashSet};

const SERVER_ACCESS_SNAPSHOT_KEY_PREFIX: &str = "kzguard:server:access:snapshot:";
const PLAYER_ACCESS_PROFILE_KEY_PREFIX: &str = "kzguard:player:access:profile:";

#[derive(Debug, Clone)]
pub(crate) struct AccessCheckInput {
    pub(crate) steam_id64: String,
    pub(crate) steam_id: Option<String>,
    pub(crate) steam_id3: Option<String>,
    pub(crate) nickname: Option<String>,
    pub(crate) ip_address: Option<String>,
}

#[derive(Debug, Clone)]
struct AccessCandidate {
    steam_id64: String,
    steam_id: String,
    steam_id3: String,
    nickname: Option<String>,
    ip_address: Option<String>,
}


#[derive(Debug, Clone)]
struct ApprovedWhitelistAccess {
    nickname: String,
    allowed_server_ids: Option<HashSet<String>>,
}

pub(crate) async fn refresh_all_server_access_snapshots(
    pool: &MySqlPool,
    redis: &RedisClient,
    http_client: &HttpClient,
    config: &AccessControlConfig,
) -> AppResult<()> {
    let servers = load_all_server_access_targets(pool).await?;
    let whitelist_map = load_approved_whitelist_access_map(pool).await?;

    for server in servers {
        refresh_server_access_snapshot_with_whitelist_map(
            redis,
            http_client,
            config,
            server,
            &whitelist_map,
        )
        .await?;
    }

    Ok(())
}

pub(crate) async fn refresh_whitelist_restriction_player_access(
    pool: &MySqlPool,
    redis: &RedisClient,
    http_client: &HttpClient,
    config: &AccessControlConfig,
    player_id: &str,
) -> AppResult<()> {
    let servers = load_all_server_access_targets(pool).await?;
    let whitelist_map = load_approved_whitelist_access_map(pool).await?;
    let candidate = load_approved_whitelist_access_candidate(pool, player_id).await?;
    let whitelist_access = whitelist_map.get(&candidate.steam_id64);

    for server in servers {
        let player = resolve_server_access_player(
            redis,
            http_client,
            config,
            &server,
            candidate.clone(),
            whitelist_access,
        )
        .await?;
        upsert_server_access_snapshot_player(redis, &server, player).await?;
    }

    Ok(())
}

pub(crate) async fn refresh_server_access_snapshot(
    pool: &MySqlPool,
    redis: &RedisClient,
    http_client: &HttpClient,
    config: &AccessControlConfig,
    server_id: &str,
) -> AppResult<ServerAccessSnapshot> {
    let server = load_server_access_target(pool, server_id).await?;
    let whitelist_map = load_approved_whitelist_access_map(pool).await?;

    refresh_server_access_snapshot_with_whitelist_map(redis, http_client, config, server, &whitelist_map)
        .await
}

async fn refresh_server_access_snapshot_with_whitelist_map(
    redis: &RedisClient,
    http_client: &HttpClient,
    config: &AccessControlConfig,
    server: DbServerAccessTarget,
    whitelist_map: &HashMap<String, ApprovedWhitelistAccess>,
) -> AppResult<ServerAccessSnapshot> {
    let previous_snapshot = load_cached_server_access_snapshot(redis, &server.id).await?;
    let live_snapshot =
        crate::application::server_presence::load_server_players_snapshot(redis, &server.id).await?;

    let mut candidates = HashMap::<String, AccessCandidate>::new();

    for (steam_id64, access) in whitelist_map {
        candidates.insert(
            steam_id64.clone(),
            AccessCandidate {
                steam_id64: steam_id64.clone(),
                steam_id: String::new(),
                steam_id3: String::new(),
                nickname: Some(access.nickname.clone()),
                ip_address: None,
            },
        );
    }

    for player in previous_snapshot
        .as_ref()
        .map(|snapshot| snapshot.players.clone())
        .unwrap_or_default()
    {
        upsert_candidate(
            &mut candidates,
            AccessCandidate {
                steam_id64: player.steam_id64,
                steam_id: player.steam_id,
                steam_id3: player.steam_id3,
                nickname: Some(player.nickname),
                ip_address: player.ip_address,
            },
        );
    }

    for player in live_snapshot.players {
        let identifiers = match player
            .steam_id64
            .clone()
            .filter(|value| !value.trim().is_empty())
        {
            Some(steam_id64) => ResolvedSteamIdentifiers {
                steam_id64,
                steam_id: player.steam_id.clone(),
                steam_id3: player.steam_id3.clone().unwrap_or_default(),
            },
            None => match resolve_steam_identifiers_strict(&player.steam_id) {
                Ok(value) => value,
                Err(_) => continue,
            },
        };

        upsert_candidate(
            &mut candidates,
            AccessCandidate {
                steam_id64: identifiers.steam_id64,
                steam_id: if identifiers.steam_id.is_empty() {
                    player.steam_id.clone()
                } else {
                    identifiers.steam_id
                },
                steam_id3: if identifiers.steam_id3.is_empty() {
                    player.steam_id3.unwrap_or_default()
                } else {
                    identifiers.steam_id3
                },
                nickname: Some(player.nickname),
                ip_address: Some(player.ip_address),
            },
        );
    }

    let mut players = Vec::with_capacity(candidates.len());

    for candidate in candidates.into_values() {
        let whitelist_access = whitelist_map.get(&candidate.steam_id64);
        players.push(
            resolve_server_access_player(
                redis,
                http_client,
                config,
                &server,
                candidate,
                whitelist_access,
            )
            .await?,
        );
    }

    players.sort_by(|left, right| {
        right
            .is_whitelisted
            .cmp(&left.is_whitelisted)
            .then_with(|| right.can_join.cmp(&left.can_join))
            .then_with(|| left.nickname.cmp(&right.nickname))
            .then_with(|| left.steam_id64.cmp(&right.steam_id64))
    });

    let snapshot = ServerAccessSnapshot {
        server_id: server.id,
        server_name: server.name,
        community_name: server.community_name,
        generated_at: now_iso(),
        whitelist_enabled: server.whitelist_enabled != 0,
        entry_verification_enabled: server.entry_verification_enabled != 0,
        min_entry_rating: server.min_entry_rating,
        min_steam_level: server.min_steam_level,
        players,
    };

    save_server_access_snapshot(redis, &snapshot).await?;
    Ok(snapshot)
}

pub(crate) async fn sync_server_access_snapshot_for_server(
    pool: &MySqlPool,
    redis: &RedisClient,
    http_client: &HttpClient,
    config: &AccessControlConfig,
    server_id: &str,
    provided_plugin_token: &str,
) -> AppResult<ServerAccessSnapshot> {
    authenticate_server(pool, server_id, provided_plugin_token).await?;
    refresh_server_access_snapshot(pool, redis, http_client, config, server_id).await
}

pub(crate) async fn check_player_access_for_server(
    pool: &MySqlPool,
    redis: &RedisClient,
    http_client: &HttpClient,
    config: &AccessControlConfig,
    server_id: &str,
    provided_plugin_token: &str,
    input: AccessCheckInput,
) -> AppResult<ServerAccessDecision> {
    let server = authenticate_server(pool, server_id, provided_plugin_token).await?;
    let whitelist_map = load_approved_whitelist_access_map(pool).await?;
    let candidate = normalize_access_check_input(input)?;

    let player = resolve_server_access_player(
        redis,
        http_client,
        config,
        &server,
        candidate.clone(),
        whitelist_map.get(&candidate.steam_id64),
    )
    .await?;

    upsert_server_access_snapshot_player(redis, &server, player.clone()).await?;

    Ok(ServerAccessDecision {
        server_id: server.id,
        steam_id64: player.steam_id64.clone(),
        can_join: player.can_join,
        is_whitelisted: player.is_whitelisted,
        meets_entry_verification: player.meets_entry_verification,
        message: player.message,
        source: "server-access-cache".to_string(),
    })
}

pub(crate) async fn remove_server_access_snapshot(
    redis: &RedisClient,
    server_id: &str,
) -> AppResult<()> {
    let mut connection = redis.get_multiplexed_async_connection().await?;
    redis::cmd("DEL")
        .arg(server_access_snapshot_key(server_id))
        .query_async::<()>(&mut connection)
        .await?;
    Ok(())
}

pub(crate) fn render_server_access_snapshot_as_keyvalues(snapshot: &ServerAccessSnapshot) -> String {
    let mut body = String::new();
    body.push_str("\"KZGuardAccess\"\n{\n");
    append_kv_line(&mut body, 1, "generatedAt", &snapshot.generated_at);
    append_kv_line(&mut body, 1, "serverId", &snapshot.server_id);
    append_kv_line(&mut body, 1, "serverName", &snapshot.server_name);
    append_kv_line(&mut body, 1, "communityName", &snapshot.community_name);
    append_kv_line(
        &mut body,
        1,
        "whitelistEnabled",
        if snapshot.whitelist_enabled { "1" } else { "0" },
    );
    append_kv_line(
        &mut body,
        1,
        "entryVerificationEnabled",
        if snapshot.entry_verification_enabled { "1" } else { "0" },
    );
    append_kv_line(&mut body, 1, "minEntryRating", &snapshot.min_entry_rating.to_string());
    append_kv_line(&mut body, 1, "minSteamLevel", &snapshot.min_steam_level.to_string());
    body.push_str("\t\"players\"\n\t{\n");

    for player in &snapshot.players {
        body.push_str(&format!("\t\t\"{}\"\n\t\t{{\n", escape_kv(&player.steam_id64)));
        append_kv_line(&mut body, 3, "steamId64", &player.steam_id64);
        append_kv_line(&mut body, 3, "steamId", &player.steam_id);
        append_kv_line(&mut body, 3, "steamId3", &player.steam_id3);
        append_kv_line(&mut body, 3, "nickname", &player.nickname);
        append_kv_line(
            &mut body,
            3,
            "ipAddress",
            player.ip_address.as_deref().unwrap_or(""),
        );
        append_kv_line(
            &mut body,
            3,
            "rating",
            &player
                .rating
                .map(|value| format!("{value:.6}"))
                .unwrap_or_default(),
        );
        append_kv_line(
            &mut body,
            3,
            "steamLevel",
            &player.steam_level.map(|value| value.to_string()).unwrap_or_default(),
        );
        append_kv_line(
            &mut body,
            3,
            "isWhitelisted",
            if player.is_whitelisted { "1" } else { "0" },
        );
        append_kv_line(
            &mut body,
            3,
            "meetsEntryVerification",
            if player.meets_entry_verification { "1" } else { "0" },
        );
        append_kv_line(
            &mut body,
            3,
            "canJoin",
            if player.can_join { "1" } else { "0" },
        );
        append_kv_line(&mut body, 3, "message", &player.message);
        append_kv_line(&mut body, 3, "refreshedAt", &player.refreshed_at);
        body.push_str("\t\t}\n");
    }

    body.push_str("\t}\n}\n");
    body
}

pub(crate) fn render_server_access_decision_as_text(decision: &ServerAccessDecision) -> String {
    let message = decision.message.replace(['\r', '\n'], " ");
    format!(
        "allow={}\nserverId={}\nsteamId64={}\nisWhitelisted={}\nmeetsEntryVerification={}\nsource={}\nmessage={}\n",
        if decision.can_join { 1 } else { 0 },
        decision.server_id,
        decision.steam_id64,
        if decision.is_whitelisted { 1 } else { 0 },
        if decision.meets_entry_verification { 1 } else { 0 },
        decision.source,
        message,
    )
}

async fn resolve_server_access_player(
    redis: &RedisClient,
    http_client: &HttpClient,
    config: &AccessControlConfig,
    server: &DbServerAccessTarget,
    candidate: AccessCandidate,
    whitelist_access: Option<&ApprovedWhitelistAccess>,
) -> AppResult<ServerAccessPlayer> {
    let whitelist_enabled = server.whitelist_enabled != 0;
    let entry_verification_enabled = server.entry_verification_enabled != 0;
    let is_whitelisted = whitelist_access.is_some();
    let restriction_enabled = whitelist_access.and_then(|value| value.allowed_server_ids.as_ref()).is_some();
    let allowed_by_restriction = whitelist_access
        .and_then(|value| value.allowed_server_ids.as_ref())
        .map(|server_ids| server_ids.contains(&server.id))
        .unwrap_or(true);
    let should_resolve_profile = entry_verification_enabled
        && (server.min_entry_rating > 0 || server.min_steam_level > 0);

    let profile = if should_resolve_profile {
        load_or_refresh_player_access_profile(
            redis,
            http_client,
            config,
            &candidate,
            server.min_entry_rating,
            server.min_steam_level,
        )
        .await?
    } else {
        None
    };

    let rating = profile.as_ref().and_then(|value| value.rating);
    let steam_level = profile.as_ref().and_then(|value| value.steam_level);
    let profile_available = !should_resolve_profile
        || (server.min_entry_rating <= 0 || rating.is_some())
            && (server.min_steam_level <= 0 || steam_level.is_some());

    let meets_entry_verification = if entry_verification_enabled {
        meets_entry_requirements(server.min_entry_rating, server.min_steam_level, rating, steam_level)
    } else {
        false
    };

    let base_can_join = match (whitelist_enabled, entry_verification_enabled) {
        (true, true) => is_whitelisted || meets_entry_verification,
        (true, false) => is_whitelisted,
        (false, true) => meets_entry_verification,
        (false, false) => true,
    };
    let can_join = allowed_by_restriction && base_can_join;

    let message = build_access_message(
        whitelist_enabled,
        entry_verification_enabled,
        is_whitelisted,
        meets_entry_verification,
        restriction_enabled,
        allowed_by_restriction,
        profile_available,
        server.min_entry_rating,
        server.min_steam_level,
    );

    Ok(ServerAccessPlayer {
        steam_id64: candidate.steam_id64.clone(),
        steam_id: if candidate.steam_id.is_empty() {
            profile
                .as_ref()
                .map(|value| value.steam_id.clone())
                .unwrap_or_default()
        } else {
            candidate.steam_id.clone()
        },
        steam_id3: if candidate.steam_id3.is_empty() {
            profile
                .as_ref()
                .map(|value| value.steam_id3.clone())
                .unwrap_or_default()
        } else {
            candidate.steam_id3.clone()
        },
        nickname: candidate
            .nickname
            .clone()
            .or_else(|| whitelist_access.map(|value| value.nickname.clone()))
            .or_else(|| profile.as_ref().and_then(|value| value.nickname.clone()))
            .unwrap_or_else(|| candidate.steam_id64.clone()),
        ip_address: candidate.ip_address.clone(),
        rating,
        steam_level,
        is_whitelisted,
        meets_entry_verification,
        can_join,
        message,
        refreshed_at: profile
            .as_ref()
            .map(|value| value.refreshed_at.clone())
            .unwrap_or_else(now_iso),
    })
}

async fn load_or_refresh_player_access_profile(
    redis: &RedisClient,
    http_client: &HttpClient,
    config: &AccessControlConfig,
    candidate: &AccessCandidate,
    min_entry_rating: i32,
    min_steam_level: i32,
) -> AppResult<Option<PlayerAccessProfile>> {
    let cached = load_player_access_profile(redis, &candidate.steam_id64).await?;
    let is_stale = cached
        .as_ref()
        .map(|value| player_profile_is_stale(value, config.player_profile_stale_seconds))
        .unwrap_or(true);
    let need_rating = min_entry_rating > 0
        && cached
            .as_ref()
            .map(|value| value.rating.is_none() || is_stale)
            .unwrap_or(true);
    let need_steam_level = min_steam_level > 0
        && cached
            .as_ref()
            .map(|value| value.steam_level.is_none() || is_stale)
            .unwrap_or(true);

    if !need_rating && !need_steam_level {
        return Ok(cached);
    }

    let mut next_profile = cached.unwrap_or(PlayerAccessProfile {
        steam_id64: candidate.steam_id64.clone(),
        steam_id: candidate.steam_id.clone(),
        steam_id3: candidate.steam_id3.clone(),
        nickname: candidate.nickname.clone(),
        rating: None,
        steam_level: None,
        refreshed_at: now_iso(),
    });
    let mut has_any_data = next_profile.rating.is_some() || next_profile.steam_level.is_some();

    if need_rating {
        match fetch_gokz_rating(http_client, &config.gokz_api_base_url, &candidate.steam_id64).await {
            Ok((nickname, rating)) => {
                next_profile.rating = Some(rating);
                if let Some(nickname) = nickname.filter(|value| !value.trim().is_empty()) {
                    next_profile.nickname = Some(nickname);
                }
                has_any_data = true;
            }
            Err(error) => {
                eprintln!(
                    "failed to refresh gokz rating for {}: {}",
                    candidate.steam_id64, error
                );
            }
        }
    }

    if need_steam_level {
        if let Some(api_key) = config.steam_web_api_key.as_deref() {
            match fetch_steam_level(
                http_client,
                api_key,
                &config.steam_level_api_base_url,
                config.steam_level_api_fallback_base_url.as_deref(),
                &candidate.steam_id64,
            )
            .await
            {
                Ok(steam_level) => {
                    next_profile.steam_level = Some(steam_level);
                    has_any_data = true;
                }
                Err(error) => {
                    eprintln!(
                        "failed to refresh steam level for {}: {}",
                        candidate.steam_id64, error
                    );
                }
            }
        } else {
            eprintln!(
                "steam level api key missing while resolving player {} for entry verification",
                candidate.steam_id64
            );
        }
    }

    if !has_any_data {
        return Ok(None);
    }

    next_profile.refreshed_at = now_iso();
    save_player_access_profile(redis, &next_profile).await?;
    Ok(Some(next_profile))
}

async fn authenticate_server(
    pool: &MySqlPool,
    server_id: &str,
    provided_plugin_token: &str,
) -> AppResult<DbServerAccessTarget> {
    let server = load_server_access_target(pool, server_id).await?;
    if server.plugin_token.trim() != provided_plugin_token.trim() {
        return Err(AppError::http(StatusCode::UNAUTHORIZED, "服务器 plugin_token 校验失败"));
    }
    Ok(server)
}

async fn load_server_access_target(
    pool: &MySqlPool,
    server_id: &str,
) -> AppResult<DbServerAccessTarget> {
    sqlx::query_as::<_, DbServerAccessTarget>(
        r#"
        SELECT s.id,
               s.name,
               c.name AS community_name,
               s.plugin_token,
               s.whitelist_enabled,
               s.entry_verification_enabled,
               s.min_entry_rating,
               s.min_steam_level
          FROM servers s
          INNER JOIN communities c ON c.id = s.community_id
         WHERE s.id = ?
        "#,
    )
    .bind(server_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标服务器"))
}

async fn load_all_server_access_targets(pool: &MySqlPool) -> AppResult<Vec<DbServerAccessTarget>> {
    sqlx::query_as::<_, DbServerAccessTarget>(
        r#"
        SELECT s.id,
               s.name,
               c.name AS community_name,
               s.plugin_token,
               s.whitelist_enabled,
               s.entry_verification_enabled,
               s.min_entry_rating,
               s.min_steam_level
          FROM servers s
          INNER JOIN communities c ON c.id = s.community_id
         ORDER BY s.id ASC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

async fn load_approved_whitelist_access_candidate(
    pool: &MySqlPool,
    player_id: &str,
) -> AppResult<AccessCandidate> {
    let row = sqlx::query_as::<_, DbWhitelistPlayer>(
        "SELECT * FROM whitelist_players WHERE id = ? AND status = 'approved'",
    )
    .bind(player_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标白名单玩家"))?;

    if !row.steam_id64.trim().is_empty() {
        return Ok(AccessCandidate {
            steam_id64: row.steam_id64,
            steam_id: row.steam_id,
            steam_id3: row.steam_id3,
            nickname: Some(row.nickname),
            ip_address: None,
        });
    }

    let identifiers = resolve_steam_identifiers_strict(&row.steam_id)?;

    Ok(AccessCandidate {
        steam_id64: identifiers.steam_id64,
        steam_id: if identifiers.steam_id.is_empty() {
            row.steam_id
        } else {
            identifiers.steam_id
        },
        steam_id3: if identifiers.steam_id3.is_empty() {
            row.steam_id3
        } else {
            identifiers.steam_id3
        },
        nickname: Some(row.nickname),
        ip_address: None,
    })
}

async fn load_approved_whitelist_access_map(
    pool: &MySqlPool,
) -> AppResult<HashMap<String, ApprovedWhitelistAccess>> {
    let rows = sqlx::query_as::<_, DbWhitelistPlayer>(
        "SELECT * FROM whitelist_players WHERE status = 'approved' ORDER BY applied_at DESC",
    )
    .fetch_all(pool)
    .await?;
    let restriction_map = crate::application::whitelist_restrictions::load_restricted_player_allowed_server_ids_by_steam_id64(pool).await?;

    let mut whitelist = HashMap::new();
    for row in rows {
        let allowed_server_ids = if !row.steam_id64.trim().is_empty() {
            restriction_map.get(&row.steam_id64).cloned()
        } else {
            None
        };

        if !row.steam_id64.trim().is_empty() {
            whitelist.entry(row.steam_id64.clone()).or_insert(ApprovedWhitelistAccess {
                nickname: row.nickname.clone(),
                allowed_server_ids,
            });
            continue;
        }

        match resolve_steam_identifiers_strict(&row.steam_id) {
            Ok(identifiers) => {
                let normalized_allowed_server_ids = restriction_map.get(&identifiers.steam_id64).cloned();
                whitelist.entry(identifiers.steam_id64).or_insert(ApprovedWhitelistAccess {
                    nickname: row.nickname.clone(),
                    allowed_server_ids: normalized_allowed_server_ids,
                });
            }
            Err(error) => {
                eprintln!(
                    "failed to normalize whitelist player {} ({}): {}",
                    row.nickname, row.steam_id, error
                );
            }
        }
    }

    Ok(whitelist)
}

async fn load_cached_server_access_snapshot(
    redis: &RedisClient,
    server_id: &str,
) -> AppResult<Option<ServerAccessSnapshot>> {
    let mut connection = redis.get_multiplexed_async_connection().await?;
    let payload = redis::cmd("GET")
        .arg(server_access_snapshot_key(server_id))
        .query_async::<Option<String>>(&mut connection)
        .await?;

    payload
        .map(|value| serde_json::from_str::<ServerAccessSnapshot>(&value))
        .transpose()
        .map_err(Into::into)
}

async fn save_server_access_snapshot(
    redis: &RedisClient,
    snapshot: &ServerAccessSnapshot,
) -> AppResult<()> {
    let payload = serde_json::to_string(snapshot)?;
    let mut connection = redis.get_multiplexed_async_connection().await?;
    redis::cmd("SET")
        .arg(server_access_snapshot_key(&snapshot.server_id))
        .arg(payload)
        .query_async::<()>(&mut connection)
        .await?;
    Ok(())
}

async fn upsert_server_access_snapshot_player(
    redis: &RedisClient,
    server: &DbServerAccessTarget,
    player: ServerAccessPlayer,
) -> AppResult<()> {
    let mut snapshot = load_cached_server_access_snapshot(redis, &server.id).await?.unwrap_or(ServerAccessSnapshot {
        server_id: server.id.clone(),
        server_name: server.name.clone(),
        community_name: server.community_name.clone(),
        generated_at: now_iso(),
        whitelist_enabled: server.whitelist_enabled != 0,
        entry_verification_enabled: server.entry_verification_enabled != 0,
        min_entry_rating: server.min_entry_rating,
        min_steam_level: server.min_steam_level,
        players: Vec::new(),
    });

    if let Some(existing) = snapshot
        .players
        .iter_mut()
        .find(|entry| entry.steam_id64 == player.steam_id64)
    {
        *existing = player;
    } else {
        snapshot.players.push(player);
    }

    snapshot.generated_at = now_iso();
    snapshot.players.sort_by(|left, right| {
        right
            .is_whitelisted
            .cmp(&left.is_whitelisted)
            .then_with(|| right.can_join.cmp(&left.can_join))
            .then_with(|| left.nickname.cmp(&right.nickname))
            .then_with(|| left.steam_id64.cmp(&right.steam_id64))
    });

    save_server_access_snapshot(redis, &snapshot).await
}

async fn load_player_access_profile(
    redis: &RedisClient,
    steam_id64: &str,
) -> AppResult<Option<PlayerAccessProfile>> {
    let mut connection = redis.get_multiplexed_async_connection().await?;
    let payload = redis::cmd("GET")
        .arg(player_access_profile_key(steam_id64))
        .query_async::<Option<String>>(&mut connection)
        .await?;

    payload
        .map(|value| serde_json::from_str::<PlayerAccessProfile>(&value))
        .transpose()
        .map_err(Into::into)
}

async fn save_player_access_profile(
    redis: &RedisClient,
    profile: &PlayerAccessProfile,
) -> AppResult<()> {
    let payload = serde_json::to_string(profile)?;
    let mut connection = redis.get_multiplexed_async_connection().await?;
    redis::cmd("SET")
        .arg(player_access_profile_key(&profile.steam_id64))
        .arg(payload)
        .query_async::<()>(&mut connection)
        .await?;
    Ok(())
}

fn normalize_access_check_input(input: AccessCheckInput) -> AppResult<AccessCandidate> {
    let identifiers = resolve_steam_identifiers_strict(&input.steam_id64)?;
    Ok(AccessCandidate {
        steam_id64: identifiers.steam_id64,
        steam_id: input.steam_id.unwrap_or(identifiers.steam_id),
        steam_id3: input.steam_id3.unwrap_or(identifiers.steam_id3),
        nickname: input.nickname.filter(|value| !value.trim().is_empty()),
        ip_address: input.ip_address.filter(|value| !value.trim().is_empty()),
    })
}

fn upsert_candidate(target: &mut HashMap<String, AccessCandidate>, candidate: AccessCandidate) {
    let entry = target.entry(candidate.steam_id64.clone()).or_insert_with(|| candidate.clone());
    if entry.steam_id.is_empty() && !candidate.steam_id.is_empty() {
        entry.steam_id = candidate.steam_id.clone();
    }
    if entry.steam_id3.is_empty() && !candidate.steam_id3.is_empty() {
        entry.steam_id3 = candidate.steam_id3.clone();
    }
    if entry.nickname.is_none() {
        entry.nickname = candidate.nickname.clone();
    }
    if entry.ip_address.is_none() {
        entry.ip_address = candidate.ip_address.clone();
    }
}

fn player_profile_is_stale(profile: &PlayerAccessProfile, stale_seconds: u64) -> bool {
    let Some(parsed) = DateTime::parse_from_rfc3339(&profile.refreshed_at).ok() else {
        return true;
    };

    let refreshed_at = parsed.with_timezone(&Utc);
    let age_seconds = (Utc::now() - refreshed_at).num_seconds();
    age_seconds < 0 || age_seconds as u64 >= stale_seconds
}

fn meets_entry_requirements(
    min_entry_rating: i32,
    min_steam_level: i32,
    rating: Option<f64>,
    steam_level: Option<i32>,
) -> bool {
    let rating_ok = min_entry_rating <= 0 || rating.map(|value| value >= min_entry_rating as f64).unwrap_or(false);
    let steam_level_ok = min_steam_level <= 0 || steam_level.map(|value| value >= min_steam_level).unwrap_or(false);
    rating_ok && steam_level_ok
}

fn build_access_message(
    whitelist_enabled: bool,
    entry_verification_enabled: bool,
    is_whitelisted: bool,
    meets_entry_verification: bool,
    restriction_enabled: bool,
    allowed_by_restriction: bool,
    profile_available: bool,
    min_entry_rating: i32,
    min_steam_level: i32,
) -> String {
    if restriction_enabled && !allowed_by_restriction {
        return "你已被加入玩家限制页，当前服务器不在你的允许列表中。".to_string();
    }

    if !whitelist_enabled && !entry_verification_enabled {
        return "当前服务器未开启白名单与进服验证，允许进入。".to_string();
    }

    if whitelist_enabled && is_whitelisted {
        return "你已在白名单中，允许进入服务器。".to_string();
    }

    if entry_verification_enabled && meets_entry_verification {
        return "你已满足服务器进服验证门槛，允许进入服务器。".to_string();
    }

    if entry_verification_enabled && !profile_available {
        return format!(
            "当前无法确认你的进服验证数据，请稍后重试。服务器要求最低 rating {}，最低 Steam 等级 {}。",
            min_entry_rating, min_steam_level
        );
    }

    match (whitelist_enabled, entry_verification_enabled) {
        (true, false) => "当前服务器仅允许白名单玩家进入。".to_string(),
        (false, true) => format!(
            "当前服务器未启用白名单豁免，你未满足最低 rating {} 与最低 Steam 等级 {} 的进服要求。",
            min_entry_rating, min_steam_level
        ),
        (true, true) => format!(
            "当前服务器已同时开启白名单和进服验证；你不在白名单中，且未满足最低 rating {} 与最低 Steam 等级 {}。",
            min_entry_rating, min_steam_level
        ),
        (false, false) => "允许进入服务器。".to_string(),
    }
}

fn append_kv_line(output: &mut String, indent_level: usize, key: &str, value: &str) {
    let indent = "\t".repeat(indent_level);
    output.push_str(&format!(
        "{}\"{}\"\t\"{}\"\n",
        indent,
        escape_kv(key),
        escape_kv(value)
    ));
}

fn escape_kv(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\r', "")
        .replace('\n', " ")
}

fn server_access_snapshot_key(server_id: &str) -> String {
    format!("{}{server_id}", SERVER_ACCESS_SNAPSHOT_KEY_PREFIX)
}

fn player_access_profile_key(steam_id64: &str) -> String {
    format!("{}{steam_id64}", PLAYER_ACCESS_PROFILE_KEY_PREFIX)
}
