use crate::{
    domain::models::{ResolvedSteamIdentifiers, ResolvedSteamProfile},
    error::{AppError, AppResult},
};
use axum::http::StatusCode;
use regex::Regex;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::{sync::OnceLock, time::Duration};

const STEAM_ID64_BASE: u64 = 76561197960265728;
const STEAM_LOOKUP_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 KZGuard/1.0";
const STEAMID_VENNER_RAW_URL: &str = "https://steamid.venner.io/raw.php";
const STEAM_PLAYER_SUMMARIES_URL: &str =
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";

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


#[derive(Debug, Deserialize)]
struct PlayerSummariesEnvelope {
    response: PlayerSummariesBody,
}

#[derive(Debug, Deserialize)]
struct PlayerSummariesBody {
    #[serde(default)]
    players: Vec<PlayerSummary>,
}

#[derive(Debug, Deserialize)]
struct PlayerSummary {
    #[serde(default)]
    steamid: String,
    #[serde(default)]
    personaname: String,
    #[serde(default)]
    profileurl: String,
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

fn steam_id64_finder_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r#"steamid64[^0-9]*(\d{17})"#).expect("invalid steamid64 finder regex"))
}

fn steam_lookup_http_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .user_agent(STEAM_LOOKUP_USER_AGENT)
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(15))
            .build()
            .expect("failed to build steam lookup client")
    })
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

    match request_steam_profile_from_community(&lookup_target).await {
        Ok(profile) => Ok(profile),
        Err(AppError::Http { status, message }) if status == StatusCode::BAD_GATEWAY => {
            let fallback_identifiers = match &lookup_target {
                SteamLookupTarget::Id64(steam_id64) => resolve_steam_identifiers_strict(steam_id64),
                SteamLookupTarget::Vanity(_) => resolve_steam_identifiers_via_venner(input).await,
            };

            match fallback_identifiers {
                Ok(identifiers) => Ok(create_degraded_profile(identifiers)),
                Err(fallback_error) => Err(AppError::http(
                    StatusCode::BAD_GATEWAY,
                    format!(
                        "Steam 玩家信息查询失败。主接口：{}；备用解析：{}",
                        message, fallback_error
                    ),
                )),
            }
        }
        Err(error) => Err(error),
    }
}

pub(crate) async fn resolve_steam_profile_with_web_api(
    http_client: &Client,
    steam_web_api_key: Option<&str>,
    input: &str,
) -> AppResult<ResolvedSteamProfile> {
    let lookup_target = parse_steam_lookup_target(input)?;

    if let Some(api_key) = steam_web_api_key.filter(|value| !value.trim().is_empty()) {
        if let SteamLookupTarget::Id64(steam_id64) = &lookup_target {
            if let Ok(profile) = request_steam_profile_from_web_api(http_client, api_key, steam_id64).await {
                return Ok(profile);
            }
        }
    }

    resolve_steam_profile(input).await
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

async fn request_steam_profile_from_community(
    lookup_target: &SteamLookupTarget,
) -> AppResult<ResolvedSteamProfile> {
    let request_url = match lookup_target {
        SteamLookupTarget::Id64(steam_id64) => {
            format!("https://steamcommunity.com/profiles/{steam_id64}?xml=1")
        }
        SteamLookupTarget::Vanity(vanity) => {
            format!("https://steamcommunity.com/id/{vanity}?xml=1")
        }
    };

    let response = steam_lookup_http_client()
        .get(&request_url)
        .header("Accept", "application/xml,text/xml;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|error| {
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
            format!("Steam 社区查询失败，HTTP 状态码：{}", status),
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
        .ok_or_else(|| AppError::http(StatusCode::BAD_GATEWAY, "Steam 社区未返回有效的 SteamID64"))?;
    let nickname = extract_xml_tag(&body, "steamID")
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let identifiers = resolve_steam_identifiers_strict(&steam_id64)?;

    Ok(ResolvedSteamProfile {
        nickname,
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        profile_url: format!("https://steamcommunity.com/profiles/{steam_id64}"),
    })
}

async fn request_steam_profile_from_web_api(
    http_client: &Client,
    api_key: &str,
    steam_id64: &str,
) -> AppResult<ResolvedSteamProfile> {
    let identifiers = resolve_steam_identifiers_strict(steam_id64)?;
    let response = http_client
        .get(STEAM_PLAYER_SUMMARIES_URL)
        .query(&[("key", api_key.trim()), ("steamids", identifiers.steam_id64.as_str())])
        .send()
        .await
        .map_err(|error| {
            AppError::http(
                StatusCode::BAD_GATEWAY,
                format!("Steam 玩家资料查询失败：{}", error),
            )
        })?;

    if !response.status().is_success() {
        return Err(AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("Steam 玩家资料查询失败，HTTP 状态码：{}", response.status()),
        ));
    }

    let payload = serde_json::from_str::<PlayerSummariesEnvelope>(
        &response.text().await.map_err(|error| {
            AppError::http(
                StatusCode::BAD_GATEWAY,
                format!("Steam 玩家资料响应读取失败：{}", error),
            )
        })?,
    )
    .map_err(|error| {
        AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("Steam 玩家资料响应解析失败：{}", error),
        )
    })?;

    let player = payload
        .response
        .players
        .into_iter()
        .find(|player| player.steamid.trim() == identifiers.steam_id64)
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未查询到该玩家的公开资料"))?;

    let nickname = player.personaname.trim().to_string();
    if nickname.is_empty() {
        return Err(AppError::http(
            StatusCode::NOT_FOUND,
            "未查询到该玩家的游戏名称",
        ));
    }

    let profile_url = if player.profileurl.trim().is_empty() {
        format!("https://steamcommunity.com/profiles/{}", identifiers.steam_id64)
    } else {
        player.profileurl.trim().to_string()
    };

    Ok(ResolvedSteamProfile {
        nickname,
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        profile_url,
    })
}

