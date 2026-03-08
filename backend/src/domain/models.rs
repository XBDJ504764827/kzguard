use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerPlayer {
    pub(crate) id: String,
    pub(crate) user_id: i32,
    pub(crate) nickname: String,
    pub(crate) steam_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) steam_id64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) steam_id3: Option<String>,
    pub(crate) ip_address: String,
    pub(crate) connected_at: String,
    pub(crate) ping: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_reported_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerPlayersSnapshot {
    pub(crate) server_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reported_at: Option<String>,
    pub(crate) player_count: usize,
    pub(crate) players: Vec<ServerPlayer>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerPresenceReceipt {
    pub(crate) server_id: String,
    pub(crate) reported_at: String,
    pub(crate) player_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Server {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) ip: String,
    pub(crate) port: i32,
    pub(crate) rcon_password: String,
    pub(crate) plugin_token: String,
    pub(crate) rcon_verified_at: String,
    pub(crate) restart_configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) restart_command: Option<String>,
    pub(crate) whitelist_enabled: bool,
    pub(crate) entry_verification_enabled: bool,
    pub(crate) min_entry_rating: i32,
    pub(crate) min_steam_level: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) player_reported_at: Option<String>,
    pub(crate) online_players: Vec<ServerPlayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Community {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) created_at: String,
    pub(crate) servers: Vec<Server>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RconVerificationResult {
    pub(crate) verified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WhitelistPlayer {
    pub(crate) id: String,
    pub(crate) nickname: String,
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) contact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) note: Option<String>,
    pub(crate) status: String,
    pub(crate) source: String,
    pub(crate) applied_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WhitelistRestriction {
    pub(crate) player_id: String,
    pub(crate) nickname: String,
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) contact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) note: Option<String>,
    pub(crate) source: String,
    pub(crate) applied_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reviewed_at: Option<String>,
    pub(crate) allowed_server_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WhitelistApplicationHistory {
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
    pub(crate) duplicate_blocked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) block_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) history_hint: Option<String>,
    pub(crate) records: Vec<WhitelistPlayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BanRecord {
    pub(crate) id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) nickname: Option<String>,
    pub(crate) ban_type: String,
    pub(crate) status: String,
    pub(crate) steam_identifier: String,
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) ip_address: Option<String>,
    pub(crate) reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) duration_seconds: Option<i32>,
    pub(crate) banned_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) server_id: Option<String>,
    pub(crate) server_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) community_name: Option<String>,
    pub(crate) operator_id: String,
    pub(crate) operator_name: String,
    pub(crate) operator_role: String,
    pub(crate) source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) revoked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) revoked_by_operator_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) revoked_by_operator_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) revoked_by_operator_role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebsiteAdmin {
    pub(crate) id: String,
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) role: String,
    #[serde(skip_serializing)]
    pub(crate) password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) note: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationLog {
    pub(crate) id: String,
    pub(crate) created_at: String,
    pub(crate) operator_id: String,
    pub(crate) operator_name: String,
    pub(crate) operator_role: String,
    pub(crate) action: String,
    pub(crate) detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserSummary {
    pub(crate) enabled: bool,
    pub(crate) message: String,
    pub(crate) planned_modules: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AuthSession {
    pub(crate) token: String,
    pub(crate) admin: WebsiteAdmin,
}

#[derive(Debug, Clone)]
pub(crate) struct OperatorSnapshot {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) role: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ResolvedSteamIdentifiers {
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResolvedSteamProfile {
    pub(crate) nickname: String,
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
    pub(crate) profile_url: String,
}



#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlayerAccessProfile {
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) nickname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) rating: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) steam_level: Option<i32>,
    pub(crate) refreshed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerAccessPlayer {
    pub(crate) steam_id64: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id3: String,
    pub(crate) nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) ip_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) rating: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) steam_level: Option<i32>,
    pub(crate) is_whitelisted: bool,
    pub(crate) meets_entry_verification: bool,
    pub(crate) can_join: bool,
    pub(crate) message: String,
    pub(crate) refreshed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerAccessSnapshot {
    pub(crate) server_id: String,
    pub(crate) server_name: String,
    pub(crate) community_name: String,
    pub(crate) generated_at: String,
    pub(crate) whitelist_enabled: bool,
    pub(crate) entry_verification_enabled: bool,
    pub(crate) min_entry_rating: i32,
    pub(crate) min_steam_level: i32,
    pub(crate) players: Vec<ServerAccessPlayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerAccessDecision {
    pub(crate) server_id: String,
    pub(crate) steam_id64: String,
    pub(crate) can_join: bool,
    pub(crate) is_whitelisted: bool,
    pub(crate) meets_entry_verification: bool,
    pub(crate) message: String,
    pub(crate) source: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SeedData {
    pub(crate) communities: Vec<Community>,
    pub(crate) whitelist: Vec<WhitelistPlayer>,
    pub(crate) bans: Vec<BanRecord>,
    pub(crate) admins: Vec<WebsiteAdmin>,
    pub(crate) operation_logs: Vec<OperationLog>,
}
