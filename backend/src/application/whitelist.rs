use crate::{
    application::{
        admins::get_operator_snapshot, mappers::map_whitelist_player,
        operation_logs::append_operation_log,
    },
    domain::{db::DbWhitelistPlayer, models::WhitelistPlayer},
    error::{AppError, AppResult},
    http::requests::{ApplicationDraft, ManualWhitelistDraft},
    support::{
        convert::trim_to_none,
        ids::prefixed_id,
        time::{iso_to_mysql, now_iso},
        validation::{validate_application_draft, validate_manual_whitelist_draft},
    },
};
use axum::http::StatusCode;
use sqlx::MySqlPool;

pub(crate) async fn list_whitelist(
    pool: &MySqlPool,
    status: Option<String>,
) -> AppResult<Vec<WhitelistPlayer>> {
    let rows = if let Some(status) = trim_to_none(status) {
        sqlx::query_as::<_, DbWhitelistPlayer>(
            "SELECT * FROM whitelist_players WHERE status = ? ORDER BY applied_at DESC",
        )
        .bind(status)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, DbWhitelistPlayer>(
            "SELECT * FROM whitelist_players ORDER BY applied_at DESC",
        )
        .fetch_all(pool)
        .await?
    };

    Ok(rows.into_iter().map(map_whitelist_player).collect())
}

pub(crate) async fn create_application(
    pool: &MySqlPool,
    draft: ApplicationDraft,
) -> AppResult<WhitelistPlayer> {
    validate_application_draft(&draft.nickname, &draft.steam_id)?;

    let player = WhitelistPlayer {
        id: prefixed_id("player"),
        nickname: draft.nickname.trim().to_string(),
        steam_id: draft.steam_id.trim().to_string(),
        contact: trim_to_none(draft.contact),
        note: trim_to_none(draft.note),
        status: "pending".to_string(),
        source: "application".to_string(),
        applied_at: now_iso(),
        reviewed_at: None,
    };

    sqlx::query(
        r#"
        INSERT INTO whitelist_players (
          id, nickname, steam_id, contact, note, status, source, applied_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&player.id)
    .bind(&player.nickname)
    .bind(&player.steam_id)
    .bind(&player.contact)
    .bind(&player.note)
    .bind(&player.status)
    .bind(&player.source)
    .bind(iso_to_mysql(&player.applied_at))
    .bind(Option::<String>::None)
    .execute(pool)
    .await?;

    Ok(player)
}

pub(crate) async fn create_manual_whitelist_entry(
    pool: &MySqlPool,
    draft: ManualWhitelistDraft,
    operator_id: Option<String>,
) -> AppResult<WhitelistPlayer> {
    validate_manual_whitelist_draft(&draft.nickname, &draft.steam_id, &draft.status)?;

    let now = now_iso();
    let player = WhitelistPlayer {
        id: prefixed_id("player"),
        nickname: draft.nickname.trim().to_string(),
        steam_id: draft.steam_id.trim().to_string(),
        contact: trim_to_none(draft.contact),
        note: trim_to_none(draft.note),
        status: draft.status,
        source: "manual".to_string(),
        applied_at: now.clone(),
        reviewed_at: Some(now),
    };

    sqlx::query(
        r#"
        INSERT INTO whitelist_players (
          id, nickname, steam_id, contact, note, status, source, applied_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&player.id)
    .bind(&player.nickname)
    .bind(&player.steam_id)
    .bind(&player.contact)
    .bind(&player.note)
    .bind(&player.status)
    .bind(&player.source)
    .bind(iso_to_mysql(&player.applied_at))
    .bind(player.reviewed_at.as_ref().map(|value| iso_to_mysql(value)))
    .execute(pool)
    .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "whitelist_manual_added",
        format!(
            "手动录入玩家 {} 到白名单，结果为 {}。",
            player.nickname,
            if player.status == "approved" {
                "已通过"
            } else {
                "已拒绝"
            }
        ),
        &operator,
    )
    .await?;

    Ok(player)
}

pub(crate) async fn review_whitelist_player(
    pool: &MySqlPool,
    player_id: &str,
    status: &str,
    note: Option<String>,
    operator_id: Option<String>,
) -> AppResult<()> {
    let existing =
        sqlx::query_as::<_, DbWhitelistPlayer>("SELECT * FROM whitelist_players WHERE id = ?")
            .bind(player_id)
            .fetch_optional(pool)
            .await?;

    let existing =
        existing.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标玩家"))?;
    let reviewed_at = now_iso();
    let next_note = trim_to_none(note).or(existing.note.clone());

    sqlx::query("UPDATE whitelist_players SET status = ?, note = ?, reviewed_at = ? WHERE id = ?")
        .bind(status)
        .bind(&next_note)
        .bind(iso_to_mysql(&reviewed_at))
        .bind(player_id)
        .execute(pool)
        .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let detail = if let Some(note) = next_note
        .clone()
        .filter(|_| note_was_provided(&next_note, &existing.note))
    {
        format!(
            "{}玩家 {} 的白名单申请。 备注：{}",
            if status == "approved" {
                "审核通过"
            } else {
                "审核拒绝"
            },
            existing.nickname,
            note
        )
    } else {
        format!(
            "{}玩家 {} 的白名单申请。",
            if status == "approved" {
                "审核通过"
            } else {
                "审核拒绝"
            },
            existing.nickname,
        )
    };

    append_operation_log(
        pool,
        if status == "approved" {
            "whitelist_approved"
        } else {
            "whitelist_rejected"
        },
        detail,
        &operator,
    )
    .await?;

    Ok(())
}

pub(crate) fn note_was_provided(
    next_note: &Option<String>,
    existing_note: &Option<String>,
) -> bool {
    match (next_note, existing_note) {
        (Some(next), Some(existing)) => next != existing,
        (Some(_), None) => true,
        _ => false,
    }
}