async fn resolve_steam_identifiers_via_venner(input: &str) -> AppResult<ResolvedSteamIdentifiers> {
    let response = steam_lookup_http_client()
        .get(STEAMID_VENNER_RAW_URL)
        .query(&[("input", input.trim())])
        .send()
        .await
        .map_err(|error| {
            AppError::http(
                StatusCode::BAD_GATEWAY,
                format!("SteamID 备用转换服务访问失败：{}", error),
            )
        })?;

    if !response.status().is_success() {
        return Err(AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("SteamID 备用转换服务返回异常状态：{}", response.status()),
        ));
    }

    let body = response.text().await.map_err(|error| {
        AppError::http(
            StatusCode::BAD_GATEWAY,
            format!("SteamID 备用转换服务响应读取失败：{}", error),
        )
    })?;

    let steam_id64 = extract_steam_id64_from_venner_body(&body)
        .ok_or_else(|| AppError::http(StatusCode::BAD_GATEWAY, "SteamID 备用转换服务未返回有效的 SteamID64"))?;

    resolve_steam_identifiers_strict(&steam_id64)
}

fn extract_steam_id64_from_venner_body(body: &str) -> Option<String> {
    if let Ok(payload) = serde_json::from_str::<Value>(body) {
        if let Some(steam_id64) = find_steam_id64_in_json(&payload) {
            return Some(steam_id64);
        }
    }

    if body.trim().len() == 17 && body.trim().chars().all(|char| char.is_ascii_digit()) {
        return Some(body.trim().to_string());
    }

    steam_id64_finder_regex()
        .captures(body)
        .and_then(|captures| captures.get(1).map(|value| value.as_str().to_string()))
}

fn find_steam_id64_in_json(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            if let Some(steam_id64) = map.get("steamid64").and_then(value_to_steam_id64) {
                return Some(steam_id64);
            }

            map.values().find_map(find_steam_id64_in_json)
        }
        Value::Array(items) => items.iter().find_map(find_steam_id64_in_json),
        _ => None,
    }
}

fn value_to_steam_id64(value: &Value) -> Option<String> {
    match value {
        Value::String(raw) if raw.len() == 17 && raw.chars().all(|char| char.is_ascii_digit()) => {
            Some(raw.clone())
        }
        Value::Number(raw) => {
            let rendered = raw.to_string();
            if rendered.len() == 17 && rendered.chars().all(|char| char.is_ascii_digit()) {
                Some(rendered)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn create_degraded_profile(identifiers: ResolvedSteamIdentifiers) -> ResolvedSteamProfile {
    let profile_url = format!(
        "https://steamcommunity.com/profiles/{}",
        identifiers.steam_id64
    );

    ResolvedSteamProfile {
        nickname: String::new(),
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        profile_url,
    }
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
