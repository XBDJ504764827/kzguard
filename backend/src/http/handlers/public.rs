use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
};

use crate::{
    application::{bans, whitelist},
    domain::models::{
        BanRecord, ResolvedSteamProfile, WhitelistApplicationHistory, WhitelistPlayer,
    },
    error::AppResult,
    http::{
        common::ApiEnvelope,
        requests::{
            PublicListQuery, PublicSteamResolveQuery, PublicWhitelistApplicationDraft,
            PublicWhitelistHistoryQuery,
        },
    },
    state::SharedState,
    support::steam::resolve_steam_profile,
};

pub(crate) async fn resolve_public_steam_handler(
    Query(query): Query<PublicSteamResolveQuery>,
) -> AppResult<Json<ApiEnvelope<ResolvedSteamProfile>>> {
    let profile = resolve_steam_profile(&query.identifier).await?;
    Ok(Json(ApiEnvelope::new(profile)))
}

pub(crate) async fn get_public_whitelist_history_handler(
    State(state): State<SharedState>,
    Query(query): Query<PublicWhitelistHistoryQuery>,
) -> AppResult<Json<ApiEnvelope<WhitelistApplicationHistory>>> {
    let history = whitelist::get_public_whitelist_history(&state.pool, &query.identifier).await?;
    Ok(Json(ApiEnvelope::new(history)))
}

pub(crate) async fn list_public_whitelist_handler(
    State(state): State<SharedState>,
    Query(query): Query<PublicListQuery>,
) -> AppResult<Json<ApiEnvelope<Vec<WhitelistPlayer>>>> {
    let players = whitelist::list_public_whitelist(&state.pool, query.status, query.search).await?;
    Ok(Json(ApiEnvelope::new(players)))
}

pub(crate) async fn create_public_whitelist_application_handler(
    State(state): State<SharedState>,
    Json(draft): Json<PublicWhitelistApplicationDraft>,
) -> AppResult<impl IntoResponse> {
    let player = whitelist::create_public_application(&state.pool, draft).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(player, "白名单申请已提交，等待管理员审核")),
    ))
}

pub(crate) async fn list_public_bans_handler(
    State(state): State<SharedState>,
    Query(query): Query<PublicListQuery>,
) -> AppResult<Json<ApiEnvelope<Vec<BanRecord>>>> {
    let bans = bans::list_public_bans(&state.pool, query.status, query.search).await?;
    Ok(Json(ApiEnvelope::new(bans)))
}
