use std::env;

#[derive(Clone)]
pub(crate) struct Config {
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) mysql: MySqlConfig,
    pub(crate) redis: RedisConfig,
    pub(crate) default_admin: DefaultAdminConfig,
    pub(crate) access_control: AccessControlConfig,
}

#[derive(Clone)]
pub(crate) struct MySqlConfig {
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) user: String,
    pub(crate) password: String,
    pub(crate) database: String,
}

#[derive(Clone)]
pub(crate) struct RedisConfig {
    pub(crate) url: String,
    pub(crate) player_presence_ttl_seconds: u64,
}

#[derive(Clone)]
pub(crate) struct DefaultAdminConfig {
    pub(crate) username: String,
    pub(crate) password: String,
    pub(crate) display_name: String,
    pub(crate) email: Option<String>,
    pub(crate) note: Option<String>,
}

#[derive(Clone)]
pub(crate) struct AccessControlConfig {
    pub(crate) gokz_api_base_url: String,
    pub(crate) steam_web_api_key: Option<String>,
    pub(crate) steam_level_api_base_url: String,
    pub(crate) steam_level_api_fallback_base_url: Option<String>,
    pub(crate) player_profile_stale_seconds: u64,
}

pub(crate) fn load_config() -> Config {
    let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3000);

    let mysql = MySqlConfig {
        host: env::var("MYSQL_HOST").unwrap_or_else(|_| "192.168.0.62".to_string()),
        port: env::var("MYSQL_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(3306),
        user: env::var("MYSQL_USER").unwrap_or_else(|_| "text".to_string()),
        password: env::var("MYSQL_PASSWORD").unwrap_or_else(|_| "text".to_string()),
        database: env::var("MYSQL_DATABASE").unwrap_or_else(|_| "text".to_string()),
    };

    let redis = RedisConfig {
        url: env::var("REDIS_URL")
            .unwrap_or_else(|_| "redis://:redis_CWBbcK@192.168.0.62:6379/".to_string()),
        player_presence_ttl_seconds: env::var("REDIS_PLAYER_PRESENCE_TTL_SECONDS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(90),
    };

    let default_admin = DefaultAdminConfig {
        username: env::var("DEFAULT_ADMIN_USERNAME").unwrap_or_else(|_| "root_admin".to_string()),
        password: env::var("DEFAULT_ADMIN_PASSWORD").unwrap_or_else(|_| "Admin@123".to_string()),
        display_name: env::var("DEFAULT_ADMIN_DISPLAY_NAME")
            .unwrap_or_else(|_| "主系统管理员".to_string()),
        email: env::var("DEFAULT_ADMIN_EMAIL")
            .ok()
            .filter(|value| !value.trim().is_empty()),
        note: env::var("DEFAULT_ADMIN_NOTE")
            .ok()
            .filter(|value| !value.trim().is_empty()),
    };

    let access_control = AccessControlConfig {
        gokz_api_base_url: env::var("GOKZ_API_BASE_URL")
            .unwrap_or_else(|_| "https://api.gokz.top/api/v1".to_string()),
        steam_web_api_key: env::var("STEAM_WEB_API_KEY")
            .ok()
            .filter(|value| !value.trim().is_empty()),
        steam_level_api_base_url: env::var("STEAM_LEVEL_API_BASE_URL")
            .unwrap_or_else(|_| "https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/".to_string()),
        steam_level_api_fallback_base_url: env::var("STEAM_LEVEL_API_FALLBACK_BASE_URL")
            .ok()
            .filter(|value| !value.trim().is_empty()),
        player_profile_stale_seconds: env::var("PLAYER_PROFILE_STALE_SECONDS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(21600),
    };

    Config {
        host,
        port,
        mysql,
        redis,
        default_admin,
        access_control,
    }
}
