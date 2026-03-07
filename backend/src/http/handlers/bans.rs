use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    application::bans,
    domain::models::BanRecord,
    error::AppResult,
    http::{
        common::{ApiEnvelope, MessageResponse},
        requests::{BanPath, BanRecordUpdateDraft, ManualBanDraft},
    },
    state::SharedState,
    support::web::operator_id_from_headers,
};

pub(crate) async fn list_bans_handler(
    State(state): State<SharedState>,
) -> AppResult<Json<ApiEnvelope<Vec<BanRecord>>>> {
    let bans = bans::list_bans(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(bans)))
}

pub(crate) async fn create_manual_ban_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(draft): Json<ManualBanDraft>,
) -> AppResult<impl IntoResponse> {
    let ban = bans::create_manual_ban_entry(&state.pool, draft, operator_id_from_headers(&headers))
        .await?;

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
    let ban = bans::update_ban_record(
        &state.pool,
        &path.ban_id,
        draft,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(ban, "封禁记录已更新")))
}

pub(crate) async fn revoke_ban_handler(
    State(state): State<SharedState>,
    Path(path): Path<BanPath>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<BanRecord>>> {
    let ban = bans::revoke_ban_record(
        &state.pool,
        &path.ban_id,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(ban, "封禁已解除")))
}

pub(crate) async fn delete_ban_handler(
    State(state): State<SharedState>,
    Path(path): Path<BanPath>,
    headers: HeaderMap,
) -> AppResult<Json<MessageResponse>> {
    bans::delete_ban_record(
        &state.pool,
        &path.ban_id,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(MessageResponse {
        message: "封禁记录已删除".to_string(),
    }))
}
