use chrono::NaiveDateTime;
use sqlx::FromRow;

#[derive(Debug, FromRow)]
pub(crate) struct DbCommunity {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) created_at: NaiveDateTime,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbServer {
    pub(crate) id: String,
    pub(crate) community_id: String,
    pub(crate) name: String,
    pub(crate) ip: String,
    pub(crate) port: i32,
    pub(crate) rcon_password: String,
    pub(crate) plugin_token: String,
    pub(crate) rcon_verified_at: NaiveDateTime,
    pub(crate) whitelist_enabled: i8,
    pub(crate) entry_verification_enabled: i8,
    pub(crate) min_entry_rating: i32,
    pub(crate) min_steam_level: i32,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbServerPresenceAuth {
    pub(crate) id: String,
    pub(crate) plugin_token: String,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbLiveServerTarget {
    pub(crate) name: String,
    pub(crate) community_name: String,
    pub(crate) ip: String,
    pub(crate) port: i32,
    pub(crate) rcon_password: String,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbWhitelistPlayer {
    pub(crate) id: String,
    pub(crate) nickname: String,
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
    pub(crate) contact: Option<String>,
    pub(crate) note: Option<String>,
    pub(crate) status: String,
    pub(crate) source: String,
    pub(crate) applied_at: NaiveDateTime,
    pub(crate) reviewed_at: Option<NaiveDateTime>,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbBanRecord {
    pub(crate) id: String,
    pub(crate) nickname: Option<String>,
    pub(crate) ban_type: String,
    pub(crate) status: String,
    pub(crate) steam_identifier: String,
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
    pub(crate) ip_address: Option<String>,
    pub(crate) reason: String,
    pub(crate) duration_seconds: Option<i32>,
    pub(crate) banned_at: NaiveDateTime,
    pub(crate) server_id: Option<String>,
    pub(crate) server_name: String,
    pub(crate) community_name: Option<String>,
    pub(crate) operator_id: String,
    pub(crate) operator_name: String,
    pub(crate) operator_role: String,
    pub(crate) source: String,
    pub(crate) updated_at: Option<NaiveDateTime>,
    pub(crate) revoked_at: Option<NaiveDateTime>,
    pub(crate) revoked_by_operator_id: Option<String>,
    pub(crate) revoked_by_operator_name: Option<String>,
    pub(crate) revoked_by_operator_role: Option<String>,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbWebsiteAdmin {
    pub(crate) id: String,
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) role: String,
    pub(crate) password: String,
    pub(crate) email: Option<String>,
    pub(crate) note: Option<String>,
    pub(crate) created_at: NaiveDateTime,
    pub(crate) updated_at: NaiveDateTime,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbOperationLog {
    pub(crate) id: String,
    pub(crate) created_at: NaiveDateTime,
    pub(crate) operator_id: String,
    pub(crate) operator_name: String,
    pub(crate) operator_role: String,
    pub(crate) action: String,
    pub(crate) detail: String,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbCommunityName {
    pub(crate) name: String,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbServerDeleteTarget {
    pub(crate) name: String,
    pub(crate) ip: String,
    pub(crate) port: i32,
    pub(crate) community_name: String,
}


#[derive(Debug, FromRow)]
pub(crate) struct DbServerAccessTarget {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) community_name: String,
    pub(crate) plugin_token: String,
    pub(crate) whitelist_enabled: i8,
    pub(crate) entry_verification_enabled: i8,
    pub(crate) min_entry_rating: i32,
    pub(crate) min_steam_level: i32,
}

#[derive(Debug, FromRow)]
pub(crate) struct DbServerIdOnly {
    pub(crate) id: String,
}
