use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    application::{auth, bans},
    domain::models::BanRecord,
    error::AppResult,
    http::{
        common::{ApiEnvelope, MessageResponse},
        requests::{BanPath, BanRecordUpdateDraft, ManualBanDraft},
    },
    state::SharedState,
    support::web::bearer_token_from_headers,
};

pub(crate) async fn list_bans_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<Vec<BanRecord>>>> {
    let token = bearer_token_from_headers(&headers);
    let _current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let bans = bans::list_bans(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(bans)))
}

pub(crate) async fn create_manual_ban_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(draft): Json<ManualBanDraft>,
) -> AppResult<impl IntoResponse> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let ban = bans::create_manual_ban_entry(&state.pool, draft, Some(current_admin.id)).await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(ban, "封禁记录已创建")),
    ))
}

pub(crate) async fn update_ban_handler(
    State(state): State<SharedState>,
    Path(path): Path<BanPath>,
    headers: HeaderMap,
    Json(draft): Json<BanRecordUpdateDraft>,
) -> AppResult<Json<ApiEnvelope<BanRecord>>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let ban = bans::update_ban_record(&state.pool, &path.ban_id, draft, Some(current_admin.id)).await?;

    Ok(Json(ApiEnvelope::with_message(ban, "封禁记录已更新")))
}

pub(crate) async fn revoke_ban_handler(
    State(state): State<SharedState>,
    Path(path): Path<BanPath>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<BanRecord>>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let ban = bans::revoke_ban_record(&state.pool, &path.ban_id, Some(current_admin.id)).await?;

    Ok(Json(ApiEnvelope::with_message(ban, "封禁已解除")))
}

pub(crate) async fn delete_ban_handler(
    State(state): State<SharedState>,
    Path(path): Path<BanPath>,
    headers: HeaderMap,
) -> AppResult<Json<MessageResponse>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    bans::delete_ban_record(&state.pool, &path.ban_id, Some(current_admin.id)).await?;

    Ok(Json(MessageResponse {
        message: "封禁记录已删除".to_string(),
    }))
}
