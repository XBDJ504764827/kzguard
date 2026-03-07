use std::env;

#[derive(Clone)]
pub(crate) struct Config {
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) mysql: MySqlConfig,
}

#[derive(Clone)]
pub(crate) struct MySqlConfig {
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) user: String,
    pub(crate) password: String,
    pub(crate) database: String,
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

    Config { host, port, mysql }
}
