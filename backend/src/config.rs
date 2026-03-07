use std::env;

#[derive(Clone)]
pub(crate) struct Config {
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) mysql: MySqlConfig,
    pub(crate) redis: RedisConfig,
    pub(crate) default_admin: DefaultAdminConfig,
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
        url: env::var("REDIS_URL").unwrap_or_else(|_| {
            "redis://:redis_CWBbcK@192.168.0.62:6379/".to_string()
        }),
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

    Config {
        host,
        port,
        mysql,
        redis,
        default_admin,
    }
}
