use crate::{
    domain::models::{ResolvedSteamIdentifiers, ResolvedSteamProfile},
    error::{AppError, AppResult},
};
use axum::http::StatusCode;
use regex::Regex;
use reqwest::Client;
use serde::Deserialize;
use std::sync::OnceLock;

const STEAM_ID64_BASE: u64 = 76561197960265728;

enum SteamLookupTarget {
    Id64(String),
    Vanity(String),
}

#[derive(Debug, Deserialize)]
struct GoKzPlayerResponse {
    name: String,
    steamid64: String,
    rating: f64,
}

#[derive(Debug, Deserialize)]
struct SteamLevelEnvelope {
    response: SteamLevelBody,
}

#[derive(Debug, Deserialize)]
struct SteamLevelBody {
    #[serde(default)]
    player_level: i32,
}

pub(crate) fn steam_profile_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"steamcommunity\.com/profiles/(\d{17})(?:/)?(?:\?.*)?$")
            .expect("invalid steam profile regex")
    })
}

pub(crate) fn steam_vanity_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"steamcommunity\.com/id/([^/?#]+)(?:/)?(?:\?.*)?$")
            .expect("invalid steam vanity regex")
    })
}

pub(crate) fn steam_id_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX
        .get_or_init(|| Regex::new(r"^STEAM_[0-5]:([0-1]):(\d+)$").expect("invalid steam id regex"))
}

pub(crate) fn steam_id3_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"^\[?U:1:(\d+)\]?$" ).expect("invalid steam id3 regex"))
}

pub(crate) fn resolve_steam_identifiers_strict(input: &str) -> AppResult<ResolvedSteamIdentifiers> {
    try_resolve_steam_identifiers(input)?.ok_or_else(|| {
        AppError::http(
            StatusCode::BAD_REQUEST,
            "无法识别该 Steam 标识，请输入 SteamID64、SteamID、SteamID3 或个人资料链接",
        )
    })
}

pub(crate) async fn resolve_steam_profile(input: &str) -> AppResult<ResolvedSteamProfile> {
    let lookup_target = parse_steam_lookup_target(input)?;
    let request_url = match &lookup_target {
        SteamLookupTarget::Id64(steam_id64) => {
            format!("https://steamcommunity.com/profiles/{steam_id64}?xml=1")
        }
        SteamLookupTarget::Vanity(vanity) => {
            format!("https://steamcommunity.com/id/{vanity}?xml=1")
        }
    };

    let response = reqwest::get(&request_url).await.map_err(|error| {
        AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("Steam 社区查询失败：{}", error),
        )
    })?;
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("Steam 社区响应读取失败：{}", error),
        )
    })?;

    if !status.is_success() {
        return Err(AppError::http(
            StatusCode::BAD_GATEWAY,
            "Steam 社区查询失败，请稍后重试",
        ));
    }

    if let Some(message) = extract_xml_tag(&body, "error").filter(|value| !value.is_empty()) {
        return Err(AppError::http(
            StatusCode::NOT_FOUND,
            format!("无法查询到该 Steam 玩家：{}", message),
        ));
    }

    let steam_id64 = extract_xml_tag(&body, "steamID64")
        .filter(|value| value.len() == 17 && value.chars().all(|char| char.is_ascii_digit()))
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未查询到有效的 SteamID64"))?;
    let nickname = extract_xml_tag(&body, "steamID")
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未查询到该玩家的游戏名称"))?;
    let identifiers = resolve_steam_identifiers_strict(&steam_id64)?;

    Ok(ResolvedSteamProfile {
        nickname,
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        profile_url: format!("https://steamcommunity.com/profiles/{steam_id64}"),
    })
}

pub(crate) async fn fetch_gokz_rating(
    http_client: &Client,
    base_url: &str,
    steam_id64: &str,
) -> AppResult<(Option<String>, f64)> {
    let request_url = format!(
        "{}/players/{}",
        base_url.trim_end_matches('/'),
        steam_id64.trim()
    );

    let response = http_client.get(&request_url).send().await.map_err(|error| {
        AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("GOKZ rating 查询失败：{}", error),
        )
    })?;

    if !response.status().is_success() {
        return Err(AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("GOKZ rating 查询失败，HTTP 状态码：{}", response.status()),
        ));
    }

    let payload = serde_json::from_str::<GoKzPlayerResponse>(
        &response.text().await.map_err(|error| {
            AppError::http(
                StatusCode::BAD_GATEWAY,
                format!("GOKZ rating 响应读取失败：{}", error),
            )
        })?,
    )
    .map_err(|error| {
        AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("GOKZ rating 响应解析失败：{}", error),
        )
    })?;

    if payload.steamid64.trim() != steam_id64.trim() {
        return Err(AppError::http(
            StatusCode::BAD_GATEWAY,
            "GOKZ rating 响应中的 SteamID64 不匹配",
        ));
    }

    Ok((Some(payload.name), payload.rating))
}

