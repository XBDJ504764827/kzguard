use axum::{
    Json,
    extract::State,
    http::HeaderMap,
};

use crate::{
    application::auth,
    domain::models::{AuthSession, WebsiteAdmin},
    error::AppResult,
    http::{
        common::{ApiEnvelope, MessageResponse},
        requests::LoginBody,
    },
    state::SharedState,
    support::web::{bearer_token_from_headers, client_ip_from_headers, user_agent_from_headers},
};

pub(crate) async fn login_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<LoginBody>,
) -> AppResult<Json<ApiEnvelope<AuthSession>>> {
    let session = auth::login_admin(
        &state.pool,
        body.username,
        body.password,
        user_agent_from_headers(&headers),
        client_ip_from_headers(&headers),
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(session, "登录成功")))
}

pub(crate) async fn auth_session_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<WebsiteAdmin>>> {
    let token = bearer_token_from_headers(&headers);
    let admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;
    Ok(Json(ApiEnvelope::new(admin)))
}

pub(crate) async fn logout_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<Json<MessageResponse>> {
    let token = bearer_token_from_headers(&headers);
    auth::logout_admin(&state.pool, token.as_deref()).await?;

    Ok(Json(MessageResponse {
        message: "已退出登录".to_string(),
    }))
}
