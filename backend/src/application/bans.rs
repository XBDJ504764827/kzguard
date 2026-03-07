use crate::{
    application::{
        admins::get_operator_snapshot,
        communities::{ensure_kzguard_command_available, quote_rcon_argument},
        mappers::map_ban_record,
        operation_logs::append_operation_log,
        server_presence,
    },
    domain::{
        db::DbBanRecord,
        models::{BanRecord, OperatorSnapshot, ResolvedSteamIdentifiers},
    },
    error::{AppError, AppResult},
    http::requests::{
        BanRecordUpdateDraft, BanServerPlayerDraft, InternalServerBanSyncBody,
        InternalServerUnbanSyncBody, ManualBanDraft,
    },
    infra::mysql::insert_ban_record,
    support::{
        convert::trim_to_none,
        ids::prefixed_id,
        rcon::execute_rcon_command,
        steam::{resolve_steam_identifiers_strict, resolve_steam_profile, steam_vanity_regex},
        time::{iso_to_mysql, now_iso},
        validation::{ipv4_regex, validate_ban_draft},
    },
};
use axum::http::StatusCode;
use redis::Client as RedisClient;
use sqlx::{FromRow, MySqlPool};

#[derive(Debug, FromRow)]
struct PluginServerContext {
    name: String,
    community_name: String,
    plugin_token: String,
}

pub(crate) async fn ban_server_player(
    pool: &MySqlPool,
    redis: &RedisClient,
    ttl_seconds: u64,
    community_id: &str,
    server_id: &str,
    player_id: &str,
    draft: BanServerPlayerDraft,
    operator_id: Option<String>,
) -> AppResult<BanRecord> {
    validate_ban_draft(
        Some(&draft.ban_type),
        None,
        draft.ip_address.as_deref(),
        draft.duration_seconds,
        &draft.reason,
    )?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let target =
        server_presence::resolve_live_player_target(pool, redis, community_id, server_id, player_id)
            .await?;

    let ban = create_ban_record(
        trim_to_none(Some(target.player.nickname.clone())),
        draft.ban_type.clone(),
        target.player.steam_id.clone(),
        draft
            .ip_address
            .or_else(|| Some(target.player.ip_address.clone())),
        draft.reason.clone(),
        draft.duration_seconds,
        target.server_name.clone(),
        Some(target.community_name.clone()),
        &operator,
        "server_action",
    )?;

    let duration_seconds = draft.duration_seconds.unwrap_or(0).max(0);
    let command = format!(
        "kzguard_ban_userid {} {} {} {}",
        target.player.user_id,
        if draft.ban_type == "ip" { "ip" } else { "steam" },
        duration_seconds,
        quote_rcon_argument(draft.reason.trim()),
    );

    let response = execute_rcon_command(&target.ip, target.port, &target.rcon_password, &command)
        .await
        .map_err(|message| AppError::http(StatusCode::BAD_REQUEST, message))?;

    ensure_kzguard_command_available(&response)?;

    let mut tx = pool.begin().await?;
    insert_ban_record(&mut *tx, &ban).await?;
    tx.commit().await?;

    server_presence::remove_player_from_snapshot(redis, ttl_seconds, server_id, player_id).await?;

    append_operation_log(
        pool,
        "server_player_banned",
        format!(
            "在服务器 {} 以{}封禁了玩家 {}，IP：{}，时长为 {}。原因：{}",
            ban.server_name,
            if ban.ban_type == "ip" {
                "IP封禁"
            } else {
                "Steam账号封禁"
            },
            ban.nickname.clone().unwrap_or_else(|| ban.steam_id.clone()),
            ban.ip_address
                .clone()
                .unwrap_or_else(|| "等待玩家下次进服自动回填".to_string()),
            ban.duration_seconds
                .map(|seconds| format!("{} 秒", seconds))
                .unwrap_or_else(|| "永久封禁".to_string()),
            ban.reason
        ),
        &operator,
    )
    .await?;

    Ok(ban)
}

