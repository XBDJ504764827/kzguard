pub(crate) mod common;
pub(crate) mod handlers;
pub(crate) mod requests;

use crate::state::SharedState;
use axum::{
    Router,
    http::Method,
    routing::{get, patch, post},
};
use handlers::*;
use tower_http::cors::{Any, CorsLayer};

pub(crate) fn build_router(state: SharedState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ]);

    Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/auth/login", post(login_handler))
        .route("/api/auth/session", get(auth_session_handler))
        .route("/api/auth/logout", post(logout_handler))
        .route("/api/public/steam/resolve", get(resolve_public_steam_handler))
        .route(
            "/api/public/whitelist/history",
            get(get_public_whitelist_history_handler),
        )
        .route("/api/public/whitelist", get(list_public_whitelist_handler))
        .route(
            "/api/public/whitelist/applications",
            post(create_public_whitelist_application_handler),
        )
        .route("/api/public/bans", get(list_public_bans_handler))
        .route("/api/internal/server-presence/report", post(report_server_presence_handler))
        .route("/api/internal/server-access/check", get(check_server_access_handler))
        .route("/api/internal/server-access/sync", get(sync_server_access_handler))
        .route("/api/internal/server-bans", post(create_server_ban_record_handler))
        .route(
            "/api/internal/server-bans/revoke",
            post(revoke_server_ban_record_handler),
        )
        .route(
            "/api/communities",
            get(list_communities_handler).post(create_community_handler),
        )
        .route(
            "/api/communities/{community_id}",
            patch(update_community_handler).delete(delete_community_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/verify-rcon",
            post(verify_server_rcon_handler),
        )
        .route(
            "/api/communities/{community_id}/servers",
            post(create_server_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/{server_id}",
            patch(update_server_handler).delete(delete_server_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/{server_id}/plugin-token/reset",
            post(reset_server_plugin_token_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/{server_id}/restart",
            post(restart_server_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/{server_id}/players",
            get(list_server_players_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/{server_id}/players/{player_id}/kick",
            post(kick_player_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/{server_id}/players/{player_id}/ban",
            post(ban_player_handler),
        )
        .route("/api/whitelist", get(list_whitelist_handler))
        .route(
            "/api/whitelist/restrictions",
            get(list_whitelist_restrictions_handler),
        )
        .route("/api/whitelist/manual", post(create_whitelist_manual_handler))
        .route(
            "/api/whitelist/{player_id}",
            patch(update_whitelist_player_handler).delete(delete_whitelist_player_handler),
        )
        .route(
            "/api/whitelist/{player_id}/restriction",
            post(add_whitelist_restriction_handler)
                .patch(update_whitelist_restriction_handler)
                .delete(delete_whitelist_restriction_handler),
        )
        .route(
            "/api/whitelist/{player_id}/status",
            patch(update_whitelist_status_handler),
        )
        .route("/api/bans", get(list_bans_handler))
        .route("/api/bans/manual", post(create_manual_ban_handler))
        .route(
            "/api/bans/{ban_id}",
            patch(update_ban_handler).delete(delete_ban_handler),
        )
        .route("/api/bans/{ban_id}/revoke", post(revoke_ban_handler))
        .route("/api/admins", get(list_admins_handler).post(create_admin_handler))
        .route("/api/admins/{admin_id}", patch(update_admin_handler))
        .route("/api/operation-logs", get(list_operation_logs_handler))
        .route("/api/users/summary", get(user_summary_handler))
        .with_state(state)
        .layer(cors)
}
