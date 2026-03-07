pub(crate) mod auth;
pub(crate) mod admins;
pub(crate) mod bans;
pub(crate) mod communities;
pub(crate) mod health;
pub(crate) mod operation_logs;
pub(crate) mod users;
pub(crate) mod whitelist;

pub(crate) use admins::{list_admins_handler, update_admin_handler};
pub(crate) use bans::{
    create_manual_ban_handler, delete_ban_handler, list_bans_handler, revoke_ban_handler,
    update_ban_handler,
};
pub(crate) use communities::{
    ban_player_handler, create_community_handler, create_server_handler, kick_player_handler,
    list_communities_handler, update_server_handler,
};
pub(crate) use health::health_handler;
pub(crate) use operation_logs::list_operation_logs_handler;
pub(crate) use users::user_summary_handler;
pub(crate) use whitelist::{
    create_whitelist_application_handler, create_whitelist_manual_handler, list_whitelist_handler,
    update_whitelist_status_handler,
};

pub(crate) use auth::{auth_session_handler, login_handler, logout_handler};
