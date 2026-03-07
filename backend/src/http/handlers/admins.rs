use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};

use crate::{
    application::{admins, auth},
    domain::models::WebsiteAdmin,
    error::AppResult,
    http::{
        common::ApiEnvelope,
        requests::{AdminPath, WebsiteAdminUpdateDraft},
    },
    state::SharedState,
    support::web::bearer_token_from_headers,
};

pub(crate) async fn list_admins_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<Vec<WebsiteAdmin>>>> {
    let token = bearer_token_from_headers(&headers);
    let _current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let admins = admins::list_website_admins(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(admins)))
}

pub(crate) async fn update_admin_handler(
    State(state): State<SharedState>,
    Path(path): Path<AdminPath>,
    headers: HeaderMap,
    Json(draft): Json<WebsiteAdminUpdateDraft>,
) -> AppResult<Json<ApiEnvelope<WebsiteAdmin>>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let admin = admins::update_website_admin(&state.pool, &path.admin_id, draft, Some(current_admin.id)).await?;

    Ok(Json(ApiEnvelope::with_message(admin, "管理员信息已更新")))
}