pub(crate) async fn create_plugin_ban_entry(
    pool: &MySqlPool,
    provided_plugin_token: &str,
    draft: InternalServerBanSyncBody,
) -> AppResult<BanRecord> {
    let server = authenticate_plugin_server(pool, &draft.server_id, provided_plugin_token).await?;
    let nickname = trim_to_none(draft.nickname);
    let ip_address = trim_to_none(draft.ip_address);
    validate_ban_draft(
        Some(&draft.ban_type),
        Some(&draft.steam_identifier),
        ip_address.as_deref(),
        draft.duration_seconds,
        &draft.reason,
    )?;

    let operator = build_plugin_operator_snapshot(draft.operator_name, draft.operator_steam_identifier);
    let ban = create_ban_record(
        nickname,
        draft.ban_type,
        draft.steam_identifier,
        ip_address,
        draft.reason,
        draft.duration_seconds,
        server.name.clone(),
        Some(server.community_name.clone()),
        &operator,
        "server_action",
    )?;

    insert_ban_record(pool, &ban).await?;

    append_operation_log(
        pool,
        "server_player_banned",
        format!(
            "游戏内管理员在服务器 {} 以{}封禁了玩家 {}，IP：{}，时长为 {}。原因：{}",
            ban.server_name,
            if ban.ban_type == "ip" {
                "IP封禁"
            } else {
                "Steam账号封禁"
            },
            ban.nickname.clone().unwrap_or_else(|| ban.steam_id.clone()),
            ban.ip_address
                .clone()
                .unwrap_or_else(|| "等待玩家下次进服自动回填".to_string()),
            ban.duration_seconds
                .map(|seconds| format!("{} 秒", seconds))
                .unwrap_or_else(|| "永久封禁".to_string()),
            ban.reason,
        ),
        &operator,
    )
    .await?;

    Ok(ban)
}

pub(crate) async fn revoke_plugin_ban_entry(
    pool: &MySqlPool,
    provided_plugin_token: &str,
    draft: InternalServerUnbanSyncBody,
) -> AppResult<BanRecord> {
    let server = authenticate_plugin_server(pool, &draft.server_id, provided_plugin_token).await?;
    let operator = build_plugin_operator_snapshot(draft.operator_name, draft.operator_steam_identifier);
    let identity = trim_to_none(Some(draft.identity))
        .ok_or_else(|| AppError::http(StatusCode::BAD_REQUEST, "请输入要解封的 Steam 标识或 IP"))?;
    let existing = find_active_ban_record_by_identity(pool, &identity).await?;
    let revoked = revoke_existing_ban_record_with_operator(pool, existing, &operator).await?;

    append_operation_log(
        pool,
        "ban_record_revoked",
        format!(
            "游戏内管理员在服务器 {} 解除了玩家 {} 的封禁，原封禁属性为{}。",
            server.name,
            revoked
                .nickname
                .clone()
                .unwrap_or_else(|| revoked.steam_id.clone()),
            if revoked.ban_type == "ip" {
                "IP封禁"
            } else {
                "Steam账号封禁"
            },
        ),
        &operator,
    )
    .await?;

    Ok(revoked)
}

pub(crate) async fn list_bans(pool: &MySqlPool) -> AppResult<Vec<BanRecord>> {
    let rows =
        sqlx::query_as::<_, DbBanRecord>("SELECT * FROM ban_records ORDER BY banned_at DESC")
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(map_ban_record).collect())
}

pub(crate) async fn list_public_bans(
    pool: &MySqlPool,
    status: Option<String>,
    search: Option<String>,
) -> AppResult<Vec<BanRecord>> {
    let normalized_status = normalize_ban_status_filter(status)?;
    let normalized_search = trim_to_none(search);
    let bans = list_bans(pool).await?;

    Ok(bans
        .into_iter()
        .filter(|ban| matches_public_ban_status(ban, normalized_status.as_deref()))
        .filter(|ban| matches_ban_search(ban, normalized_search.as_deref()))
        .collect())
}

pub(crate) async fn create_manual_ban_entry(
    pool: &MySqlPool,
    draft: ManualBanDraft,
    operator_id: Option<String>,
) -> AppResult<BanRecord> {
    validate_ban_draft(
        Some(&draft.ban_type),
        Some(&draft.steam_identifier),
        draft.ip_address.as_deref(),
        draft.duration_seconds,
        &draft.reason,
    )?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let identifiers = resolve_manual_ban_identifiers(&draft.steam_identifier).await?;
    let ban = build_ban_record(
        trim_to_none(draft.nickname),
        draft.ban_type,
        draft.steam_identifier,
        identifiers,
        draft.ip_address,
        draft.reason,
        draft.duration_seconds,
        "手动录入（未关联服务器）".to_string(),
        None,
        &operator,
        "manual",
    );

    insert_ban_record(pool, &ban).await?;

    append_operation_log(
        pool,
        "ban_record_manual_created",
        format!(
            "手动添加了{}记录：玩家 {}，Steam 标识 {}，IP：{}，时长为 {}。原因：{}",
            if ban.ban_type == "ip" {
                "IP封禁"
            } else {
                "Steam账号封禁"
            },
            ban.nickname
                .clone()
                .unwrap_or_else(|| "待后端匹配".to_string()),
            ban.steam_identifier,
            ban.ip_address
                .clone()
                .unwrap_or_else(|| "等待玩家下次进服自动回填".to_string()),
            ban.duration_seconds
                .map(|seconds| format!("{} 秒", seconds))
                .unwrap_or_else(|| "永久封禁".to_string()),
            ban.reason,
        ),
        &operator,
    )
    .await?;

    Ok(ban)
}

