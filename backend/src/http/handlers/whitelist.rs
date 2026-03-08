use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    application::{auth, server_access, whitelist},
    domain::models::WhitelistPlayer,
    error::{AppError, AppResult},
    http::{
        common::{ApiEnvelope, MessageResponse},
        requests::{
            ManualWhitelistDraft, ReviewWhitelistBody, WhitelistPlayerPath,
            WhitelistPlayerUpdateDraft, WhitelistQuery,
        },
    },
    state::SharedState,
    support::web::bearer_token_from_headers,
};

pub(crate) async fn list_whitelist_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<WhitelistQuery>,
) -> AppResult<Json<ApiEnvelope<Vec<WhitelistPlayer>>>> {
    let token = bearer_token_from_headers(&headers);
    let _current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let whitelist = whitelist::list_whitelist(&state.pool, query.status).await?;
    Ok(Json(ApiEnvelope::new(whitelist)))
}

pub(crate) async fn create_whitelist_manual_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(draft): Json<ManualWhitelistDraft>,
) -> AppResult<impl IntoResponse> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let player = whitelist::create_manual_whitelist_entry(&state.pool, draft, Some(current_admin.id)).await?;
    trigger_access_snapshot_refresh(state.clone(), "manual whitelist create");

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(player, "玩家已手动录入，服务器准入缓存正在后台刷新")),
    ))
}

pub(crate) async fn update_whitelist_player_handler(
    State(state): State<SharedState>,
    Path(path): Path<WhitelistPlayerPath>,
    headers: HeaderMap,
    Json(draft): Json<WhitelistPlayerUpdateDraft>,
) -> AppResult<Json<ApiEnvelope<WhitelistPlayer>>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let player = whitelist::update_whitelist_player(
        &state.pool,
        &path.player_id,
        draft,
        Some(current_admin.id),
    )
    .await?;
    trigger_access_snapshot_refresh(state.clone(), "whitelist player update");

    Ok(Json(ApiEnvelope::with_message(player, "白名单玩家信息已更新，服务器准入缓存正在后台刷新")))
}

pub(crate) async fn delete_whitelist_player_handler(
    State(state): State<SharedState>,
    Path(path): Path<WhitelistPlayerPath>,
    headers: HeaderMap,
) -> AppResult<Json<MessageResponse>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    whitelist::delete_whitelist_player(&state.pool, &path.player_id, Some(current_admin.id)).await?;
    trigger_access_snapshot_refresh(state.clone(), "whitelist player delete");

    Ok(Json(MessageResponse {
        message: "白名单记录已删除，服务器准入缓存正在后台刷新".to_string(),
    }))
}

pub(crate) async fn update_whitelist_status_handler(
    State(state): State<SharedState>,
    Path(path): Path<WhitelistPlayerPath>,
    headers: HeaderMap,
    Json(body): Json<ReviewWhitelistBody>,
) -> AppResult<Json<MessageResponse>> {
    let status = body.status.unwrap_or_default();
    if status != "approved" && status != "rejected" {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "审核状态仅支持 approved 或 rejected",
        ));
    }

    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    whitelist::review_whitelist_player(
        &state.pool,
        &path.player_id,
        &status,
        body.note,
        Some(current_admin.id),
    )
    .await?;
    trigger_access_snapshot_refresh(state.clone(), "whitelist status update");

    Ok(Json(MessageResponse {
        message: "白名单状态已更新，服务器准入缓存正在后台刷新".to_string(),
    }))
}

fn trigger_access_snapshot_refresh(state: SharedState, source: &'static str) {
    tokio::spawn(async move {
        if let Err(error) = server_access::refresh_all_server_access_snapshots(
            &state.pool,
            &state.redis,
            &state.http_client,
            &state.access_control,
        )
        .await
        {
            eprintln!(
                "failed to refresh server access snapshots after {}: {}",
                source, error
            );
        }
    });
}
