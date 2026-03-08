use crate::{
    error::{AppError, AppResult},
    http::requests::{WebsiteAdminCreateDraft, WebsiteAdminUpdateDraft},
};
use axum::http::StatusCode;
use regex::Regex;
use std::sync::OnceLock;

pub(crate) fn require_non_empty(value: &str, message: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        return Err(AppError::http(StatusCode::BAD_REQUEST, message));
    }
    Ok(())
}

pub(crate) fn ipv4_regex() -> &'static Regex {
    static IPV4_REGEX: OnceLock<Regex> = OnceLock::new();
    IPV4_REGEX.get_or_init(|| {
        Regex::new(r"^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$")
            .expect("invalid ipv4 regex")
    })
}

pub(crate) fn validate_server_fields(
    name: Option<&str>,
    ip: &str,
    port: i32,
    rcon_password: &str,
    min_entry_rating: i32,
    min_steam_level: i32,
) -> AppResult<()> {
    if let Some(name) = name {
        require_non_empty(name, "请输入服务器名称")?;
    }

    if !ipv4_regex().is_match(ip.trim()) {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "请输入有效的 IPv4 地址",
        ));
    }

    if !(1..=65535).contains(&port) {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "端口范围需在 1 到 65535 之间",
        ));
    }

    if rcon_password.trim().len() < 6 {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "RCON 密码至少需要 6 位",
        ));
    }

    if min_entry_rating < 0 {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "最小进服 rating 不能小于 0",
        ));
    }

    if min_steam_level < 0 {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "最小 Steam 等级不能小于 0",
        ));
    }

    Ok(())
}

pub(crate) fn validate_application_draft(nickname: &str, steam_id: &str) -> AppResult<()> {
    require_non_empty(nickname, "请输入玩家昵称")?;
    require_non_empty(steam_id, "请输入 Steam 标识")?;
    Ok(())
}

pub(crate) fn validate_manual_whitelist_draft(
    nickname: &str,
    steam_id: &str,
    status: &str,
) -> AppResult<()> {
    validate_application_draft(nickname, steam_id)?;
    if status != "approved" && status != "rejected" {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "管理员手动添加状态仅支持 approved 或 rejected",
        ));
    }
    Ok(())
}

pub(crate) fn validate_ban_draft(
    ban_type: Option<&str>,
    steam_identifier: Option<&str>,
    ip_address: Option<&str>,
    duration_seconds: Option<i32>,
    reason: &str,
) -> AppResult<()> {
    if let Some(identifier) = steam_identifier {
        require_non_empty(identifier, "请输入玩家 Steam 标识")?;
    }

    if let Some(ban_type) = ban_type {
        if ban_type != "steam_account" && ban_type != "ip" {
            return Err(AppError::http(
                StatusCode::BAD_REQUEST,
                "封禁属性仅支持 steam_account 或 ip",
            ));
        }
    }

    if let Some(ip_address) = ip_address {
        let ip_address = ip_address.trim();
        if !ip_address.is_empty() && !ipv4_regex().is_match(ip_address) {
            return Err(AppError::http(
                StatusCode::BAD_REQUEST,
                "玩家 IP 格式不正确",
            ));
        }
    }

    if let Some(duration_seconds) = duration_seconds {
        if duration_seconds < 1 {
            return Err(AppError::http(
                StatusCode::BAD_REQUEST,
                "封禁秒数必须大于 0",
            ));
        }
    }

    require_non_empty(reason, "请输入封禁原因")?;
    Ok(())
}

pub(crate) fn validate_website_admin_update_draft(
    draft: &WebsiteAdminUpdateDraft,
) -> AppResult<()> {
    require_non_empty(&draft.username, "请输入用户名")?;
    require_non_empty(&draft.display_name, "请输入管理员名称")?;

    if !draft.password.trim().is_empty() && draft.password.trim().len() < 6 {
        return Err(AppError::http(StatusCode::BAD_REQUEST, "密码至少需要 6 位"));
    }

    if draft.role != "system_admin" && draft.role != "normal_admin" {
        return Err(AppError::http(StatusCode::BAD_REQUEST, "管理员角色不合法"));
    }

    Ok(())
}

pub(crate) fn validate_website_admin_create_draft(
    draft: &WebsiteAdminCreateDraft,
) -> AppResult<()> {
    require_non_empty(&draft.username, "请输入用户名")?;
    require_non_empty(&draft.display_name, "请输入管理员名称")?;
    require_non_empty(&draft.password, "请输入初始密码")?;

    if draft.password.trim().len() < 6 {
        return Err(AppError::http(StatusCode::BAD_REQUEST, "密码至少需要 6 位"));
    }

    if draft.role != "system_admin" && draft.role != "normal_admin" {
        return Err(AppError::http(StatusCode::BAD_REQUEST, "管理员角色不合法"));
    }

    Ok(())
}