pub(crate) async fn update_ban_record(
    pool: &MySqlPool,
    ban_id: &str,
    draft: BanRecordUpdateDraft,
    operator_id: Option<String>,
) -> AppResult<BanRecord> {
    validate_ban_draft(
        Some(&draft.ban_type),
        Some(&draft.steam_identifier),
        draft.ip_address.as_deref(),
        draft.duration_seconds,
        &draft.reason,
    )?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let existing = get_ban_record(pool, ban_id).await?;
    let identifiers = resolve_manual_ban_identifiers(&draft.steam_identifier).await?;
    let updated_at = now_iso();

    let updated = BanRecord {
        id: existing.id.clone(),
        nickname: trim_to_none(draft.nickname).or(existing.nickname.clone()),
        ban_type: draft.ban_type,
        status: existing.status,
        steam_identifier: draft.steam_identifier.trim().to_string(),
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        ip_address: trim_to_none(draft.ip_address),
        reason: draft.reason.trim().to_string(),
        duration_seconds: draft.duration_seconds,
        banned_at: existing.banned_at,
        server_name: trim_to_none(draft.server_name).unwrap_or(existing.server_name),
        community_name: trim_to_none(draft.community_name),
        operator_id: existing.operator_id,
        operator_name: existing.operator_name,
        operator_role: existing.operator_role,
        source: existing.source,
        updated_at: Some(updated_at.clone()),
        revoked_at: existing.revoked_at,
        revoked_by_operator_id: existing.revoked_by_operator_id,
        revoked_by_operator_name: existing.revoked_by_operator_name,
        revoked_by_operator_role: existing.revoked_by_operator_role,
    };

    sqlx::query(
        r#"
        UPDATE ban_records
           SET nickname = ?, ban_type = ?, steam_identifier = ?, steam_id64 = ?, steam_id = ?, steam_id3 = ?,
               ip_address = ?, reason = ?, duration_seconds = ?, server_name = ?, community_name = ?, updated_at = ?
         WHERE id = ?
        "#,
    )
    .bind(&updated.nickname)
    .bind(&updated.ban_type)
    .bind(&updated.steam_identifier)
    .bind(&updated.steam_id64)
    .bind(&updated.steam_id)
    .bind(&updated.steam_id3)
    .bind(&updated.ip_address)
    .bind(&updated.reason)
    .bind(updated.duration_seconds)
    .bind(&updated.server_name)
    .bind(&updated.community_name)
    .bind(iso_to_mysql(&updated_at))
    .bind(ban_id)
    .execute(pool)
    .await?;

    append_operation_log(
        pool,
        "ban_record_updated",
        format!(
            "编辑了封禁记录 {}，更新为{}，时长为 {}，原因：{}",
            existing
                .nickname
                .clone()
                .unwrap_or_else(|| existing.steam_id.clone()),
            if updated.ban_type == "ip" {
                "IP封禁"
            } else {
                "Steam账号封禁"
            },
            updated
                .duration_seconds
                .map(|seconds| format!("{} 秒", seconds))
                .unwrap_or_else(|| "永久封禁".to_string()),
            updated.reason,
        ),
        &operator,
    )
    .await?;

    Ok(updated)
}

pub(crate) async fn revoke_ban_record(
    pool: &MySqlPool,
    ban_id: &str,
    operator_id: Option<String>,
) -> AppResult<BanRecord> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let existing = get_ban_record(pool, ban_id).await?;
    let revoked = revoke_existing_ban_record_with_operator(pool, existing, &operator).await?;

    append_operation_log(
        pool,
        "ban_record_revoked",
        format!(
            "解除了玩家 {} 的封禁，原封禁属性为{}。",
            revoked
                .nickname
                .clone()
                .unwrap_or_else(|| revoked.steam_id.clone()),
            if revoked.ban_type == "ip" {
                "IP封禁"
            } else {
                "Steam账号封禁"
            },
        ),
        &operator,
    )
    .await?;

    Ok(revoked)
}

