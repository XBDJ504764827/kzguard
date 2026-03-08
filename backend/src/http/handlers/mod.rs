pub(crate) mod admins;
pub(crate) mod auth;
pub(crate) mod bans;
pub(crate) mod communities;
pub(crate) mod health;
pub(crate) mod operation_logs;
pub(crate) mod public;
pub(crate) mod server_access;
pub(crate) mod server_bans;
pub(crate) mod server_presence;
pub(crate) mod users;
pub(crate) mod whitelist;

pub(crate) use admins::{create_admin_handler, list_admins_handler, update_admin_handler};
pub(crate) use auth::{auth_session_handler, login_handler, logout_handler};
pub(crate) use bans::{
    create_manual_ban_handler, delete_ban_handler, list_bans_handler, revoke_ban_handler,
    update_ban_handler,
};
pub(crate) use communities::{
    ban_player_handler, create_community_handler, create_server_handler, delete_community_handler,
    delete_server_handler, kick_player_handler, list_communities_handler,
    list_server_players_handler, reset_server_plugin_token_handler, update_community_handler,
    update_server_handler, verify_server_rcon_handler,
};
pub(crate) use health::health_handler;
pub(crate) use operation_logs::list_operation_logs_handler;
pub(crate) use public::{
    create_public_whitelist_application_handler, get_public_whitelist_history_handler,
    list_public_bans_handler, list_public_whitelist_handler, resolve_public_steam_handler,
};
pub(crate) use server_bans::{create_server_ban_record_handler, revoke_server_ban_record_handler};
pub(crate) use server_presence::report_server_presence_handler;
pub(crate) use users::user_summary_handler;
pub(crate) use whitelist::{
    create_whitelist_manual_handler, delete_whitelist_player_handler, list_whitelist_handler,
    update_whitelist_player_handler, update_whitelist_status_handler,
};

pub(crate) use server_access::{check_server_access_handler, sync_server_access_handler};
