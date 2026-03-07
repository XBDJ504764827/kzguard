use crate::{
    application::{
        admins::get_operator_snapshot, mappers::map_ban_record,
        operation_logs::append_operation_log,
    },
    domain::{
        db::{DbBanRecord, DbBanTarget},
        models::{BanRecord, OperatorSnapshot},
    },
    error::{AppError, AppResult},
    http::requests::{BanRecordUpdateDraft, BanServerPlayerDraft, ManualBanDraft},
    infra::mysql::insert_ban_record,
    support::{
        convert::trim_to_none,
        ids::prefixed_id,
        steam::resolve_steam_identifiers,
        time::{iso_to_mysql, now_iso},
        validation::validate_ban_draft,
    },
};
use axum::http::StatusCode;
use sqlx::MySqlPool;

pub(crate) async fn ban_server_player(
    pool: &MySqlPool,
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
    let mut tx = pool.begin().await?;

    let player = sqlx::query_as::<_, DbBanTarget>(
        r#"
        SELECT sp.nickname, sp.steam_id, sp.ip_address, s.name AS server_name, c.name AS community_name
          FROM server_players sp
          INNER JOIN servers s ON s.id = sp.server_id
          INNER JOIN communities c ON c.id = s.community_id
         WHERE sp.id = ? AND sp.server_id = ? AND c.id = ?
        "#,
    )
    .bind(player_id)
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(&mut *tx)
    .await?;

    let player = player
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到要封禁的玩家或服务器"))?;

    let ban = create_ban_record(
        trim_to_none(Some(player.nickname.clone())),
        draft.ban_type,
        player.steam_id,
        draft.ip_address.or_else(|| Some(player.ip_address)),
        draft.reason,
        draft.duration_seconds,
        player.server_name,
        Some(player.community_name),
        &operator,
        "server_action",
    )?;

    insert_ban_record(&mut *tx, &ban).await?;
    sqlx::query("DELETE FROM server_players WHERE id = ? AND server_id = ?")
        .bind(player_id)
        .bind(server_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

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

pub(crate) async fn list_bans(pool: &MySqlPool) -> AppResult<Vec<BanRecord>> {
    let rows =
        sqlx::query_as::<_, DbBanRecord>("SELECT * FROM ban_records ORDER BY banned_at DESC")
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(map_ban_record).collect())
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
    let ban = create_ban_record(
        trim_to_none(draft.nickname),
        draft.ban_type,
        draft.steam_identifier,
        draft.ip_address,
        draft.reason,
        draft.duration_seconds,
        "手动录入（未关联服务器）".to_string(),
        None,
        &operator,
        "manual",
    )?;

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
    let identifiers = resolve_steam_identifiers(&draft.steam_identifier)?;
    let updated_at = now_iso();

    let updated = BanRecord {
        id: existing.id,
        nickname: trim_to_none(draft.nickname),
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
    .bind(ban_id)
    .execute(pool)
    .await?;

    let revoked = BanRecord {
        status: "revoked".to_string(),
        updated_at: Some(now.clone()),
        revoked_at: Some(now),
        revoked_by_operator_id: Some(operator.id.clone()),
        revoked_by_operator_name: Some(operator.name.clone()),
        revoked_by_operator_role: Some(operator.role.clone()),
        ..existing
    };

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
    let identifiers = resolve_steam_identifiers(&steam_identifier)?;
    let now = now_iso();

    Ok(BanRecord {
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
    })
}
