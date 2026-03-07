use axum::{Json, extract::State, http::HeaderMap};

use crate::{
    application::auth,
    domain::models::UserSummary,
    error::AppResult,
    infra::seed::users_summary,
    state::SharedState,
    support::web::bearer_token_from_headers,
};

pub(crate) async fn user_summary_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<Json<UserSummary>> {
    let token = bearer_token_from_headers(&headers);
    let _current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    Ok(Json(users_summary()))
}
