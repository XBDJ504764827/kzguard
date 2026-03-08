use crate::{
    application::{
        admins::get_operator_snapshot, mappers::map_whitelist_player,
        operation_logs::append_operation_log, whitelist_restrictions,
    },
    domain::{
        db::DbWhitelistPlayer,
        models::{
            OperatorSnapshot, ResolvedSteamIdentifiers, WhitelistApplicationHistory,
            WhitelistPlayer,
        },
    },
    error::{AppError, AppResult},
    http::requests::{
        ManualWhitelistDraft, PublicWhitelistApplicationDraft, WhitelistPlayerUpdateDraft,
    },
    support::{
        convert::trim_to_none,
        ids::prefixed_id,
        steam::{
            resolve_steam_identifiers_strict, resolve_steam_profile,
            resolve_steam_profile_with_web_api, steam_vanity_regex,
        },
        time::{iso_to_mysql, now_iso},
        validation::{
            require_non_empty, validate_application_draft, validate_manual_whitelist_draft,
        },
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

pub(crate) async fn list_public_whitelist(
    pool: &MySqlPool,
    status: Option<String>,
    search: Option<String>,
) -> AppResult<Vec<WhitelistPlayer>> {
    let normalized_status = normalize_whitelist_status_filter(status)?;
    let normalized_search = trim_to_none(search);
    let players = list_whitelist(pool, normalized_status).await?;

    Ok(players
        .into_iter()
        .filter(|player| matches_whitelist_search(player, normalized_search.as_deref()))
        .collect())
}

pub(crate) async fn get_public_whitelist_history(
    pool: &MySqlPool,
    identifier: &str,
) -> AppResult<WhitelistApplicationHistory> {
    require_non_empty(identifier, "请输入玩家 Steam 标识")?;

    let identifiers = resolve_history_identifiers(identifier).await?;
    build_whitelist_application_history(pool, identifiers).await
}

pub(crate) async fn create_public_application(
    pool: &MySqlPool,
    http_client: &reqwest::Client,
    steam_web_api_key: Option<&str>,
    draft: PublicWhitelistApplicationDraft,
) -> AppResult<WhitelistPlayer> {
    require_non_empty(&draft.steam_identifier, "请输入玩家 Steam 标识")?;

    let identifiers = resolve_history_identifiers(&draft.steam_identifier).await?;
    let history = build_whitelist_application_history(pool, identifiers.clone()).await?;

    if history.duplicate_blocked {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            history
                .block_reason
                .unwrap_or_else(|| "该 Steam 账号暂不允许重复提交白名单申请".to_string()),
        ));
    }

    let resolved_profile = if trim_to_none(draft.nickname.clone()).is_none() {
        resolve_steam_profile_with_web_api(http_client, steam_web_api_key, &draft.steam_identifier)
            .await
            .ok()
    } else {
        None
    };

    let nickname = trim_to_none(draft.nickname)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            resolved_profile
                .as_ref()
                .map(|profile| profile.nickname.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .ok_or_else(|| AppError::http(StatusCode::BAD_REQUEST, "请输入游戏名称"))?;

    let player = WhitelistPlayer {
        id: prefixed_id("player"),
        nickname,
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        contact: trim_to_none(draft.contact),
        note: trim_to_none(draft.note),
        status: "pending".to_string(),
        source: "application".to_string(),
        applied_at: now_iso(),
        reviewed_at: None,
    };

    insert_whitelist_player(pool, &player).await?;

    Ok(player)
}

pub(crate) async fn create_manual_whitelist_entry(
    pool: &MySqlPool,
    draft: ManualWhitelistDraft,
    operator_id: Option<String>,
) -> AppResult<WhitelistPlayer> {
    validate_manual_whitelist_draft(&draft.nickname, &draft.steam_id, &draft.status)?;
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    ensure_system_admin(&operator, "仅系统管理员可以手动录入白名单玩家")?;
    let identifiers = resolve_history_identifiers(&draft.steam_id).await?;

    let now = now_iso();
    let player = WhitelistPlayer {
        id: prefixed_id("player"),
        nickname: draft.nickname.trim().to_string(),
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        contact: trim_to_none(draft.contact),
        note: trim_to_none(draft.note),
        status: draft.status,
        source: "manual".to_string(),
        applied_at: now.clone(),
        reviewed_at: Some(now),
    };

    insert_whitelist_player(pool, &player).await?;

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
    let existing = get_whitelist_player(pool, player_id).await?;
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;

    if operator.role != "system_admin" && existing.source != "application" {
        return Err(AppError::http(
            StatusCode::FORBIDDEN,
            "普通管理员仅可审核玩家主动提交的白名单申请",
        ));
    }

    let reviewed_at = now_iso();
    let next_note = if status == "rejected" {
        let rejected_note = trim_to_none(note);
        if rejected_note.is_none() {
            return Err(AppError::http(
                StatusCode::BAD_REQUEST,
                "拒绝白名单申请时必须填写缘由",
            ));
        }
        rejected_note
    } else {
        trim_to_none(note).or(existing.note.clone())
    };

    sqlx::query("UPDATE whitelist_players SET status = ?, note = ?, reviewed_at = ? WHERE id = ?")
        .bind(status)
        .bind(&next_note)
        .bind(iso_to_mysql(&reviewed_at))
        .bind(player_id)
        .execute(pool)
        .await?;

    if status != "approved" {
        whitelist_restrictions::cleanup_whitelist_restriction_for_player(pool, player_id).await?;
    }

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

pub(crate) async fn update_whitelist_player(
    pool: &MySqlPool,
    player_id: &str,
    draft: WhitelistPlayerUpdateDraft,
    operator_id: Option<String>,
) -> AppResult<WhitelistPlayer> {
    validate_application_draft(&draft.nickname, &draft.steam_id)?;
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    ensure_system_admin(&operator, "仅系统管理员可以编辑白名单玩家信息")?;
    let existing = get_whitelist_player(pool, player_id).await?;
    let identifiers = resolve_history_identifiers(&draft.steam_id).await?;

    let updated = WhitelistPlayer {
        id: existing.id.clone(),
        nickname: draft.nickname.trim().to_string(),
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        contact: trim_to_none(draft.contact),
        note: trim_to_none(draft.note),
        status: existing.status.clone(),
        source: existing.source.clone(),
        applied_at: existing.applied_at.clone(),
        reviewed_at: existing.reviewed_at.clone(),
    };

    sqlx::query(
        "UPDATE whitelist_players SET nickname = ?, steam_id64 = ?, steam_id = ?, steam_id3 = ?, contact = ?, note = ? WHERE id = ?",
    )
    .bind(&updated.nickname)
    .bind(&updated.steam_id64)
    .bind(&updated.steam_id)
    .bind(&updated.steam_id3)
    .bind(&updated.contact)
    .bind(&updated.note)
    .bind(player_id)
    .execute(pool)
    .await?;

    append_operation_log(
        pool,
        "whitelist_player_updated",
        format!("编辑了白名单玩家 {} 的资料。", updated.nickname),
        &operator,
    )
    .await?;

    Ok(updated)
}

pub(crate) async fn delete_whitelist_player(
    pool: &MySqlPool,
    player_id: &str,
    operator_id: Option<String>,
) -> AppResult<()> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    ensure_system_admin(&operator, "仅系统管理员可以删除白名单记录")?;
    let existing = get_whitelist_player(pool, player_id).await?;

    whitelist_restrictions::cleanup_whitelist_restriction_for_player(pool, player_id).await?;

    sqlx::query("DELETE FROM whitelist_players WHERE id = ?")
        .bind(player_id)
        .execute(pool)
        .await?;

    append_operation_log(
        pool,
        "whitelist_player_deleted",
        format!(
            "删除了白名单玩家 {}（{}）。",
            existing.nickname,
            if existing.source == "manual" {
                "管理员手动录入"
            } else {
                "玩家申请"
            }
        ),
        &operator,
    )
    .await?;

    Ok(())
}

async fn get_whitelist_player(pool: &MySqlPool, player_id: &str) -> AppResult<WhitelistPlayer> {
    let row = sqlx::query_as::<_, DbWhitelistPlayer>("SELECT * FROM whitelist_players WHERE id = ?")
        .bind(player_id)
        .fetch_optional(pool)
        .await?;

    row.map(map_whitelist_player)
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标玩家"))
}

fn ensure_system_admin(operator: &OperatorSnapshot, message: &str) -> AppResult<()> {
    if operator.role != "system_admin" {
        return Err(AppError::http(StatusCode::FORBIDDEN, message));
    }

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

async fn insert_whitelist_player(pool: &MySqlPool, player: &WhitelistPlayer) -> AppResult<()> {
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
    .execute(pool)
    .await?;

    Ok(())
}

async fn build_whitelist_application_history(
    pool: &MySqlPool,
    identifiers: ResolvedSteamIdentifiers,
) -> AppResult<WhitelistApplicationHistory> {
    let records = list_whitelist(pool, None)
        .await?
        .into_iter()
        .filter(|player| matches_whitelist_identity_exact(player, &identifiers))
        .collect::<Vec<_>>();
    let (duplicate_blocked, block_reason, history_hint) = summarize_whitelist_history(&records);

    Ok(WhitelistApplicationHistory {
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        duplicate_blocked,
        block_reason,
        history_hint,
        records,
    })
}

async fn resolve_history_identifiers(identifier: &str) -> AppResult<ResolvedSteamIdentifiers> {
    if steam_vanity_regex().is_match(identifier.trim()) {
        let profile = resolve_steam_profile(identifier).await?;
        return Ok(ResolvedSteamIdentifiers {
            steam_id64: profile.steam_id64,
            steam_id: profile.steam_id,
            steam_id3: profile.steam_id3,
        });
    }

    resolve_steam_identifiers_strict(identifier)
}

fn normalize_whitelist_status_filter(status: Option<String>) -> AppResult<Option<String>> {
    match trim_to_none(status).as_deref() {
        None | Some("all") => Ok(None),
        Some("approved") => Ok(Some("approved".to_string())),
        Some("pending") => Ok(Some("pending".to_string())),
        Some("rejected") => Ok(Some("rejected".to_string())),
        Some(_) => Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "白名单状态仅支持 approved、pending、rejected 或 all",
        )),
    }
}

