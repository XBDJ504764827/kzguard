use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    application::bans,
    domain::models::BanRecord,
    error::{AppError, AppResult},
    http::{
        common::ApiEnvelope,
        requests::{InternalServerBanSyncBody, InternalServerUnbanSyncBody},
    },
    state::SharedState,
};

fn require_plugin_token(headers: &HeaderMap) -> AppResult<String> {
    headers
        .get("x-plugin-token")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| AppError::http(StatusCode::UNAUTHORIZED, "缺少插件 token 校验头"))
}

pub(crate) async fn create_server_ban_record_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<InternalServerBanSyncBody>,
) -> AppResult<impl IntoResponse> {
    let plugin_token = require_plugin_token(&headers)?;
    let ban = bans::create_plugin_ban_entry(&state.pool, &plugin_token, body).await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(ban, "游戏内封禁已同步")),
    ))
}

pub(crate) async fn revoke_server_ban_record_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<InternalServerUnbanSyncBody>,
) -> AppResult<Json<ApiEnvelope<BanRecord>>> {
    let plugin_token = require_plugin_token(&headers)?;
    let ban = bans::revoke_plugin_ban_entry(&state.pool, &plugin_token, body).await?;

    Ok(Json(ApiEnvelope::with_message(ban, "游戏内解封已同步")))
}
