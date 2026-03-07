use crate::{
    domain::models::ResolvedSteamIdentifiers,
    error::{AppError, AppResult},
};
use axum::http::StatusCode;
use regex::Regex;
use std::sync::OnceLock;

const STEAM_PENDING_TEXT: &str = "待后端识别";
const STEAM_ID64_BASE: u64 = 76561197960265728;

pub(crate) fn steam_profile_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"steamcommunity\.com/profiles/(\d{17})").expect("invalid steam profile regex")
    })
}

pub(crate) fn steam_id_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX
        .get_or_init(|| Regex::new(r"^STEAM_[0-5]:([0-1]):(\d+)$").expect("invalid steam id regex"))
}

pub(crate) fn steam_id3_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"^\[?U:1:(\d+)\]?$").expect("invalid steam id3 regex"))
}

pub(crate) fn resolve_steam_identifiers(input: &str) -> AppResult<ResolvedSteamIdentifiers> {
    let input = input.trim();
    if input.is_empty() {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "请输入玩家 Steam 标识",
        ));
    }

    if let Some(captures) = steam_profile_regex().captures(input) {
        if let Ok(steam_id64) = captures[1].parse::<u64>() {
            if steam_id64 >= STEAM_ID64_BASE {
                return Ok(from_account_id(steam_id64 - STEAM_ID64_BASE));
            }
        }
    }

    if input.len() == 17 && input.chars().all(|char| char.is_ascii_digit()) {
        if let Ok(steam_id64) = input.parse::<u64>() {
            if steam_id64 >= STEAM_ID64_BASE {
                return Ok(from_account_id(steam_id64 - STEAM_ID64_BASE));
            }
        }
    }

    if let Some(captures) = steam_id_regex().captures(input) {
        let y = captures[1].parse::<u64>().unwrap_or(0);
        let z = captures[2].parse::<u64>().unwrap_or(0);
        return Ok(from_account_id(z * 2 + y));
    }

    if let Some(captures) = steam_id3_regex().captures(input) {
        let account_id = captures[1].parse::<u64>().unwrap_or(0);
        return Ok(from_account_id(account_id));
    }

    Ok(ResolvedSteamIdentifiers {
        steam_id64: STEAM_PENDING_TEXT.to_string(),
        steam_id: STEAM_PENDING_TEXT.to_string(),
        steam_id3: STEAM_PENDING_TEXT.to_string(),
    })
}

pub(crate) fn from_account_id(account_id: u64) -> ResolvedSteamIdentifiers {
    let y = account_id % 2;
    let z = (account_id - y) / 2;
    ResolvedSteamIdentifiers {
        steam_id64: (STEAM_ID64_BASE + account_id).to_string(),
        steam_id: format!("STEAM_1:{}:{}", y, z),
        steam_id3: format!("[U:1:{}]", account_id),
    }
}
