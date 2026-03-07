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
            ApplicationDraft, ManualWhitelistDraft, ReviewWhitelistBody, WhitelistPlayerPath,
            WhitelistQuery,
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

pub(crate) async fn create_whitelist_application_handler(
    State(state): State<SharedState>,
    Json(draft): Json<ApplicationDraft>,
) -> AppResult<impl IntoResponse> {
    let player = whitelist::create_application(&state.pool, draft).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(player, "白名单申请已提交")),
    ))
}

pub(crate) async fn create_whitelist_manual_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(draft): Json<ManualWhitelistDraft>,
) -> AppResult<impl IntoResponse> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let player = whitelist::create_manual_whitelist_entry(&state.pool, draft, Some(current_admin.id)).await?;
    server_access::refresh_all_server_access_snapshots(
        &state.pool,
        &state.redis,
        &state.http_client,
        &state.access_control,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(player, "玩家已手动录入")),
    ))
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
    server_access::refresh_all_server_access_snapshots(
        &state.pool,
        &state.redis,
        &state.http_client,
        &state.access_control,
    )
    .await?;

    Ok(Json(MessageResponse {
        message: "白名单状态已更新".to_string(),
    }))
}
