use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header::CONTENT_TYPE},
    response::IntoResponse,
};

use crate::{
    application::server_access::{
        self, AccessCheckInput, render_server_access_decision_as_text,
        render_server_access_snapshot_as_keyvalues,
    },
    error::{AppError, AppResult},
    http::requests::{InternalServerAccessCheckQuery, InternalServerSyncQuery},
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

pub(crate) async fn sync_server_access_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<InternalServerSyncQuery>,
) -> AppResult<impl IntoResponse> {
    let plugin_token = require_plugin_token(&headers)?;
    let snapshot = server_access::sync_server_access_snapshot_for_server(
        &state.pool,
        &state.redis,
        &state.http_client,
        &state.access_control,
        &query.server_id,
        &plugin_token,
    )
    .await?;

    Ok((
        StatusCode::OK,
        [(CONTENT_TYPE, "text/plain; charset=utf-8")],
        render_server_access_snapshot_as_keyvalues(&snapshot),
    ))
}

pub(crate) async fn check_server_access_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<InternalServerAccessCheckQuery>,
) -> AppResult<impl IntoResponse> {
    let plugin_token = require_plugin_token(&headers)?;
    let decision = server_access::check_player_access_for_server(
        &state.pool,
        &state.redis,
        &state.http_client,
        &state.access_control,
        &query.server_id,
        &plugin_token,
        AccessCheckInput {
            steam_id64: query.steam_id64,
            steam_id: query.steam_id,
            steam_id3: query.steam_id3,
            nickname: query.nickname,
            ip_address: query.ip_address,
        },
    )
    .await?;

    Ok((
        StatusCode::OK,
        [(CONTENT_TYPE, "text/plain; charset=utf-8")],
        render_server_access_decision_as_text(&decision),
    ))
}
