use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct LoginBody {
    pub(crate) username: String,
    pub(crate) password: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateCommunityBody {
    pub(crate) name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateCommunityBody {
    pub(crate) name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerDraft {
    pub(crate) name: String,
    pub(crate) ip: String,
    pub(crate) port: i32,
    pub(crate) rcon_password: String,
    pub(crate) restart_command: Option<String>,
    pub(crate) whitelist_enabled: bool,
    pub(crate) entry_verification_enabled: bool,
    pub(crate) min_entry_rating: i32,
    pub(crate) min_steam_level: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerSettingsDraft {
    pub(crate) ip: String,
    pub(crate) port: i32,
    pub(crate) rcon_password: String,
    pub(crate) restart_command: Option<String>,
    pub(crate) whitelist_enabled: bool,
    pub(crate) entry_verification_enabled: bool,
    pub(crate) min_entry_rating: i32,
    pub(crate) min_steam_level: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerPresencePlayerReport {
    pub(crate) user_id: i32,
    pub(crate) nickname: String,
    pub(crate) steam_id: String,
    pub(crate) steam_id64: Option<String>,
    pub(crate) steam_id3: Option<String>,
    pub(crate) ip_address: Option<String>,
    pub(crate) connected_seconds: i64,
    pub(crate) ping: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerPresenceReportBody {
    pub(crate) server_id: String,
    pub(crate) players: Vec<ServerPresencePlayerReport>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KickBody {
    pub(crate) reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BanServerPlayerDraft {
    pub(crate) ban_type: String,
    pub(crate) reason: String,
    pub(crate) duration_seconds: Option<i32>,
    pub(crate) ip_address: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManualBanDraft {
    pub(crate) nickname: Option<String>,
    pub(crate) ban_type: String,
    pub(crate) steam_identifier: String,
    pub(crate) ip_address: Option<String>,
    pub(crate) duration_seconds: Option<i32>,
    pub(crate) reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BanRecordUpdateDraft {
    pub(crate) nickname: Option<String>,
    pub(crate) ban_type: String,
    pub(crate) steam_identifier: String,
    pub(crate) ip_address: Option<String>,
    pub(crate) duration_seconds: Option<i32>,
    pub(crate) reason: String,
    pub(crate) server_name: Option<String>,
    pub(crate) community_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublicWhitelistApplicationDraft {
    pub(crate) nickname: Option<String>,
    pub(crate) steam_identifier: String,
    pub(crate) contact: Option<String>,
    pub(crate) note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManualWhitelistDraft {
    pub(crate) nickname: String,
    pub(crate) steam_id: String,
    pub(crate) contact: Option<String>,
    pub(crate) note: Option<String>,
    pub(crate) status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WhitelistPlayerUpdateDraft {
    pub(crate) nickname: String,
    pub(crate) steam_id: String,
    pub(crate) contact: Option<String>,
    pub(crate) note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReviewWhitelistBody {
    pub(crate) status: Option<String>,
    pub(crate) note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebsiteAdminCreateDraft {
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) password: String,
    pub(crate) email: Option<String>,
    pub(crate) note: Option<String>,
    pub(crate) role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebsiteAdminUpdateDraft {
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) password: String,
    pub(crate) email: Option<String>,
    pub(crate) note: Option<String>,
    pub(crate) role: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WhitelistQuery {
    pub(crate) status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PublicListQuery {
    pub(crate) status: Option<String>,
    pub(crate) search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PublicSteamResolveQuery {
    pub(crate) identifier: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PublicWhitelistHistoryQuery {
    pub(crate) identifier: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CommunityPath {
    pub(crate) community_id: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ServerPath {
    pub(crate) community_id: String,
    pub(crate) server_id: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PlayerPath {
    pub(crate) community_id: String,
    pub(crate) server_id: String,
    pub(crate) player_id: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BanPath {
    pub(crate) ban_id: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AdminPath {
    pub(crate) admin_id: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WhitelistPlayerPath {
    pub(crate) player_id: String,
}


#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InternalServerBanSyncBody {
    pub(crate) server_id: String,
    pub(crate) nickname: Option<String>,
    pub(crate) ban_type: String,
    pub(crate) steam_identifier: String,
    pub(crate) ip_address: Option<String>,
    pub(crate) reason: String,
    pub(crate) duration_seconds: Option<i32>,
    pub(crate) operator_name: Option<String>,
    pub(crate) operator_steam_identifier: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InternalServerUnbanSyncBody {
    pub(crate) server_id: String,
    pub(crate) identity: String,
    pub(crate) operator_name: Option<String>,
    pub(crate) operator_steam_identifier: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InternalServerSyncQuery {
    pub(crate) server_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InternalServerAccessCheckQuery {
    pub(crate) server_id: String,
    pub(crate) steam_id64: String,
    pub(crate) steam_id: Option<String>,
    pub(crate) steam_id3: Option<String>,
    pub(crate) nickname: Option<String>,
    pub(crate) ip_address: Option<String>,
}
