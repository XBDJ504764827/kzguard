use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::{
    application::{auth, bans, communities, server_access, server_presence},
    domain::models::{
        BanRecord, Community, RconVerificationResult, Server, ServerPlayersSnapshot,
    },
    error::AppResult,
    http::{
        common::{ApiEnvelope, MessageResponse},
        requests::{
            BanServerPlayerDraft, CommunityPath, CreateCommunityBody, KickBody, PlayerPath,
            ServerDraft, ServerPath, ServerSettingsDraft, UpdateCommunityBody,
        },
    },
    state::SharedState,
    support::web::bearer_token_from_headers,
};

pub(crate) async fn list_communities_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<Vec<Community>>>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let communities = communities::list_communities(
        &state.pool,
        &state.redis,
        current_admin.role == "system_admin",
    )
    .await?;
    Ok(Json(ApiEnvelope::new(communities)))
}

pub(crate) async fn create_community_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<CreateCommunityBody>,
) -> AppResult<impl IntoResponse> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let community = communities::create_community(
        &state.pool,
        body.name.unwrap_or_default(),
        Some(current_admin.id),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(community, "社区创建成功")),
    ))
}

pub(crate) async fn update_community_handler(
    State(state): State<SharedState>,
    Path(path): Path<CommunityPath>,
    headers: HeaderMap,
    Json(body): Json<UpdateCommunityBody>,
) -> AppResult<Json<ApiEnvelope<Community>>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let community = communities::update_community(
        &state.pool,
        &state.redis,
        &path.community_id,
        body.name.unwrap_or_default(),
        Some(current_admin.id),
        current_admin.role == "system_admin",
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(community, "社区名称已更新")))
}

pub(crate) async fn delete_community_handler(
    State(state): State<SharedState>,
    Path(path): Path<CommunityPath>,
    headers: HeaderMap,
) -> AppResult<Json<MessageResponse>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    communities::delete_community(&state.pool, &path.community_id, Some(current_admin.id)).await?;

    Ok(Json(MessageResponse {
        message: "社区已删除".to_string(),
    }))
}

pub(crate) async fn verify_server_rcon_handler(
    State(state): State<SharedState>,
    Path(path): Path<CommunityPath>,
    headers: HeaderMap,
    Json(draft): Json<ServerDraft>,
) -> AppResult<Json<ApiEnvelope<RconVerificationResult>>> {
    let token = bearer_token_from_headers(&headers);
    let _current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let result = communities::verify_server_rcon(&state.pool, &path.community_id, draft).await?;

    Ok(Json(ApiEnvelope::with_message(result, "RCON 校验成功")))
}

pub(crate) async fn create_server_handler(
    State(state): State<SharedState>,
    Path(path): Path<CommunityPath>,
    headers: HeaderMap,
    Json(draft): Json<ServerDraft>,
) -> AppResult<impl IntoResponse> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let server =
        communities::create_server(&state.pool, &path.community_id, draft, Some(current_admin.id))
            .await?;
    server_access::refresh_server_access_snapshot(
        &state.pool,
        &state.redis,
        &state.http_client,
        &state.access_control,
        &server.id,
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
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let server = communities::update_server_settings(
        &state.pool,
        &state.redis,
        &path.community_id,
        &path.server_id,
        draft,
        Some(current_admin.id),
    )
    .await?;
    server_access::refresh_server_access_snapshot(
        &state.pool,
        &state.redis,
        &state.http_client,
        &state.access_control,
        &server.id,
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(server, "服务器设置已更新")))
}


pub(crate) async fn reset_server_plugin_token_handler(
    State(state): State<SharedState>,
    Path(path): Path<ServerPath>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<Server>>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let server = communities::reset_server_plugin_token(
        &state.pool,
        &state.redis,
        &path.community_id,
        &path.server_id,
        Some(current_admin.id),
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(server, "插件 Token 已重置")))
}

pub(crate) async fn restart_server_handler(
    State(state): State<SharedState>,
    Path(path): Path<ServerPath>,
    headers: HeaderMap,
) -> AppResult<Json<MessageResponse>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    communities::restart_server(
        &state.pool,
        &path.community_id,
        &path.server_id,
        Some(current_admin.id),
    )
    .await?;

    Ok(Json(MessageResponse {
        message: "重启指令已发送".to_string(),
    }))
}

pub(crate) async fn delete_server_handler(
    State(state): State<SharedState>,
    Path(path): Path<ServerPath>,
    headers: HeaderMap,
) -> AppResult<Json<MessageResponse>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    communities::delete_server(
        &state.pool,
        &path.community_id,
        &path.server_id,
        Some(current_admin.id),
    )
    .await?;
    server_access::remove_server_access_snapshot(&state.redis, &path.server_id).await?;

    Ok(Json(MessageResponse {
        message: "服务器已删除".to_string(),
    }))
}

pub(crate) async fn list_server_players_handler(
    State(state): State<SharedState>,
    Path(path): Path<ServerPath>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<ServerPlayersSnapshot>>> {
    let token = bearer_token_from_headers(&headers);
    let _current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let snapshot = server_presence::get_server_players_snapshot(
        &state.pool,
        &state.redis,
        &path.community_id,
        &path.server_id,
    )
    .await?;

    Ok(Json(ApiEnvelope::new(snapshot)))
}

pub(crate) async fn kick_player_handler(
    State(state): State<SharedState>,
    Path(path): Path<PlayerPath>,
    headers: HeaderMap,
    Json(body): Json<KickBody>,
) -> AppResult<Json<MessageResponse>> {
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    communities::kick_server_player(
        &state.pool,
        &state.redis,
        state.player_presence_ttl_seconds,
        &path.community_id,
        &path.server_id,
        &path.player_id,
        body.reason.unwrap_or_default(),
        Some(current_admin.id),
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
    let token = bearer_token_from_headers(&headers);
    let current_admin = auth::require_authenticated_admin(&state.pool, token.as_deref()).await?;

    let ban = bans::ban_server_player(
        &state.pool,
        &state.redis,
        state.player_presence_ttl_seconds,
        &path.community_id,
        &path.server_id,
        &path.player_id,
        draft,
        Some(current_admin.id),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::<BanRecord>::with_message(ban, "玩家已封禁")),
    ))
}
