use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    application::whitelist,
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
    support::web::operator_id_from_headers,
};

pub(crate) async fn list_whitelist_handler(
    State(state): State<SharedState>,
    Query(query): Query<WhitelistQuery>,
) -> AppResult<Json<ApiEnvelope<Vec<WhitelistPlayer>>>> {
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
    let player = whitelist::create_manual_whitelist_entry(
        &state.pool,
        draft,
        operator_id_from_headers(&headers),
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

    whitelist::review_whitelist_player(
        &state.pool,
        &path.player_id,
        &status,
        body.note,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(MessageResponse {
        message: "白名单状态已更新".to_string(),
    }))
}