pub(crate) async fn fetch_steam_level(
    http_client: &Client,
    api_key: &str,
    base_url: &str,
    fallback_base_url: Option<&str>,
    steam_id64: &str,
) -> AppResult<i32> {
    match request_steam_level(http_client, api_key, base_url, steam_id64).await {
        Ok(level) => Ok(level),
        Err(primary_error) => {
            if let Some(fallback_base_url) = fallback_base_url.filter(|value| !value.trim().is_empty()) {
                request_steam_level(http_client, api_key, fallback_base_url, steam_id64)
                    .await
                    .map_err(|fallback_error| {
                        AppError::http(
                            StatusCode::BAD_GATEWAY,
                            format!(
                                "Steam 等级主接口和备用接口都查询失败。主接口：{}；备用接口：{}",
                                primary_error, fallback_error
                            ),
                        )
                    })
            } else {
                Err(primary_error)
            }
        }
    }
}

fn try_resolve_steam_identifiers(input: &str) -> AppResult<Option<ResolvedSteamIdentifiers>> {
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
                return Ok(Some(from_account_id(steam_id64 - STEAM_ID64_BASE)));
            }
        }
    }

    if input.len() == 17 && input.chars().all(|char| char.is_ascii_digit()) {
        if let Ok(steam_id64) = input.parse::<u64>() {
            if steam_id64 >= STEAM_ID64_BASE {
                return Ok(Some(from_account_id(steam_id64 - STEAM_ID64_BASE)));
            }
        }
    }

    if let Some(captures) = steam_id_regex().captures(input) {
        let y = captures[1].parse::<u64>().unwrap_or(0);
        let z = captures[2].parse::<u64>().unwrap_or(0);
        return Ok(Some(from_account_id(z * 2 + y)));
    }

    if let Some(captures) = steam_id3_regex().captures(input) {
        let account_id = captures[1].parse::<u64>().unwrap_or(0);
        return Ok(Some(from_account_id(account_id)));
    }

    Ok(None)
}

fn parse_steam_lookup_target(input: &str) -> AppResult<SteamLookupTarget> {
    let input = input.trim();
    if input.is_empty() {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "请输入玩家 Steam 标识",
        ));
    }

    if let Some(captures) = steam_vanity_regex().captures(input) {
        return Ok(SteamLookupTarget::Vanity(captures[1].to_string()));
    }

    let identifiers = resolve_steam_identifiers_strict(input)?;
    Ok(SteamLookupTarget::Id64(identifiers.steam_id64))
}

async fn request_steam_level(
    http_client: &Client,
    api_key: &str,
    base_url: &str,
    steam_id64: &str,
) -> AppResult<i32> {
    let separator = if base_url.contains('?') { '&' } else { '?' };
    let request_url = format!(
        "{}{}key={}&steamid={}",
        base_url.trim_end_matches('&'),
        separator,
        api_key.trim(),
        steam_id64.trim()
    );

    let response = http_client.get(&request_url).send().await.map_err(|error| {
        AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("Steam 等级查询失败：{}", error),
        )
    })?;

    if !response.status().is_success() {
        return Err(AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("Steam 等级查询失败，HTTP 状态码：{}", response.status()),
        ));
    }

    let payload = serde_json::from_str::<SteamLevelEnvelope>(
        &response.text().await.map_err(|error| {
            AppError::http(
                StatusCode::BAD_GATEWAY,
                format!("Steam 等级响应读取失败：{}", error),
            )
        })?,
    )
    .map_err(|error| {
        AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("Steam 等级响应解析失败：{}", error),
        )
    })?;

    Ok(payload.response.player_level.max(0))
}

fn extract_xml_tag(body: &str, tag: &str) -> Option<String> {
    let start_token = format!("<{tag}>");
    let end_token = format!("</{tag}>");
    let start = body.find(&start_token)? + start_token.len();
    let end = body[start..].find(&end_token)? + start;
    let value = body[start..end].trim();

    Some(strip_cdata(value))
}

fn strip_cdata(value: &str) -> String {
    value
        .strip_prefix("<![CDATA[")
        .and_then(|trimmed| trimmed.strip_suffix("]]>") )
        .unwrap_or(value)
        .trim()
        .to_string()
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
