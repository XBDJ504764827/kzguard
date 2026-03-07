use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    application::{server_access, server_presence},
    domain::models::ServerPresenceReceipt,
    error::{AppError, AppResult},
    http::{
        common::ApiEnvelope,
        requests::ServerPresenceReportBody,
    },
    state::SharedState,
};

pub(crate) async fn report_server_presence_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<ServerPresenceReportBody>,
) -> AppResult<impl IntoResponse> {
    let plugin_token = headers
        .get("x-plugin-token")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::http(StatusCode::UNAUTHORIZED, "缺少插件 token 校验头"))?;

    let receipt = server_presence::report_server_presence(
        &state.pool,
        &state.redis,
        state.player_presence_ttl_seconds,
        body,
        plugin_token,
    )
    .await?;

    if let Err(error) = server_access::refresh_server_access_snapshot(
        &state.pool,
        &state.redis,
        &state.http_client,
        &state.access_control,
        &receipt.server_id,
    )
    .await
    {
        eprintln!(
            "failed to refresh server access snapshot after presence report for {}: {}",
            receipt.server_id, error
        );
    }

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::<ServerPresenceReceipt>::with_message(
            receipt,
            "在线玩家快照上报成功",
        )),
    ))
}
