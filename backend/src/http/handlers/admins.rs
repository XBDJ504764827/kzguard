use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};

use crate::{
    application::admins,
    domain::models::WebsiteAdmin,
    error::AppResult,
    http::{
        common::ApiEnvelope,
        requests::{AdminPath, WebsiteAdminUpdateDraft},
    },
    state::SharedState,
    support::web::operator_id_from_headers,
};

pub(crate) async fn list_admins_handler(
    State(state): State<SharedState>,
) -> AppResult<Json<ApiEnvelope<Vec<WebsiteAdmin>>>> {
    let admins = admins::list_website_admins(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(admins)))
}

pub(crate) async fn update_admin_handler(
    State(state): State<SharedState>,
    Path(path): Path<AdminPath>,
    headers: HeaderMap,
    Json(draft): Json<WebsiteAdminUpdateDraft>,
) -> AppResult<Json<ApiEnvelope<WebsiteAdmin>>> {
    let admin = admins::update_website_admin(
        &state.pool,
        &path.admin_id,
        draft,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(admin, "管理员信息已更新")))
}
