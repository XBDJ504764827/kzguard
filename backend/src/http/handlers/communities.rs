use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    application::{bans, communities},
    domain::models::{BanRecord, Community, Server},
    error::AppResult,
    http::{
        common::{ApiEnvelope, MessageResponse},
        requests::{
            BanServerPlayerDraft, CommunityPath, CreateCommunityBody, KickBody, PlayerPath,
            ServerDraft, ServerPath, ServerSettingsDraft,
        },
    },
    state::SharedState,
    support::web::operator_id_from_headers,
};

pub(crate) async fn list_communities_handler(
    State(state): State<SharedState>,
) -> AppResult<Json<ApiEnvelope<Vec<Community>>>> {
    let communities = communities::list_communities(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(communities)))
}

pub(crate) async fn create_community_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<CreateCommunityBody>,
) -> AppResult<impl IntoResponse> {
    let community = communities::create_community(
        &state.pool,
        body.name.unwrap_or_default(),
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(community, "社区创建成功")),
    ))
}

pub(crate) async fn create_server_handler(
    State(state): State<SharedState>,
    Path(path): Path<CommunityPath>,
    headers: HeaderMap,
    Json(draft): Json<ServerDraft>,
) -> AppResult<impl IntoResponse> {
    let server = communities::create_server(
        &state.pool,
        &path.community_id,
        draft,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(server, "服务器添加成功")),
    ))
}

pub(crate) async fn update_server_handler(
    State(state): State<SharedState>,
    Path(path): Path<ServerPath>,
    headers: HeaderMap,
    Json(draft): Json<ServerSettingsDraft>,
) -> AppResult<Json<ApiEnvelope<Server>>> {
    let server = communities::update_server_settings(
        &state.pool,
        &path.community_id,
        &path.server_id,
        draft,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(server, "服务器设置已更新")))
}

pub(crate) async fn kick_player_handler(
    State(state): State<SharedState>,
    Path(path): Path<PlayerPath>,
    headers: HeaderMap,
    Json(body): Json<KickBody>,
) -> AppResult<Json<MessageResponse>> {
    communities::kick_server_player(
        &state.pool,
        &path.community_id,
        &path.server_id,
        &path.player_id,
        body.reason.unwrap_or_default(),
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(MessageResponse {
        message: "玩家已踢出".to_string(),
    }))
}

pub(crate) async fn ban_player_handler(
    State(state): State<SharedState>,
    Path(path): Path<PlayerPath>,
    headers: HeaderMap,
    Json(draft): Json<BanServerPlayerDraft>,
) -> AppResult<impl IntoResponse> {
    let ban = bans::ban_server_player(
        &state.pool,
        &path.community_id,
        &path.server_id,
        &path.player_id,
        draft,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::<BanRecord>::with_message(ban, "玩家已封禁")),
    ))
}