pub(crate) async fn delete_ban_record(
    pool: &MySqlPool,
    ban_id: &str,
    operator_id: Option<String>,
) -> AppResult<()> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let existing = get_ban_record(pool, ban_id).await?;

    sqlx::query("DELETE FROM ban_records WHERE id = ?")
        .bind(ban_id)
        .execute(pool)
        .await?;

    append_operation_log(
        pool,
        "ban_record_deleted",
        format!(
            "删除了封禁记录 {}（{}）。",
            existing
                .nickname
                .clone()
                .unwrap_or_else(|| existing.steam_id.clone()),
            if existing.ban_type == "ip" {
                "IP封禁"
            } else {
                "Steam账号封禁"
            },
        ),
        &operator,
    )
    .await?;

    Ok(())
}

pub(crate) async fn get_ban_record(pool: &MySqlPool, ban_id: &str) -> AppResult<BanRecord> {
    let row = sqlx::query_as::<_, DbBanRecord>("SELECT * FROM ban_records WHERE id = ?")
        .bind(ban_id)
        .fetch_optional(pool)
        .await?;

    row.map(map_ban_record)
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到要操作的封禁记录"))
}

pub(crate) fn create_ban_record(
    nickname: Option<String>,
    ban_type: String,
    steam_identifier: String,
    ip_address: Option<String>,
    reason: String,
    duration_seconds: Option<i32>,
    server_name: String,
    community_name: Option<String>,
    operator: &OperatorSnapshot,
    source: &str,
) -> AppResult<BanRecord> {
    let identifiers = resolve_steam_identifiers_strict(&steam_identifier)?;
    Ok(build_ban_record(
        nickname,
        ban_type,
        steam_identifier,
        identifiers,
        ip_address,
        reason,
        duration_seconds,
        server_name,
        community_name,
        operator,
        source,
    ))
}

fn build_ban_record(
    nickname: Option<String>,
    ban_type: String,
    steam_identifier: String,
    identifiers: ResolvedSteamIdentifiers,
    ip_address: Option<String>,
    reason: String,
    duration_seconds: Option<i32>,
    server_name: String,
    community_name: Option<String>,
    operator: &OperatorSnapshot,
    source: &str,
) -> BanRecord {
    let now = now_iso();

    BanRecord {
        id: prefixed_id("ban"),
        nickname,
        ban_type,
        status: "active".to_string(),
        steam_identifier: steam_identifier.trim().to_string(),
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        ip_address: trim_to_none(ip_address),
        reason: reason.trim().to_string(),
        duration_seconds,
        banned_at: now.clone(),
        server_name,
        community_name,
        operator_id: operator.id.clone(),
        operator_name: operator.name.clone(),
        operator_role: operator.role.clone(),
        source: source.to_string(),
        updated_at: Some(now),
        revoked_at: None,
        revoked_by_operator_id: None,
        revoked_by_operator_name: None,
        revoked_by_operator_role: None,
    }
}

async fn resolve_manual_ban_identifiers(input: &str) -> AppResult<ResolvedSteamIdentifiers> {
    if steam_vanity_regex().is_match(input.trim()) {
        let profile = resolve_steam_profile(input).await?;
        return Ok(ResolvedSteamIdentifiers {
            steam_id64: profile.steam_id64,
            steam_id: profile.steam_id,
            steam_id3: profile.steam_id3,
        });
    }

    resolve_steam_identifiers_strict(input)
}

