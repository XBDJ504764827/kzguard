use axum::{Json, extract::State, http::HeaderMap};

use crate::{
    application::{auth, operation_logs},
    domain::models::OperationLog,
    error::AppResult,
    http::common::ApiEnvelope,
    state::SharedState,
    support::web::bearer_token_from_headers,
};

pub(crate) async fn list_operation_logs_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<Vec<OperationLog>>>> {
    let token = bearer_token_from_headers(&headers);
    let _current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let logs = operation_logs::list_operation_logs(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(logs)))
}