fn matches_whitelist_search(player: &WhitelistPlayer, search: Option<&str>) -> bool {
    let Some(search) = search.map(str::trim).filter(|value| !value.is_empty()) else {
        return true;
    };

    let normalized_search = search.to_lowercase();
    if player.nickname.to_lowercase().contains(&normalized_search)
        || player.steam_id64.to_lowercase().contains(&normalized_search)
        || player.steam_id.to_lowercase().contains(&normalized_search)
        || player.steam_id3.to_lowercase().contains(&normalized_search)
    {
        return true;
    }

    if let Ok(search_identifiers) = resolve_steam_identifiers_strict(search) {
        if player.steam_id64 == search_identifiers.steam_id64
            || player.steam_id.eq_ignore_ascii_case(&search_identifiers.steam_id)
            || player.steam_id3.eq_ignore_ascii_case(&search_identifiers.steam_id3)
        {
            return true;
        }
    }

    false
}

fn matches_whitelist_identity_exact(
    player: &WhitelistPlayer,
    identifiers: &ResolvedSteamIdentifiers,
) -> bool {
    if player.steam_id64 == identifiers.steam_id64
        || player.steam_id.eq_ignore_ascii_case(&identifiers.steam_id)
        || player.steam_id3.eq_ignore_ascii_case(&identifiers.steam_id3)
    {
        return true;
    }

    false
}

fn summarize_whitelist_history(
    records: &[WhitelistPlayer],
) -> (bool, Option<String>, Option<String>) {
    if records.iter().any(|record| record.status == "approved") {
        return (
            true,
            Some("该 Steam 账号已在白名单中，无需重复申请".to_string()),
            None,
        );
    }

    if records.iter().any(|record| record.status == "pending") {
        return (
            true,
            Some("该 Steam 账号已有待审核申请，请勿重复提交".to_string()),
            None,
        );
    }

    if records.iter().any(|record| record.status == "rejected") {
        return (
            false,
            None,
            Some(
                "检测到该 Steam 账号的历史申请记录，当前可重新提交，建议在申请说明中补充变更情况。"
                    .to_string(),
            ),
        );
    }

    (false, None, None)
}
