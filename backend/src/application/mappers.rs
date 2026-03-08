use crate::{
    domain::{db::*, models::*},
    support::steam::resolve_steam_identifiers_strict,
    support::time::naive_to_iso,
};

pub(crate) fn map_whitelist_player(row: DbWhitelistPlayer) -> WhitelistPlayer {
    let resolved = resolve_steam_identifiers_strict(&row.steam_id).ok();
    let steam_id64 = if !row.steam_id64.trim().is_empty() {
        row.steam_id64
    } else {
        resolved
            .as_ref()
            .map(|value| value.steam_id64.clone())
            .unwrap_or_default()
    };
    let steam_id = resolved
        .as_ref()
        .map(|value| value.steam_id.clone())
        .unwrap_or(row.steam_id);
    let steam_id3 = if !row.steam_id3.trim().is_empty() {
        row.steam_id3
    } else {
        resolved
            .as_ref()
            .map(|value| value.steam_id3.clone())
            .unwrap_or_default()
    };

    WhitelistPlayer {
        id: row.id,
        nickname: row.nickname,
        steam_id64,
        steam_id,
        steam_id3,
        contact: row.contact,
        note: row.note,
        status: row.status,
        source: row.source,
        applied_at: naive_to_iso(row.applied_at),
        reviewed_at: row.reviewed_at.map(naive_to_iso),
    }
}

pub(crate) fn map_ban_record(row: DbBanRecord) -> BanRecord {
    BanRecord {
        id: row.id,
        nickname: row.nickname,
        ban_type: row.ban_type,
        status: row.status,
        steam_identifier: row.steam_identifier,
        steam_id64: row.steam_id64,
        steam_id: row.steam_id,
        steam_id3: row.steam_id3,
        ip_address: row.ip_address,
        reason: row.reason,
        duration_seconds: row.duration_seconds,
        banned_at: naive_to_iso(row.banned_at),
        server_id: row.server_id,
        server_name: row.server_name,
        community_name: row.community_name,
        operator_id: row.operator_id,
        operator_name: row.operator_name,
        operator_role: row.operator_role,
        source: row.source,
        updated_at: row.updated_at.map(naive_to_iso),
        revoked_at: row.revoked_at.map(naive_to_iso),
        revoked_by_operator_id: row.revoked_by_operator_id,
        revoked_by_operator_name: row.revoked_by_operator_name,
        revoked_by_operator_role: row.revoked_by_operator_role,
    }
}

pub(crate) fn map_website_admin(row: DbWebsiteAdmin) -> WebsiteAdmin {
    WebsiteAdmin {
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        role: row.role,
        password: row.password,
        email: row.email,
        note: row.note,
        created_at: naive_to_iso(row.created_at),
        updated_at: naive_to_iso(row.updated_at),
    }
}

pub(crate) fn map_operation_log(row: DbOperationLog) -> OperationLog {
    OperationLog {
        id: row.id,
        created_at: naive_to_iso(row.created_at),
        operator_id: row.operator_id,
        operator_name: row.operator_name,
        operator_role: row.operator_role,
        action: row.action,
        detail: row.detail,
    }
}
