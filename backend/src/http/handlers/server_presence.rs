use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    application::server_presence,
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
    let rcon_password = headers
        .get("x-server-rcon-password")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::http(StatusCode::UNAUTHORIZED, "缺少服务器 RCON 校验头"))?;

    let receipt = server_presence::report_server_presence(
        &state.pool,
        &state.redis,
        state.player_presence_ttl_seconds,
        body,
        rcon_password,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::<ServerPresenceReceipt>::with_message(
            receipt,
            "在线玩家快照上报成功",
        )),
    ))
}
