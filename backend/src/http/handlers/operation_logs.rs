use axum::{Json, extract::State};

use crate::{
    application::operation_logs, domain::models::OperationLog, error::AppResult,
    http::common::ApiEnvelope, state::SharedState,
};

pub(crate) async fn list_operation_logs_handler(
    State(state): State<SharedState>,
) -> AppResult<Json<ApiEnvelope<Vec<OperationLog>>>> {
    let logs = operation_logs::list_operation_logs(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(logs)))
}