async fn authenticate_plugin_server(
    pool: &MySqlPool,
    server_id: &str,
    provided_plugin_token: &str,
) -> AppResult<PluginServerContext> {
    let server_id = server_id.trim();
    if server_id.is_empty() {
        return Err(AppError::http(StatusCode::BAD_REQUEST, "缺少服务器 ID"));
    }

    let server = sqlx::query_as::<_, PluginServerContext>(
        r#"
        SELECT s.name,
               c.name AS community_name,
               s.plugin_token
          FROM servers s
          INNER JOIN communities c ON c.id = s.community_id
         WHERE s.id = ?
        "#,
    )
    .bind(server_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到对应服务器，请确认 serverId 配置"))?;

    if server.plugin_token.trim() != provided_plugin_token.trim() {
        return Err(AppError::http(StatusCode::UNAUTHORIZED, "服务器 plugin_token 校验失败"));
    }

    Ok(server)
}

fn build_plugin_operator_snapshot(
    operator_name: Option<String>,
    operator_steam_identifier: Option<String>,
) -> OperatorSnapshot {
    let name = trim_to_none(operator_name).unwrap_or_else(|| "游戏服管理员".to_string());
    let id = trim_to_none(operator_steam_identifier)
        .and_then(|identifier| {
            resolve_steam_identifiers_strict(&identifier)
                .ok()
                .map(|resolved| format!("ingame-admin:{}", resolved.steam_id64))
        })
        .unwrap_or_else(|| {
            format!(
                "ingame-admin:{}",
                normalize_operator_identity_fragment(&name)
            )
        });

    OperatorSnapshot {
        id,
        name,
        role: "normal_admin".to_string(),
    }
}

fn normalize_operator_identity_fragment(input: &str) -> String {
    let normalized = input
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();

    let collapsed = normalized
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if collapsed.is_empty() {
        "server-admin".to_string()
    } else {
        collapsed
    }
}

async fn find_active_ban_record_by_identity(
    pool: &MySqlPool,
    identity: &str,
) -> AppResult<BanRecord> {
    let identity = identity.trim();
    let row = if ipv4_regex().is_match(identity) {
        sqlx::query_as::<_, DbBanRecord>(
            r#"
            SELECT *
              FROM ban_records
             WHERE status = 'active' AND ban_type = 'ip' AND ip_address = ?
             ORDER BY banned_at DESC
             LIMIT 1
            "#,
        )
        .bind(identity)
        .fetch_optional(pool)
        .await?
    } else {
        let identifiers = resolve_manual_ban_identifiers(identity).await?;
        sqlx::query_as::<_, DbBanRecord>(
            r#"
            SELECT *
              FROM ban_records
             WHERE status = 'active'
               AND ban_type = 'steam_account'
               AND (
                    steam_id64 = ?
                 OR steam_id = ?
                 OR steam_id3 = ?
                 OR steam_identifier = ?
               )
             ORDER BY banned_at DESC
             LIMIT 1
            "#,
        )
        .bind(&identifiers.steam_id64)
        .bind(&identifiers.steam_id)
        .bind(&identifiers.steam_id3)
        .bind(identity)
        .fetch_optional(pool)
        .await?
    };

    row.map(map_ban_record)
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到要解除的活动封禁记录"))
}

async fn revoke_existing_ban_record_with_operator(
    pool: &MySqlPool,
    existing: BanRecord,
    operator: &OperatorSnapshot,
) -> AppResult<BanRecord> {
    if existing.status == "revoked" {
        return Err(AppError::http(StatusCode::BAD_REQUEST, "该封禁记录已解除"));
    }

    let now = now_iso();
    sqlx::query(
        r#"
        UPDATE ban_records
           SET status = 'revoked', updated_at = ?, revoked_at = ?, revoked_by_operator_id = ?, revoked_by_operator_name = ?, revoked_by_operator_role = ?
         WHERE id = ?
        "#,
    )
    .bind(iso_to_mysql(&now))
    .bind(iso_to_mysql(&now))
    .bind(&operator.id)
    .bind(&operator.name)
    .bind(&operator.role)
    .bind(&existing.id)
    .execute(pool)
    .await?;

    Ok(BanRecord {
        status: "revoked".to_string(),
        updated_at: Some(now.clone()),
        revoked_at: Some(now),
        revoked_by_operator_id: Some(operator.id.clone()),
        revoked_by_operator_name: Some(operator.name.clone()),
        revoked_by_operator_role: Some(operator.role.clone()),
        ..existing
    })
}

fn normalize_ban_status_filter(status: Option<String>) -> AppResult<Option<String>> {
    match trim_to_none(status).as_deref() {
        None | Some("all") => Ok(None),
        Some("active") => Ok(Some("active".to_string())),
        Some("revoked") => Ok(Some("revoked".to_string())),
        Some(_) => Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "封禁状态仅支持 active、revoked 或 all",
        )),
    }
}

fn matches_public_ban_status(ban: &BanRecord, status: Option<&str>) -> bool {
    match status {
        Some(expected_status) => ban.status == expected_status,
        None => true,
    }
}

fn matches_ban_search(ban: &BanRecord, search: Option<&str>) -> bool {
    let Some(search) = search.map(str::trim).filter(|value| !value.is_empty()) else {
        return true;
    };

    let normalized_search = search.to_lowercase();
    let matches_text = [
        ban.nickname.as_deref(),
        Some(ban.steam_identifier.as_str()),
        Some(ban.steam_id64.as_str()),
        Some(ban.steam_id.as_str()),
        Some(ban.steam_id3.as_str()),
        ban.ip_address.as_deref(),
        Some(ban.server_name.as_str()),
        ban.community_name.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|value| value.to_lowercase().contains(&normalized_search));

    if matches_text {
        return true;
    }

    if let Ok(search_identifiers) = resolve_steam_identifiers_strict(search) {
        return ban.steam_id64 == search_identifiers.steam_id64
            || ban.steam_id == search_identifiers.steam_id
            || ban.steam_id3 == search_identifiers.steam_id3;
    }

    false
}
