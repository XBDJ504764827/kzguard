use axum::Json;

use crate::{domain::models::UserSummary, infra::seed::users_summary};

pub(crate) async fn user_summary_handler() -> Json<UserSummary> {
    Json(users_summary())
}
