use anyhow::Context;
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use dotenvy::dotenv;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{
    Connection, Executor, FromRow, MySqlConnection, MySqlPool,
    mysql::{MySqlConnectOptions, MySqlPoolOptions},
};
use std::{collections::HashMap, env, sync::Arc, sync::OnceLock, time::Duration};
use thiserror::Error;
use tokio::{net::TcpListener, time::sleep};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    pool: MySqlPool,
}

type SharedState = Arc<AppState>;
type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
enum AppError {
    #[error("{message}")]
    Http {
        status: StatusCode,
        message: String,
    },
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

impl AppError {
    fn http(status: StatusCode, message: impl Into<String>) -> Self {
        Self::Http {
            status,
            message: message.into(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            Self::Http { status, message } => {
                (status, Json(json!({ "message": message }))).into_response()
            }
            Self::Sqlx(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "message": error.to_string() })),
            )
                .into_response(),
            Self::Anyhow(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "message": error.to_string() })),
            )
                .into_response(),
        }
    }
}

#[derive(Clone)]
struct Config {
    host: String,
    port: u16,
    mysql: MySqlConfig,
}

#[derive(Clone)]
struct MySqlConfig {
    host: String,
    port: u16,
    user: String,
    password: String,
    database: String,
}

#[derive(Serialize)]
struct ApiEnvelope<T> {
    data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl<T> ApiEnvelope<T> {
    fn new(data: T) -> Self {
        Self { data, message: None }
    }

    fn with_message(data: T, message: impl Into<String>) -> Self {
        Self {
            data,
            message: Some(message.into()),
        }
    }
}

#[derive(Serialize)]
struct MessageResponse {
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerPlayer {
    id: String,
    nickname: String,
    steam_id: String,
    ip_address: String,
    connected_at: String,
    ping: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Server {
    id: String,
    name: String,
    ip: String,
    port: i32,
    rcon_password: String,
    rcon_verified_at: String,
    whitelist_enabled: bool,
    entry_verification_enabled: bool,
    online_players: Vec<ServerPlayer>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Community {
    id: String,
    name: String,
    created_at: String,
    servers: Vec<Server>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WhitelistPlayer {
    id: String,
    nickname: String,
    steam_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    contact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    status: String,
    source: String,
    applied_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BanRecord {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    nickname: Option<String>,
    ban_type: String,
    status: String,
    steam_identifier: String,
    steam_id64: String,
    steam_id: String,
    steam_id3: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ip_address: Option<String>,
    reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_seconds: Option<i32>,
    banned_at: String,
    server_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    community_name: Option<String>,
    operator_id: String,
    operator_name: String,
    operator_role: String,
    source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    revoked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    revoked_by_operator_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    revoked_by_operator_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    revoked_by_operator_role: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebsiteAdmin {
    id: String,
    username: String,
    display_name: String,
    role: String,
    password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationLog {
    id: String,
    created_at: String,
    operator_id: String,
    operator_name: String,
    operator_role: String,
    action: String,
    detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserSummary {
    enabled: bool,
    message: String,
    planned_modules: Vec<String>,
}

#[derive(Debug, Clone)]
struct OperatorSnapshot {
    id: String,
    name: String,
    role: String,
}

#[derive(Debug, Clone)]
struct ResolvedSteamIdentifiers {
    steam_id64: String,
    steam_id: String,
    steam_id3: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCommunityBody {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerDraft {
    name: String,
    ip: String,
    port: i32,
    rcon_password: String,
    whitelist_enabled: bool,
    entry_verification_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerSettingsDraft {
    ip: String,
    port: i32,
    rcon_password: String,
    whitelist_enabled: bool,
    entry_verification_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KickBody {
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BanServerPlayerDraft {
    ban_type: String,
    reason: String,
    duration_seconds: Option<i32>,
    ip_address: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManualBanDraft {
    nickname: Option<String>,
    ban_type: String,
    steam_identifier: String,
    ip_address: Option<String>,
    duration_seconds: Option<i32>,
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BanRecordUpdateDraft {
    nickname: Option<String>,
    ban_type: String,
    steam_identifier: String,
    ip_address: Option<String>,
    duration_seconds: Option<i32>,
    reason: String,
    server_name: Option<String>,
    community_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationDraft {
    nickname: String,
    steam_id: String,
    contact: Option<String>,
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManualWhitelistDraft {
    nickname: String,
    steam_id: String,
    contact: Option<String>,
    note: Option<String>,
    status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewWhitelistBody {
    status: Option<String>,
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebsiteAdminUpdateDraft {
    username: String,
    display_name: String,
    password: String,
    email: Option<String>,
    note: Option<String>,
    role: String,
}

#[derive(Debug, Deserialize)]
struct WhitelistQuery {
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CommunityPath {
    community_id: String,
}

#[derive(Debug, Deserialize)]
struct ServerPath {
    community_id: String,
    server_id: String,
}

#[derive(Debug, Deserialize)]
struct PlayerPath {
    community_id: String,
    server_id: String,
    player_id: String,
}

#[derive(Debug, Deserialize)]
struct BanPath {
    ban_id: String,
}

#[derive(Debug, Deserialize)]
struct AdminPath {
    admin_id: String,
}

#[derive(Debug, Deserialize)]
struct WhitelistPlayerPath {
    player_id: String,
}

#[derive(Debug, FromRow)]
struct DbCommunity {
    id: String,
    name: String,
    created_at: NaiveDateTime,
}

#[derive(Debug, FromRow)]
struct DbServer {
    id: String,
    community_id: String,
    name: String,
    ip: String,
    port: i32,
    rcon_password: String,
    rcon_verified_at: NaiveDateTime,
    whitelist_enabled: i8,
    entry_verification_enabled: i8,
}

#[derive(Debug, FromRow)]
struct DbServerPlayer {
    id: String,
    server_id: String,
    nickname: String,
    steam_id: String,
    ip_address: String,
    connected_at: NaiveDateTime,
    ping: i32,
}

#[derive(Debug, FromRow)]
struct DbWhitelistPlayer {
    id: String,
    nickname: String,
    steam_id: String,
    contact: Option<String>,
    note: Option<String>,
    status: String,
    source: String,
    applied_at: NaiveDateTime,
    reviewed_at: Option<NaiveDateTime>,
}

#[derive(Debug, FromRow)]
struct DbBanRecord {
    id: String,
    nickname: Option<String>,
    ban_type: String,
    status: String,
    steam_identifier: String,
    steam_id64: String,
    steam_id: String,
    steam_id3: String,
    ip_address: Option<String>,
    reason: String,
    duration_seconds: Option<i32>,
    banned_at: NaiveDateTime,
    server_name: String,
    community_name: Option<String>,
    operator_id: String,
    operator_name: String,
    operator_role: String,
    source: String,
    updated_at: Option<NaiveDateTime>,
    revoked_at: Option<NaiveDateTime>,
    revoked_by_operator_id: Option<String>,
    revoked_by_operator_name: Option<String>,
    revoked_by_operator_role: Option<String>,
}

#[derive(Debug, FromRow)]
struct DbWebsiteAdmin {
    id: String,
    username: String,
    display_name: String,
    role: String,
    password: String,
    email: Option<String>,
    note: Option<String>,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

#[derive(Debug, FromRow)]
struct DbOperationLog {
    id: String,
    created_at: NaiveDateTime,
    operator_id: String,
    operator_name: String,
    operator_role: String,
    action: String,
    detail: String,
}

#[derive(Debug, FromRow)]
struct DbCommunityName {
    name: String,
}

#[derive(Debug, FromRow)]
struct DbServerWithCommunity {
    id: String,
    name: String,
}

#[derive(Debug, FromRow)]
struct DbKickTarget {
    nickname: String,
    server_name: String,
}

#[derive(Debug, FromRow)]
struct DbBanTarget {
    nickname: String,
    steam_id: String,
    ip_address: String,
    server_name: String,
    community_name: String,
}

#[derive(Debug)]
struct SeedData {
    communities: Vec<Community>,
    whitelist: Vec<WhitelistPlayer>,
    bans: Vec<BanRecord>,
    admins: Vec<WebsiteAdmin>,
    operation_logs: Vec<OperationLog>,
}

const STEAM_PENDING_TEXT: &str = "待后端识别";
const STEAM_ID64_BASE: u64 = 76561197960265728;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    let config = load_config();
    let pool = init_database(&config)
        .await
        .context("failed to initialize mysql database")?;

    println!(
        "mysql connected to {}:{}/{}",
        config.mysql.host, config.mysql.port, config.mysql.database
    );

    let state = Arc::new(AppState { pool });
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ]);

    let app = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/communities", get(list_communities_handler).post(create_community_handler))
        .route(
            "/api/communities/{community_id}/servers",
            post(create_server_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/{server_id}",
            patch(update_server_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/{server_id}/players/{player_id}/kick",
            post(kick_player_handler),
        )
        .route(
            "/api/communities/{community_id}/servers/{server_id}/players/{player_id}/ban",
            post(ban_player_handler),
        )
        .route("/api/whitelist", get(list_whitelist_handler))
        .route(
            "/api/whitelist/applications",
            post(create_whitelist_application_handler),
        )
        .route("/api/whitelist/manual", post(create_whitelist_manual_handler))
        .route(
            "/api/whitelist/{player_id}/status",
            patch(update_whitelist_status_handler),
        )
        .route("/api/bans", get(list_bans_handler))
        .route("/api/bans/manual", post(create_manual_ban_handler))
        .route(
            "/api/bans/{ban_id}",
            patch(update_ban_handler).delete(delete_ban_handler),
        )
        .route("/api/bans/{ban_id}/revoke", post(revoke_ban_handler))
        .route("/api/admins", get(list_admins_handler))
        .route("/api/admins/{admin_id}", patch(update_admin_handler))
        .route("/api/operation-logs", get(list_operation_logs_handler))
        .route("/api/users/summary", get(user_summary_handler))
        .with_state(state)
        .layer(cors);

    let listener = TcpListener::bind(format!("{}:{}", config.host, config.port))
        .await
        .context("failed to bind server address")?;
    println!(
        "kzguard backend listening on http://{}:{}",
        config.host, config.port
    );

    axum::serve(listener, app)
        .await
        .context("axum server crashed")?;

    Ok(())
}

fn load_config() -> Config {
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

async fn init_database(config: &Config) -> AppResult<MySqlPool> {
    create_database_if_needed(&config.mysql).await?;
    let options = MySqlConnectOptions::new()
        .host(&config.mysql.host)
        .port(config.mysql.port)
        .username(&config.mysql.user)
        .password(&config.mysql.password)
        .database(&config.mysql.database);

    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .connect_with(options)
        .await?;

    create_tables(&pool).await?;
    seed_if_empty(&pool).await?;

    Ok(pool)
}

async fn create_database_if_needed(config: &MySqlConfig) -> AppResult<()> {
    let options = MySqlConnectOptions::new()
        .host(&config.host)
        .port(config.port)
        .username(&config.user)
        .password(&config.password);

    let mut connection = MySqlConnection::connect_with(&options).await?;
    let database = config.database.replace('`', "``");
    let sql = format!(
        "CREATE DATABASE IF NOT EXISTS `{}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        database
    );
    sqlx::query(&sql).execute(&mut connection).await?;
    Ok(())
}

async fn create_tables(pool: &MySqlPool) -> AppResult<()> {
    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS communities (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at DATETIME(3) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS servers (
          id VARCHAR(64) PRIMARY KEY,
          community_id VARCHAR(64) NOT NULL,
          name VARCHAR(255) NOT NULL,
          ip VARCHAR(45) NOT NULL,
          port INT NOT NULL,
          rcon_password VARCHAR(255) NOT NULL,
          rcon_verified_at DATETIME(3) NOT NULL,
          whitelist_enabled TINYINT(1) NOT NULL DEFAULT 0,
          entry_verification_enabled TINYINT(1) NOT NULL DEFAULT 0,
          CONSTRAINT fk_servers_community FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
          INDEX idx_servers_community_id (community_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS server_players (
          id VARCHAR(64) PRIMARY KEY,
          server_id VARCHAR(64) NOT NULL,
          nickname VARCHAR(255) NOT NULL,
          steam_id VARCHAR(255) NOT NULL,
          ip_address VARCHAR(45) NOT NULL,
          connected_at DATETIME(3) NOT NULL,
          ping INT NOT NULL,
          CONSTRAINT fk_server_players_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
          INDEX idx_server_players_server_id (server_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS whitelist_players (
          id VARCHAR(64) PRIMARY KEY,
          nickname VARCHAR(255) NOT NULL,
          steam_id VARCHAR(255) NOT NULL,
          contact VARCHAR(255) NULL,
          note TEXT NULL,
          status VARCHAR(32) NOT NULL,
          source VARCHAR(32) NOT NULL,
          applied_at DATETIME(3) NOT NULL,
          reviewed_at DATETIME(3) NULL,
          INDEX idx_whitelist_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS ban_records (
          id VARCHAR(64) PRIMARY KEY,
          nickname VARCHAR(255) NULL,
          ban_type VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL,
          steam_identifier VARCHAR(255) NOT NULL,
          steam_id64 VARCHAR(32) NOT NULL,
          steam_id VARCHAR(255) NOT NULL,
          steam_id3 VARCHAR(255) NOT NULL,
          ip_address VARCHAR(45) NULL,
          reason TEXT NOT NULL,
          duration_seconds INT NULL,
          banned_at DATETIME(3) NOT NULL,
          server_name VARCHAR(255) NOT NULL,
          community_name VARCHAR(255) NULL,
          operator_id VARCHAR(64) NOT NULL,
          operator_name VARCHAR(255) NOT NULL,
          operator_role VARCHAR(32) NOT NULL,
          source VARCHAR(32) NOT NULL,
          updated_at DATETIME(3) NULL,
          revoked_at DATETIME(3) NULL,
          revoked_by_operator_id VARCHAR(64) NULL,
          revoked_by_operator_name VARCHAR(255) NULL,
          revoked_by_operator_role VARCHAR(32) NULL,
          INDEX idx_ban_status (status),
          INDEX idx_ban_type (ban_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS website_admins (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(255) NOT NULL UNIQUE,
          display_name VARCHAR(255) NOT NULL,
          role VARCHAR(32) NOT NULL,
          password VARCHAR(255) NOT NULL,
          email VARCHAR(255) NULL,
          note TEXT NULL,
          created_at DATETIME(3) NOT NULL,
          updated_at DATETIME(3) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    pool.execute(
        r#"
        CREATE TABLE IF NOT EXISTS operation_logs (
          id VARCHAR(64) PRIMARY KEY,
          created_at DATETIME(3) NOT NULL,
          operator_id VARCHAR(64) NOT NULL,
          operator_name VARCHAR(255) NOT NULL,
          operator_role VARCHAR(32) NOT NULL,
          action VARCHAR(64) NOT NULL,
          detail TEXT NOT NULL,
          INDEX idx_operation_logs_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .await?;

    Ok(())
}

async fn seed_if_empty(pool: &MySqlPool) -> AppResult<()> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM communities")
        .fetch_one(pool)
        .await?;

    if count > 0 {
        return Ok(());
    }

    let seed = seed_data();
    let mut tx = pool.begin().await?;

    for community in &seed.communities {
        sqlx::query("INSERT INTO communities (id, name, created_at) VALUES (?, ?, ?)")
            .bind(&community.id)
            .bind(&community.name)
            .bind(iso_to_mysql(&community.created_at))
            .execute(&mut *tx)
            .await?;

        for server in &community.servers {
            sqlx::query(
                r#"
                INSERT INTO servers (
                  id, community_id, name, ip, port, rcon_password, rcon_verified_at, whitelist_enabled, entry_verification_enabled
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&server.id)
            .bind(&community.id)
            .bind(&server.name)
            .bind(&server.ip)
            .bind(server.port)
            .bind(&server.rcon_password)
            .bind(iso_to_mysql(&server.rcon_verified_at))
            .bind(bool_to_i32(server.whitelist_enabled))
            .bind(bool_to_i32(server.entry_verification_enabled))
            .execute(&mut *tx)
            .await?;

            for player in &server.online_players {
                sqlx::query(
                    r#"
                    INSERT INTO server_players (
                      id, server_id, nickname, steam_id, ip_address, connected_at, ping
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    "#,
                )
                .bind(&player.id)
                .bind(&server.id)
                .bind(&player.nickname)
                .bind(&player.steam_id)
                .bind(&player.ip_address)
                .bind(iso_to_mysql(&player.connected_at))
                .bind(player.ping)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    for player in &seed.whitelist {
        sqlx::query(
            r#"
            INSERT INTO whitelist_players (
              id, nickname, steam_id, contact, note, status, source, applied_at, reviewed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&player.id)
        .bind(&player.nickname)
        .bind(&player.steam_id)
        .bind(&player.contact)
        .bind(&player.note)
        .bind(&player.status)
        .bind(&player.source)
        .bind(iso_to_mysql(&player.applied_at))
        .bind(player.reviewed_at.as_ref().map(|value| iso_to_mysql(value)))
        .execute(&mut *tx)
        .await?;
    }

    for ban in &seed.bans {
        insert_ban_record(&mut *tx, ban).await?;
    }

    for admin in &seed.admins {
        sqlx::query(
            r#"
            INSERT INTO website_admins (
              id, username, display_name, role, password, email, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&admin.id)
        .bind(&admin.username)
        .bind(&admin.display_name)
        .bind(&admin.role)
        .bind(&admin.password)
        .bind(&admin.email)
        .bind(&admin.note)
        .bind(iso_to_mysql(&admin.created_at))
        .bind(iso_to_mysql(&admin.updated_at))
        .execute(&mut *tx)
        .await?;
    }

    for log in &seed.operation_logs {
        sqlx::query(
            r#"
            INSERT INTO operation_logs (
              id, created_at, operator_id, operator_name, operator_role, action, detail
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&log.id)
        .bind(iso_to_mysql(&log.created_at))
        .bind(&log.operator_id)
        .bind(&log.operator_name)
        .bind(&log.operator_role)
        .bind(&log.action)
        .bind(&log.detail)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

async fn insert_ban_record<'e, E>(executor: E, ban: &BanRecord) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = sqlx::MySql>,
{
    sqlx::query(
        r#"
        INSERT INTO ban_records (
          id, nickname, ban_type, status, steam_identifier, steam_id64, steam_id, steam_id3, ip_address,
          reason, duration_seconds, banned_at, server_name, community_name, operator_id, operator_name,
          operator_role, source, updated_at, revoked_at, revoked_by_operator_id, revoked_by_operator_name, revoked_by_operator_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&ban.id)
    .bind(&ban.nickname)
    .bind(&ban.ban_type)
    .bind(&ban.status)
    .bind(&ban.steam_identifier)
    .bind(&ban.steam_id64)
    .bind(&ban.steam_id)
    .bind(&ban.steam_id3)
    .bind(&ban.ip_address)
    .bind(&ban.reason)
    .bind(ban.duration_seconds)
    .bind(iso_to_mysql(&ban.banned_at))
    .bind(&ban.server_name)
    .bind(&ban.community_name)
    .bind(&ban.operator_id)
    .bind(&ban.operator_name)
    .bind(&ban.operator_role)
    .bind(&ban.source)
    .bind(ban.updated_at.as_ref().map(|value| iso_to_mysql(value)))
    .bind(ban.revoked_at.as_ref().map(|value| iso_to_mysql(value)))
    .bind(&ban.revoked_by_operator_id)
    .bind(&ban.revoked_by_operator_name)
    .bind(&ban.revoked_by_operator_role)
    .execute(executor)
    .await?;

    Ok(())
}

async fn health_handler() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "kzguard-backend",
        "timestamp": now_iso(),
    }))
}

async fn list_communities_handler(State(state): State<SharedState>) -> AppResult<Json<ApiEnvelope<Vec<Community>>>> {
    let communities = list_communities(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(communities)))
}

async fn create_community_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<CreateCommunityBody>,
) -> AppResult<impl IntoResponse> {
    let community = create_community(&state.pool, body.name.unwrap_or_default(), operator_id_from_headers(&headers)).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(community, "社区创建成功")),
    ))
}

async fn create_server_handler(
    State(state): State<SharedState>,
    Path(path): Path<CommunityPath>,
    headers: HeaderMap,
    Json(draft): Json<ServerDraft>,
) -> AppResult<impl IntoResponse> {
    let server = create_server(
        &state.pool,
        &path.community_id,
        draft,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(server, "服务器添加成功")),
    ))
}

async fn update_server_handler(
    State(state): State<SharedState>,
    Path(path): Path<ServerPath>,
    headers: HeaderMap,
    Json(draft): Json<ServerSettingsDraft>,
) -> AppResult<Json<ApiEnvelope<Server>>> {
    let server = update_server_settings(
        &state.pool,
        &path.community_id,
        &path.server_id,
        draft,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(server, "服务器设置已更新")))
}

async fn kick_player_handler(
    State(state): State<SharedState>,
    Path(path): Path<PlayerPath>,
    headers: HeaderMap,
    Json(body): Json<KickBody>,
) -> AppResult<Json<MessageResponse>> {
    kick_server_player(
        &state.pool,
        &path.community_id,
        &path.server_id,
        &path.player_id,
        body.reason.unwrap_or_default(),
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(MessageResponse {
        message: "玩家已踢出".to_string(),
    }))
}

async fn ban_player_handler(
    State(state): State<SharedState>,
    Path(path): Path<PlayerPath>,
    headers: HeaderMap,
    Json(draft): Json<BanServerPlayerDraft>,
) -> AppResult<impl IntoResponse> {
    let ban = ban_server_player(
        &state.pool,
        &path.community_id,
        &path.server_id,
        &path.player_id,
        draft,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(ban, "玩家已封禁")),
    ))
}

async fn list_whitelist_handler(
    State(state): State<SharedState>,
    Query(query): Query<WhitelistQuery>,
) -> AppResult<Json<ApiEnvelope<Vec<WhitelistPlayer>>>> {
    let whitelist = list_whitelist(&state.pool, query.status).await?;
    Ok(Json(ApiEnvelope::new(whitelist)))
}

async fn create_whitelist_application_handler(
    State(state): State<SharedState>,
    Json(draft): Json<ApplicationDraft>,
) -> AppResult<impl IntoResponse> {
    let player = create_application(&state.pool, draft).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(player, "白名单申请已提交")),
    ))
}

async fn create_whitelist_manual_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(draft): Json<ManualWhitelistDraft>,
) -> AppResult<impl IntoResponse> {
    let player = create_manual_whitelist_entry(&state.pool, draft, operator_id_from_headers(&headers)).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(player, "玩家已手动录入")),
    ))
}

async fn update_whitelist_status_handler(
    State(state): State<SharedState>,
    Path(path): Path<WhitelistPlayerPath>,
    headers: HeaderMap,
    Json(body): Json<ReviewWhitelistBody>,
) -> AppResult<Json<MessageResponse>> {
    let status = body.status.unwrap_or_default();
    if status != "approved" && status != "rejected" {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "审核状态仅支持 approved 或 rejected",
        ));
    }

    review_whitelist_player(
        &state.pool,
        &path.player_id,
        &status,
        body.note,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(MessageResponse {
        message: "白名单状态已更新".to_string(),
    }))
}

async fn list_bans_handler(State(state): State<SharedState>) -> AppResult<Json<ApiEnvelope<Vec<BanRecord>>>> {
    let bans = list_bans(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(bans)))
}

async fn create_manual_ban_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(draft): Json<ManualBanDraft>,
) -> AppResult<impl IntoResponse> {
    let ban = create_manual_ban_entry(&state.pool, draft, operator_id_from_headers(&headers)).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiEnvelope::with_message(ban, "封禁记录已创建")),
    ))
}

async fn update_ban_handler(
    State(state): State<SharedState>,
    Path(path): Path<BanPath>,
    headers: HeaderMap,
    Json(draft): Json<BanRecordUpdateDraft>,
) -> AppResult<Json<ApiEnvelope<BanRecord>>> {
    let ban = update_ban_record(&state.pool, &path.ban_id, draft, operator_id_from_headers(&headers)).await?;
    Ok(Json(ApiEnvelope::with_message(ban, "封禁记录已更新")))
}

async fn revoke_ban_handler(
    State(state): State<SharedState>,
    Path(path): Path<BanPath>,
    headers: HeaderMap,
) -> AppResult<Json<ApiEnvelope<BanRecord>>> {
    let ban = revoke_ban_record(&state.pool, &path.ban_id, operator_id_from_headers(&headers)).await?;
    Ok(Json(ApiEnvelope::with_message(ban, "封禁已解除")))
}

async fn delete_ban_handler(
    State(state): State<SharedState>,
    Path(path): Path<BanPath>,
    headers: HeaderMap,
) -> AppResult<Json<MessageResponse>> {
    delete_ban_record(&state.pool, &path.ban_id, operator_id_from_headers(&headers)).await?;
    Ok(Json(MessageResponse {
        message: "封禁记录已删除".to_string(),
    }))
}

async fn list_admins_handler(State(state): State<SharedState>) -> AppResult<Json<ApiEnvelope<Vec<WebsiteAdmin>>>> {
    let admins = list_website_admins(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(admins)))
}

async fn update_admin_handler(
    State(state): State<SharedState>,
    Path(path): Path<AdminPath>,
    headers: HeaderMap,
    Json(draft): Json<WebsiteAdminUpdateDraft>,
) -> AppResult<Json<ApiEnvelope<WebsiteAdmin>>> {
    let admin = update_website_admin(
        &state.pool,
        &path.admin_id,
        draft,
        operator_id_from_headers(&headers),
    )
    .await?;

    Ok(Json(ApiEnvelope::with_message(admin, "管理员信息已更新")))
}

async fn list_operation_logs_handler(
    State(state): State<SharedState>,
) -> AppResult<Json<ApiEnvelope<Vec<OperationLog>>>> {
    let logs = list_operation_logs(&state.pool).await?;
    Ok(Json(ApiEnvelope::new(logs)))
}

async fn user_summary_handler() -> Json<UserSummary> {
    Json(users_summary())
}

async fn list_communities(pool: &MySqlPool) -> AppResult<Vec<Community>> {
    let community_rows = sqlx::query_as::<_, DbCommunity>(
        "SELECT * FROM communities ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    let server_rows = sqlx::query_as::<_, DbServer>(
        "SELECT * FROM servers ORDER BY rcon_verified_at DESC",
    )
    .fetch_all(pool)
    .await?;

    let player_rows = sqlx::query_as::<_, DbServerPlayer>(
        "SELECT * FROM server_players ORDER BY connected_at DESC",
    )
    .fetch_all(pool)
    .await?;

    let mut player_map: HashMap<String, Vec<ServerPlayer>> = HashMap::new();
    for player in player_rows {
        player_map
            .entry(player.server_id.clone())
            .or_default()
            .push(map_server_player(player));
    }

    let mut server_map: HashMap<String, Vec<Server>> = HashMap::new();
    for server in server_rows {
        let online_players = player_map.remove(&server.id).unwrap_or_default();
        server_map
            .entry(server.community_id.clone())
            .or_default()
            .push(Server {
                id: server.id,
                name: server.name,
                ip: server.ip,
                port: server.port,
                rcon_password: server.rcon_password,
                rcon_verified_at: naive_to_iso(server.rcon_verified_at),
                whitelist_enabled: server.whitelist_enabled != 0,
                entry_verification_enabled: server.entry_verification_enabled != 0,
                online_players,
            });
    }

    Ok(community_rows
        .into_iter()
        .map(|community| Community {
            id: community.id.clone(),
            name: community.name,
            created_at: naive_to_iso(community.created_at),
            servers: server_map.remove(&community.id).unwrap_or_default(),
        })
        .collect())
}

async fn create_community(
    pool: &MySqlPool,
    name: String,
    operator_id: Option<String>,
) -> AppResult<Community> {
    require_non_empty(&name, "请输入社区名称")?;

    let community = Community {
        id: prefixed_id("community"),
        name: name.trim().to_string(),
        created_at: now_iso(),
        servers: vec![],
    };

    sqlx::query("INSERT INTO communities (id, name, created_at) VALUES (?, ?, ?)")
        .bind(&community.id)
        .bind(&community.name)
        .bind(iso_to_mysql(&community.created_at))
        .execute(pool)
        .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(pool, "community_created", format!("新增社区 “{}”。", community.name), &operator).await?;

    Ok(community)
}

async fn create_server(
    pool: &MySqlPool,
    community_id: &str,
    draft: ServerDraft,
    operator_id: Option<String>,
) -> AppResult<Server> {
    validate_server_fields(Some(&draft.name), &draft.ip, draft.port, &draft.rcon_password)?;

    let community = sqlx::query_as::<_, DbCommunityName>("SELECT name FROM communities WHERE id = ?")
        .bind(community_id)
        .fetch_optional(pool)
        .await?;

    let community = community.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标社区"))?;

    if !verify_rcon_connection(&draft).await {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "RCON 校验失败，请检查服务器信息",
        ));
    }

    let server = Server {
        id: prefixed_id("server"),
        name: draft.name.trim().to_string(),
        ip: draft.ip.trim().to_string(),
        port: draft.port,
        rcon_password: draft.rcon_password,
        rcon_verified_at: now_iso(),
        whitelist_enabled: draft.whitelist_enabled,
        entry_verification_enabled: draft.entry_verification_enabled,
        online_players: vec![],
    };

    sqlx::query(
        r#"
        INSERT INTO servers (
          id, community_id, name, ip, port, rcon_password, rcon_verified_at, whitelist_enabled, entry_verification_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&server.id)
    .bind(community_id)
    .bind(&server.name)
    .bind(&server.ip)
    .bind(server.port)
    .bind(&server.rcon_password)
    .bind(iso_to_mysql(&server.rcon_verified_at))
    .bind(bool_to_i32(server.whitelist_enabled))
    .bind(bool_to_i32(server.entry_verification_enabled))
    .execute(pool)
    .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_created",
        format!(
            "向社区 “{}” 添加服务器 {}（{}:{}），并完成 RCON 校验。",
            community.name, server.name, server.ip, server.port
        ),
        &operator,
    )
    .await?;

    Ok(server)
}

async fn update_server_settings(
    pool: &MySqlPool,
    community_id: &str,
    server_id: &str,
    draft: ServerSettingsDraft,
    operator_id: Option<String>,
) -> AppResult<Server> {
    validate_server_fields(None, &draft.ip, draft.port, &draft.rcon_password)?;

    let existing_server = sqlx::query_as::<_, DbServerWithCommunity>(
        r#"
        SELECT s.id, s.name, c.name AS community_name
        FROM servers s
        INNER JOIN communities c ON c.id = s.community_id
        WHERE s.id = ? AND s.community_id = ?
        "#,
    )
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(pool)
    .await?;

    let existing_server = existing_server.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标服务器"))?;
    let verified_at = now_iso();

    sqlx::query(
        r#"
        UPDATE servers
           SET ip = ?, port = ?, rcon_password = ?, rcon_verified_at = ?, whitelist_enabled = ?, entry_verification_enabled = ?
         WHERE id = ? AND community_id = ?
        "#,
    )
    .bind(draft.ip.trim())
    .bind(draft.port)
    .bind(&draft.rcon_password)
    .bind(iso_to_mysql(&verified_at))
    .bind(bool_to_i32(draft.whitelist_enabled))
    .bind(bool_to_i32(draft.entry_verification_enabled))
    .bind(server_id)
    .bind(community_id)
    .execute(pool)
    .await?;

    let player_rows = sqlx::query_as::<_, DbServerPlayer>(
        "SELECT * FROM server_players WHERE server_id = ? ORDER BY connected_at DESC",
    )
    .bind(server_id)
    .fetch_all(pool)
    .await?;

    let server = Server {
        id: existing_server.id,
        name: existing_server.name,
        ip: draft.ip.trim().to_string(),
        port: draft.port,
        rcon_password: draft.rcon_password,
        rcon_verified_at: verified_at,
        whitelist_enabled: draft.whitelist_enabled,
        entry_verification_enabled: draft.entry_verification_enabled,
        online_players: player_rows.into_iter().map(map_server_player).collect(),
    };

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_updated",
        format!(
            "更新了服务器 {} 的连接参数为 {}:{}，白名单{}，进服验证{}。",
            server.name,
            server.ip,
            server.port,
            if server.whitelist_enabled { "开启" } else { "关闭" },
            if server.entry_verification_enabled { "开启" } else { "关闭" }
        ),
        &operator,
    )
    .await?;

    Ok(server)
}

async fn kick_server_player(
    pool: &MySqlPool,
    community_id: &str,
    server_id: &str,
    player_id: &str,
    reason: String,
    operator_id: Option<String>,
) -> AppResult<()> {
    require_non_empty(&reason, "请输入踢出理由")?;

    let target = sqlx::query_as::<_, DbKickTarget>(
        r#"
        SELECT sp.nickname, s.name AS server_name
          FROM server_players sp
          INNER JOIN servers s ON s.id = sp.server_id
         WHERE sp.id = ? AND sp.server_id = ? AND s.community_id = ?
        "#,
    )
    .bind(player_id)
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(pool)
    .await?;

    let target = target.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标玩家"))?;

    sqlx::query("DELETE FROM server_players WHERE id = ? AND server_id = ?")
        .bind(player_id)
        .bind(server_id)
        .execute(pool)
        .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "server_player_kicked",
        format!(
            "从服务器 {} 踢出了玩家 {}。原因：{}",
            target.server_name,
            target.nickname,
            reason.trim()
        ),
        &operator,
    )
    .await?;

    Ok(())
}

async fn ban_server_player(
    pool: &MySqlPool,
    community_id: &str,
    server_id: &str,
    player_id: &str,
    draft: BanServerPlayerDraft,
    operator_id: Option<String>,
) -> AppResult<BanRecord> {
    validate_ban_draft(
        Some(&draft.ban_type),
        None,
        draft.ip_address.as_deref(),
        draft.duration_seconds,
        &draft.reason,
    )?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let mut tx = pool.begin().await?;

    let player = sqlx::query_as::<_, DbBanTarget>(
        r#"
        SELECT sp.nickname, sp.steam_id, sp.ip_address, s.name AS server_name, c.name AS community_name
          FROM server_players sp
          INNER JOIN servers s ON s.id = sp.server_id
          INNER JOIN communities c ON c.id = s.community_id
         WHERE sp.id = ? AND sp.server_id = ? AND c.id = ?
        "#,
    )
    .bind(player_id)
    .bind(server_id)
    .bind(community_id)
    .fetch_optional(&mut *tx)
    .await?;

    let player = player.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到要封禁的玩家或服务器"))?;

    let ban = create_ban_record(
        trim_to_none(Some(player.nickname.clone())),
        draft.ban_type,
        player.steam_id,
        draft.ip_address.or_else(|| Some(player.ip_address)),
        draft.reason,
        draft.duration_seconds,
        player.server_name,
        Some(player.community_name),
        &operator,
        "server_action",
    )?;

    insert_ban_record(&mut *tx, &ban).await?;
    sqlx::query("DELETE FROM server_players WHERE id = ? AND server_id = ?")
        .bind(player_id)
        .bind(server_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    append_operation_log(
        pool,
        "server_player_banned",
        format!(
            "在服务器 {} 以{}封禁了玩家 {}，IP：{}，时长为 {}。原因：{}",
            ban.server_name,
            if ban.ban_type == "ip" { "IP封禁" } else { "Steam账号封禁" },
            ban.nickname.clone().unwrap_or_else(|| ban.steam_id.clone()),
            ban.ip_address
                .clone()
                .unwrap_or_else(|| "等待玩家下次进服自动回填".to_string()),
            ban.duration_seconds
                .map(|seconds| format!("{} 秒", seconds))
                .unwrap_or_else(|| "永久封禁".to_string()),
            ban.reason
        ),
        &operator,
    )
    .await?;

    Ok(ban)
}

async fn list_whitelist(pool: &MySqlPool, status: Option<String>) -> AppResult<Vec<WhitelistPlayer>> {
    let rows = if let Some(status) = trim_to_none(status) {
        sqlx::query_as::<_, DbWhitelistPlayer>(
            "SELECT * FROM whitelist_players WHERE status = ? ORDER BY applied_at DESC",
        )
        .bind(status)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, DbWhitelistPlayer>(
            "SELECT * FROM whitelist_players ORDER BY applied_at DESC",
        )
        .fetch_all(pool)
        .await?
    };

    Ok(rows.into_iter().map(map_whitelist_player).collect())
}

async fn create_application(pool: &MySqlPool, draft: ApplicationDraft) -> AppResult<WhitelistPlayer> {
    validate_application_draft(&draft.nickname, &draft.steam_id)?;

    let player = WhitelistPlayer {
        id: prefixed_id("player"),
        nickname: draft.nickname.trim().to_string(),
        steam_id: draft.steam_id.trim().to_string(),
        contact: trim_to_none(draft.contact),
        note: trim_to_none(draft.note),
        status: "pending".to_string(),
        source: "application".to_string(),
        applied_at: now_iso(),
        reviewed_at: None,
    };

    sqlx::query(
        r#"
        INSERT INTO whitelist_players (
          id, nickname, steam_id, contact, note, status, source, applied_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&player.id)
    .bind(&player.nickname)
    .bind(&player.steam_id)
    .bind(&player.contact)
    .bind(&player.note)
    .bind(&player.status)
    .bind(&player.source)
    .bind(iso_to_mysql(&player.applied_at))
    .bind(Option::<String>::None)
    .execute(pool)
    .await?;

    Ok(player)
}

async fn create_manual_whitelist_entry(
    pool: &MySqlPool,
    draft: ManualWhitelistDraft,
    operator_id: Option<String>,
) -> AppResult<WhitelistPlayer> {
    validate_manual_whitelist_draft(&draft.nickname, &draft.steam_id, &draft.status)?;

    let now = now_iso();
    let player = WhitelistPlayer {
        id: prefixed_id("player"),
        nickname: draft.nickname.trim().to_string(),
        steam_id: draft.steam_id.trim().to_string(),
        contact: trim_to_none(draft.contact),
        note: trim_to_none(draft.note),
        status: draft.status,
        source: "manual".to_string(),
        applied_at: now.clone(),
        reviewed_at: Some(now),
    };

    sqlx::query(
        r#"
        INSERT INTO whitelist_players (
          id, nickname, steam_id, contact, note, status, source, applied_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&player.id)
    .bind(&player.nickname)
    .bind(&player.steam_id)
    .bind(&player.contact)
    .bind(&player.note)
    .bind(&player.status)
    .bind(&player.source)
    .bind(iso_to_mysql(&player.applied_at))
    .bind(player.reviewed_at.as_ref().map(|value| iso_to_mysql(value)))
    .execute(pool)
    .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    append_operation_log(
        pool,
        "whitelist_manual_added",
        format!(
            "手动录入玩家 {} 到白名单，结果为 {}。",
            player.nickname,
            if player.status == "approved" { "已通过" } else { "已拒绝" }
        ),
        &operator,
    )
    .await?;

    Ok(player)
}

async fn review_whitelist_player(
    pool: &MySqlPool,
    player_id: &str,
    status: &str,
    note: Option<String>,
    operator_id: Option<String>,
) -> AppResult<()> {
    let existing = sqlx::query_as::<_, DbWhitelistPlayer>(
        "SELECT * FROM whitelist_players WHERE id = ?",
    )
    .bind(player_id)
    .fetch_optional(pool)
    .await?;

    let existing = existing.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标玩家"))?;
    let reviewed_at = now_iso();
    let next_note = trim_to_none(note).or(existing.note.clone());

    sqlx::query("UPDATE whitelist_players SET status = ?, note = ?, reviewed_at = ? WHERE id = ?")
        .bind(status)
        .bind(&next_note)
        .bind(iso_to_mysql(&reviewed_at))
        .bind(player_id)
        .execute(pool)
        .await?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let detail = if let Some(note) = next_note.clone().filter(|_| note_was_provided(&next_note, &existing.note)) {
        format!(
            "{}玩家 {} 的白名单申请。 备注：{}",
            if status == "approved" { "审核通过" } else { "审核拒绝" },
            existing.nickname,
            note
        )
    } else {
        format!(
            "{}玩家 {} 的白名单申请。",
            if status == "approved" { "审核通过" } else { "审核拒绝" },
            existing.nickname,
        )
    };

    append_operation_log(
        pool,
        if status == "approved" {
            "whitelist_approved"
        } else {
            "whitelist_rejected"
        },
        detail,
        &operator,
    )
    .await?;

    Ok(())
}

async fn list_bans(pool: &MySqlPool) -> AppResult<Vec<BanRecord>> {
    let rows = sqlx::query_as::<_, DbBanRecord>("SELECT * FROM ban_records ORDER BY banned_at DESC")
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(map_ban_record).collect())
}

async fn create_manual_ban_entry(
    pool: &MySqlPool,
    draft: ManualBanDraft,
    operator_id: Option<String>,
) -> AppResult<BanRecord> {
    validate_ban_draft(
        Some(&draft.ban_type),
        Some(&draft.steam_identifier),
        draft.ip_address.as_deref(),
        draft.duration_seconds,
        &draft.reason,
    )?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let ban = create_ban_record(
        trim_to_none(draft.nickname),
        draft.ban_type,
        draft.steam_identifier,
        draft.ip_address,
        draft.reason,
        draft.duration_seconds,
        "手动录入（未关联服务器）".to_string(),
        None,
        &operator,
        "manual",
    )?;

    insert_ban_record(pool, &ban).await?;

    append_operation_log(
        pool,
        "ban_record_manual_created",
        format!(
            "手动添加了{}记录：玩家 {}，Steam 标识 {}，IP：{}，时长为 {}。原因：{}",
            if ban.ban_type == "ip" { "IP封禁" } else { "Steam账号封禁" },
            ban.nickname.clone().unwrap_or_else(|| "待后端匹配".to_string()),
            ban.steam_identifier,
            ban.ip_address
                .clone()
                .unwrap_or_else(|| "等待玩家下次进服自动回填".to_string()),
            ban.duration_seconds
                .map(|seconds| format!("{} 秒", seconds))
                .unwrap_or_else(|| "永久封禁".to_string()),
            ban.reason,
        ),
        &operator,
    )
    .await?;

    Ok(ban)
}

async fn update_ban_record(
    pool: &MySqlPool,
    ban_id: &str,
    draft: BanRecordUpdateDraft,
    operator_id: Option<String>,
) -> AppResult<BanRecord> {
    validate_ban_draft(
        Some(&draft.ban_type),
        Some(&draft.steam_identifier),
        draft.ip_address.as_deref(),
        draft.duration_seconds,
        &draft.reason,
    )?;

    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let existing = get_ban_record(pool, ban_id).await?;
    let identifiers = resolve_steam_identifiers(&draft.steam_identifier)?;
    let updated_at = now_iso();

    let updated = BanRecord {
        id: existing.id,
        nickname: trim_to_none(draft.nickname),
        ban_type: draft.ban_type,
        status: existing.status,
        steam_identifier: draft.steam_identifier.trim().to_string(),
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        ip_address: trim_to_none(draft.ip_address),
        reason: draft.reason.trim().to_string(),
        duration_seconds: draft.duration_seconds,
        banned_at: existing.banned_at,
        server_name: trim_to_none(draft.server_name).unwrap_or(existing.server_name),
        community_name: trim_to_none(draft.community_name),
        operator_id: existing.operator_id,
        operator_name: existing.operator_name,
        operator_role: existing.operator_role,
        source: existing.source,
        updated_at: Some(updated_at.clone()),
        revoked_at: existing.revoked_at,
        revoked_by_operator_id: existing.revoked_by_operator_id,
        revoked_by_operator_name: existing.revoked_by_operator_name,
        revoked_by_operator_role: existing.revoked_by_operator_role,
    };

    sqlx::query(
        r#"
        UPDATE ban_records
           SET nickname = ?, ban_type = ?, steam_identifier = ?, steam_id64 = ?, steam_id = ?, steam_id3 = ?,
               ip_address = ?, reason = ?, duration_seconds = ?, server_name = ?, community_name = ?, updated_at = ?
         WHERE id = ?
        "#,
    )
    .bind(&updated.nickname)
    .bind(&updated.ban_type)
    .bind(&updated.steam_identifier)
    .bind(&updated.steam_id64)
    .bind(&updated.steam_id)
    .bind(&updated.steam_id3)
    .bind(&updated.ip_address)
    .bind(&updated.reason)
    .bind(updated.duration_seconds)
    .bind(&updated.server_name)
    .bind(&updated.community_name)
    .bind(iso_to_mysql(&updated_at))
    .bind(ban_id)
    .execute(pool)
    .await?;

    append_operation_log(
        pool,
        "ban_record_updated",
        format!(
            "编辑了封禁记录 {}，更新为{}，时长为 {}，原因：{}",
            existing
                .nickname
                .clone()
                .unwrap_or_else(|| existing.steam_id.clone()),
            if updated.ban_type == "ip" { "IP封禁" } else { "Steam账号封禁" },
            updated
                .duration_seconds
                .map(|seconds| format!("{} 秒", seconds))
                .unwrap_or_else(|| "永久封禁".to_string()),
            updated.reason,
        ),
        &operator,
    )
    .await?;

    Ok(updated)
}

async fn revoke_ban_record(
    pool: &MySqlPool,
    ban_id: &str,
    operator_id: Option<String>,
) -> AppResult<BanRecord> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let existing = get_ban_record(pool, ban_id).await?;

    if existing.status == "revoked" {
        return Err(AppError::http(StatusCode::BAD_REQUEST, "该封禁记录已解除"));
    }

    let now = now_iso();
    sqlx::query(
        r#"
        UPDATE ban_records
           SET status = 'revoked', updated_at = ?, revoked_at = ?, revoked_by_operator_id = ?, revoked_by_operator_name = ?, revoked_by_operator_role = ?
         WHERE id = ?
        "#,
    )
    .bind(iso_to_mysql(&now))
    .bind(iso_to_mysql(&now))
    .bind(&operator.id)
    .bind(&operator.name)
    .bind(&operator.role)
    .bind(ban_id)
    .execute(pool)
    .await?;

    let revoked = BanRecord {
        status: "revoked".to_string(),
        updated_at: Some(now.clone()),
        revoked_at: Some(now),
        revoked_by_operator_id: Some(operator.id.clone()),
        revoked_by_operator_name: Some(operator.name.clone()),
        revoked_by_operator_role: Some(operator.role.clone()),
        ..existing
    };

    append_operation_log(
        pool,
        "ban_record_revoked",
        format!(
            "解除了玩家 {} 的封禁，原封禁属性为{}。",
            revoked
                .nickname
                .clone()
                .unwrap_or_else(|| revoked.steam_id.clone()),
            if revoked.ban_type == "ip" { "IP封禁" } else { "Steam账号封禁" },
        ),
        &operator,
    )
    .await?;

    Ok(revoked)
}

async fn delete_ban_record(
    pool: &MySqlPool,
    ban_id: &str,
    operator_id: Option<String>,
) -> AppResult<()> {
    let operator = get_operator_snapshot(pool, operator_id.as_deref(), true).await?;
    let existing = get_ban_record(pool, ban_id).await?;

    sqlx::query("DELETE FROM ban_records WHERE id = ?")
        .bind(ban_id)
        .execute(pool)
        .await?;

    append_operation_log(
        pool,
        "ban_record_deleted",
        format!(
            "删除了封禁记录 {}（{}）。",
            existing
                .nickname
                .clone()
                .unwrap_or_else(|| existing.steam_id.clone()),
            if existing.ban_type == "ip" { "IP封禁" } else { "Steam账号封禁" },
        ),
        &operator,
    )
    .await?;

    Ok(())
}

async fn get_ban_record(pool: &MySqlPool, ban_id: &str) -> AppResult<BanRecord> {
    let row = sqlx::query_as::<_, DbBanRecord>("SELECT * FROM ban_records WHERE id = ?")
        .bind(ban_id)
        .fetch_optional(pool)
        .await?;

    row.map(map_ban_record)
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到要操作的封禁记录"))
}

async fn list_website_admins(pool: &MySqlPool) -> AppResult<Vec<WebsiteAdmin>> {
    let rows = sqlx::query_as::<_, DbWebsiteAdmin>(
        "SELECT * FROM website_admins ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(map_website_admin).collect())
}

async fn get_operator_snapshot(
    pool: &MySqlPool,
    operator_id: Option<&str>,
    allow_fallback: bool,
) -> AppResult<OperatorSnapshot> {
    let admins = list_website_admins(pool).await?;
    if admins.is_empty() {
        return Err(AppError::http(
            StatusCode::INTERNAL_SERVER_ERROR,
            "管理员数据未初始化",
        ));
    }

    let matched = operator_id.and_then(|id| admins.iter().find(|admin| admin.id == id));
    let fallback = if allow_fallback { admins.first() } else { None };
    let operator = matched.or(fallback).ok_or_else(|| {
        AppError::http(StatusCode::UNAUTHORIZED, "未识别当前操作管理员")
    })?;

    Ok(OperatorSnapshot {
        id: operator.id.clone(),
        name: operator.display_name.clone(),
        role: operator.role.clone(),
    })
}

async fn update_website_admin(
    pool: &MySqlPool,
    admin_id: &str,
    draft: WebsiteAdminUpdateDraft,
    operator_id: Option<String>,
) -> AppResult<WebsiteAdmin> {
    validate_website_admin_update_draft(&draft)?;

    let admins = list_website_admins(pool).await?;
    let current_admin = get_operator_snapshot(pool, operator_id.as_deref(), false).await?;
    let current_admin_record = admins.iter().find(|admin| admin.id == current_admin.id);
    let target_admin = admins.iter().find(|admin| admin.id == admin_id);

    let current_admin_record = current_admin_record.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标管理员"))?;
    let target_admin = target_admin.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标管理员"))?;

    let is_self_edit = current_admin_record.id == admin_id;
    let is_system_admin = current_admin_record.role == "system_admin";

    if !is_system_admin && !is_self_edit {
        return Err(AppError::http(
            StatusCode::FORBIDDEN,
            "普通管理员只能编辑自己的信息",
        ));
    }

    let next_username = draft.username.trim().to_string();
    let next_display_name = draft.display_name.trim().to_string();
    let next_email = trim_to_none(draft.email);
    let next_note = trim_to_none(draft.note);
    let next_password = if draft.password.trim().is_empty() {
        target_admin.password.clone()
    } else {
        draft.password.trim().to_string()
    };
    let next_role = if is_system_admin {
        draft.role
    } else {
        target_admin.role.clone()
    };

    let has_duplicate_username = admins.iter().any(|admin| {
        admin.id != admin_id && admin.username.eq_ignore_ascii_case(&next_username)
    });
    if has_duplicate_username {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "用户名已存在，请更换其他用户名",
        ));
    }

    let remaining_system_admin_count = admins
        .iter()
        .filter(|admin| admin.id != admin_id && admin.role == "system_admin")
        .count();
    if target_admin.role == "system_admin"
        && next_role != "system_admin"
        && remaining_system_admin_count == 0
    {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "系统中至少需要保留一名系统管理员",
        ));
    }

    let updated_at = now_iso();
    sqlx::query(
        r#"
        UPDATE website_admins
           SET username = ?, display_name = ?, role = ?, password = ?, email = ?, note = ?, updated_at = ?
         WHERE id = ?
        "#,
    )
    .bind(&next_username)
    .bind(&next_display_name)
    .bind(&next_role)
    .bind(&next_password)
    .bind(&next_email)
    .bind(&next_note)
    .bind(iso_to_mysql(&updated_at))
    .bind(admin_id)
    .execute(pool)
    .await?;

    let updated_admin = WebsiteAdmin {
        id: target_admin.id.clone(),
        username: next_username,
        display_name: next_display_name,
        role: next_role,
        password: next_password,
        email: next_email,
        note: next_note,
        created_at: target_admin.created_at.clone(),
        updated_at,
    };

    append_operation_log(
        pool,
        "admin_profile_updated",
        if is_self_edit {
            format!(
                "修改了自己的管理员资料，当前用户名为 {}。",
                updated_admin.username
            )
        } else {
            format!(
                "修改了管理员 {} 的资料，当前用户名为 {}。",
                target_admin.display_name, updated_admin.username
            )
        },
        &OperatorSnapshot {
            id: current_admin_record.id.clone(),
            name: current_admin_record.display_name.clone(),
            role: current_admin_record.role.clone(),
        },
    )
    .await?;

    Ok(updated_admin)
}

async fn list_operation_logs(pool: &MySqlPool) -> AppResult<Vec<OperationLog>> {
    let rows = sqlx::query_as::<_, DbOperationLog>(
        "SELECT * FROM operation_logs ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(map_operation_log).collect())
}

async fn append_operation_log(
    pool: &MySqlPool,
    action: &str,
    detail: String,
    operator: &OperatorSnapshot,
) -> AppResult<OperationLog> {
    let log = OperationLog {
        id: prefixed_id("log"),
        created_at: now_iso(),
        operator_id: operator.id.clone(),
        operator_name: operator.name.clone(),
        operator_role: operator.role.clone(),
        action: action.to_string(),
        detail,
    };

    sqlx::query(
        r#"
        INSERT INTO operation_logs (
          id, created_at, operator_id, operator_name, operator_role, action, detail
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&log.id)
    .bind(iso_to_mysql(&log.created_at))
    .bind(&log.operator_id)
    .bind(&log.operator_name)
    .bind(&log.operator_role)
    .bind(&log.action)
    .bind(&log.detail)
    .execute(pool)
    .await?;

    Ok(log)
}

fn map_server_player(row: DbServerPlayer) -> ServerPlayer {
    ServerPlayer {
        id: row.id,
        nickname: row.nickname,
        steam_id: row.steam_id,
        ip_address: row.ip_address,
        connected_at: naive_to_iso(row.connected_at),
        ping: row.ping,
    }
}

fn map_whitelist_player(row: DbWhitelistPlayer) -> WhitelistPlayer {
    WhitelistPlayer {
        id: row.id,
        nickname: row.nickname,
        steam_id: row.steam_id,
        contact: row.contact,
        note: row.note,
        status: row.status,
        source: row.source,
        applied_at: naive_to_iso(row.applied_at),
        reviewed_at: row.reviewed_at.map(naive_to_iso),
    }
}

fn map_ban_record(row: DbBanRecord) -> BanRecord {
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

fn map_website_admin(row: DbWebsiteAdmin) -> WebsiteAdmin {
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

fn map_operation_log(row: DbOperationLog) -> OperationLog {
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

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn naive_to_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn iso_to_mysql(value: &str) -> String {
    let slice = value.get(0..23).unwrap_or(value);
    slice.replace('T', " ")
}

fn prefixed_id(prefix: &str) -> String {
    format!("{}_{}", prefix, Uuid::new_v4())
}

fn bool_to_i32(value: bool) -> i32 {
    if value { 1 } else { 0 }
}

fn trim_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn operator_id_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-kzguard-operator-id")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
}

fn require_non_empty(value: &str, message: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        return Err(AppError::http(StatusCode::BAD_REQUEST, message));
    }
    Ok(())
}

fn ipv4_regex() -> &'static Regex {
    static IPV4_REGEX: OnceLock<Regex> = OnceLock::new();
    IPV4_REGEX.get_or_init(|| {
        Regex::new(r"^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$")
            .expect("invalid ipv4 regex")
    })
}

fn validate_server_fields(
    name: Option<&str>,
    ip: &str,
    port: i32,
    rcon_password: &str,
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

    Ok(())
}

fn validate_application_draft(nickname: &str, steam_id: &str) -> AppResult<()> {
    require_non_empty(nickname, "请输入玩家昵称")?;
    require_non_empty(steam_id, "请输入 Steam ID")?;
    Ok(())
}

fn validate_manual_whitelist_draft(
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

fn validate_ban_draft(
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

fn validate_website_admin_update_draft(draft: &WebsiteAdminUpdateDraft) -> AppResult<()> {
    require_non_empty(&draft.username, "请输入用户名")?;
    require_non_empty(&draft.display_name, "请输入管理员名称")?;

    if !draft.password.trim().is_empty() && draft.password.trim().len() < 6 {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "密码至少需要 6 位",
        ));
    }

    if draft.role != "system_admin" && draft.role != "normal_admin" {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "管理员角色不合法",
        ));
    }

    Ok(())
}

async fn verify_rcon_connection(draft: &ServerDraft) -> bool {
    sleep(Duration::from_millis(300)).await;
    draft.rcon_password.trim().len() >= 6 && draft.port > 0
}

fn steam_profile_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"steamcommunity\.com/profiles/(\d{17})")
            .expect("invalid steam profile regex")
    })
}

fn steam_id_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"^STEAM_[0-5]:([0-1]):(\d+)$").expect("invalid steam id regex")
    })
}

fn steam_id3_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"^\[?U:1:(\d+)\]?$")
            .expect("invalid steam id3 regex")
    })
}

fn resolve_steam_identifiers(input: &str) -> AppResult<ResolvedSteamIdentifiers> {
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

fn from_account_id(account_id: u64) -> ResolvedSteamIdentifiers {
    let y = account_id % 2;
    let z = (account_id - y) / 2;
    ResolvedSteamIdentifiers {
        steam_id64: (STEAM_ID64_BASE + account_id).to_string(),
        steam_id: format!("STEAM_1:{}:{}", y, z),
        steam_id3: format!("[U:1:{}]", account_id),
    }
}

fn create_ban_record(
    nickname: Option<String>,
    ban_type: String,
    steam_identifier: String,
    ip_address: Option<String>,
    reason: String,
    duration_seconds: Option<i32>,
    server_name: String,
    community_name: Option<String>,
    operator: &OperatorSnapshot,
    source: &str,
) -> AppResult<BanRecord> {
    let identifiers = resolve_steam_identifiers(&steam_identifier)?;
    let now = now_iso();

    Ok(BanRecord {
        id: prefixed_id("ban"),
        nickname,
        ban_type,
        status: "active".to_string(),
        steam_identifier: steam_identifier.trim().to_string(),
        steam_id64: identifiers.steam_id64,
        steam_id: identifiers.steam_id,
        steam_id3: identifiers.steam_id3,
        ip_address: trim_to_none(ip_address),
        reason: reason.trim().to_string(),
        duration_seconds,
        banned_at: now.clone(),
        server_name,
        community_name,
        operator_id: operator.id.clone(),
        operator_name: operator.name.clone(),
        operator_role: operator.role.clone(),
        source: source.to_string(),
        updated_at: Some(now),
        revoked_at: None,
        revoked_by_operator_id: None,
        revoked_by_operator_name: None,
        revoked_by_operator_role: None,
    })
}

fn note_was_provided(next_note: &Option<String>, existing_note: &Option<String>) -> bool {
    match (next_note, existing_note) {
        (Some(next), Some(existing)) => next != existing,
        (Some(_), None) => true,
        _ => false,
    }
}

fn users_summary() -> UserSummary {
    UserSummary {
        enabled: false,
        message: "网站用户模块待开发".to_string(),
        planned_modules: vec![
            "网站管理员账号体系".to_string(),
            "社区负责人角色权限".to_string(),
            "玩家个人中心与白名单申请入口".to_string(),
            "登录、鉴权与操作日志".to_string(),
        ],
    }
}

fn seed_data() -> SeedData {
    SeedData {
        communities: vec![
            Community {
                id: "community_hightower".to_string(),
                name: "HighTower KZ 社区".to_string(),
                created_at: "2026-03-06T12:00:00.000Z".to_string(),
                servers: vec![Server {
                    id: "server_hightower_1".to_string(),
                    name: "Hightower #1 Beginner".to_string(),
                    ip: "45.32.18.20".to_string(),
                    port: 27015,
                    rcon_password: "rcon-demo-01".to_string(),
                    rcon_verified_at: "2026-03-06T12:05:00.000Z".to_string(),
                    whitelist_enabled: true,
                    entry_verification_enabled: false,
                    online_players: vec![
                        ServerPlayer {
                            id: "player_srv_001".to_string(),
                            nickname: "KZRunner".to_string(),
                            steam_id: "STEAM_1:1:120001".to_string(),
                            ip_address: "203.0.113.21".to_string(),
                            connected_at: "2026-03-07T09:15:00.000Z".to_string(),
                            ping: 32,
                        },
                        ServerPlayer {
                            id: "player_srv_002".to_string(),
                            nickname: "LongJump".to_string(),
                            steam_id: "STEAM_1:0:889911".to_string(),
                            ip_address: "203.0.113.34".to_string(),
                            connected_at: "2026-03-07T09:22:00.000Z".to_string(),
                            ping: 48,
                        },
                    ],
                }],
            },
            Community {
                id: "community_skyline".to_string(),
                name: "Skyline Climb 社区".to_string(),
                created_at: "2026-03-05T08:30:00.000Z".to_string(),
                servers: vec![
                    Server {
                        id: "server_skyline_1".to_string(),
                        name: "Skyline #2 Pro".to_string(),
                        ip: "103.21.244.88".to_string(),
                        port: 27016,
                        rcon_password: "rcon-demo-02".to_string(),
                        rcon_verified_at: "2026-03-05T09:00:00.000Z".to_string(),
                        whitelist_enabled: false,
                        entry_verification_enabled: true,
                        online_players: vec![ServerPlayer {
                            id: "player_srv_003".to_string(),
                            nickname: "CliffSide".to_string(),
                            steam_id: "STEAM_1:0:901245".to_string(),
                            ip_address: "198.51.100.16".to_string(),
                            connected_at: "2026-03-07T08:58:00.000Z".to_string(),
                            ping: 67,
                        }],
                    },
                    Server {
                        id: "server_skyline_2".to_string(),
                        name: "Skyline #3 Fastcup".to_string(),
                        ip: "103.21.244.89".to_string(),
                        port: 27017,
                        rcon_password: "rcon-demo-03".to_string(),
                        rcon_verified_at: "2026-03-05T09:10:00.000Z".to_string(),
                        whitelist_enabled: true,
                        entry_verification_enabled: true,
                        online_players: vec![
                            ServerPlayer {
                                id: "player_srv_004".to_string(),
                                nickname: "WallBug".to_string(),
                                steam_id: "STEAM_1:1:765432".to_string(),
                                ip_address: "198.51.100.72".to_string(),
                                connected_at: "2026-03-07T09:05:00.000Z".to_string(),
                                ping: 54,
                            },
                            ServerPlayer {
                                id: "player_srv_005".to_string(),
                                nickname: "SpeedArc".to_string(),
                                steam_id: "STEAM_1:0:445566".to_string(),
                                ip_address: "192.0.2.55".to_string(),
                                connected_at: "2026-03-07T09:11:00.000Z".to_string(),
                                ping: 41,
                            },
                        ],
                    },
                ],
            },
        ],
        whitelist: vec![
            WhitelistPlayer {
                id: "player_approved_1".to_string(),
                nickname: "KZRunner".to_string(),
                steam_id: "STEAM_1:1:120001".to_string(),
                contact: Some("qq: 223344".to_string()),
                note: Some("比赛服常驻玩家".to_string()),
                status: "approved".to_string(),
                source: "manual".to_string(),
                applied_at: "2026-03-04T13:10:00.000Z".to_string(),
                reviewed_at: Some("2026-03-04T14:20:00.000Z".to_string()),
            },
            WhitelistPlayer {
                id: "player_pending_1".to_string(),
                nickname: "LongJump".to_string(),
                steam_id: "STEAM_1:0:889911".to_string(),
                contact: Some("discord: longjump".to_string()),
                note: Some("申请进入训练服".to_string()),
                status: "pending".to_string(),
                source: "application".to_string(),
                applied_at: "2026-03-06T10:15:00.000Z".to_string(),
                reviewed_at: None,
            },
            WhitelistPlayer {
                id: "player_pending_2".to_string(),
                nickname: "CliffSide".to_string(),
                steam_id: "STEAM_1:0:901245".to_string(),
                contact: Some("qq: 556677".to_string()),
                note: Some("新玩家，等待审核".to_string()),
                status: "pending".to_string(),
                source: "application".to_string(),
                applied_at: "2026-03-06T11:20:00.000Z".to_string(),
                reviewed_at: None,
            },
            WhitelistPlayer {
                id: "player_rejected_1".to_string(),
                nickname: "WallBug".to_string(),
                steam_id: "STEAM_1:1:765432".to_string(),
                contact: Some("qq: 889900".to_string()),
                note: Some("资料不完整".to_string()),
                status: "rejected".to_string(),
                source: "manual".to_string(),
                applied_at: "2026-03-03T15:40:00.000Z".to_string(),
                reviewed_at: Some("2026-03-03T16:00:00.000Z".to_string()),
            },
        ],
        bans: vec![
            BanRecord {
                id: "ban_001".to_string(),
                nickname: Some("WallBug".to_string()),
                ban_type: "steam_account".to_string(),
                status: "active".to_string(),
                steam_identifier: "STEAM_1:1:765432".to_string(),
                steam_id64: "76561197961796593".to_string(),
                steam_id: "STEAM_1:1:765432".to_string(),
                steam_id3: "[U:1:1530865]".to_string(),
                ip_address: Some("198.51.100.72".to_string()),
                reason: "多次利用漏洞干扰服务器秩序".to_string(),
                duration_seconds: None,
                banned_at: "2026-03-06T12:40:00.000Z".to_string(),
                server_name: "Skyline #3 Fastcup".to_string(),
                community_name: Some("Skyline Climb 社区".to_string()),
                operator_id: "admin_ops".to_string(),
                operator_name: "运营管理员".to_string(),
                operator_role: "normal_admin".to_string(),
                source: "server_action".to_string(),
                updated_at: Some("2026-03-06T12:40:00.000Z".to_string()),
                revoked_at: None,
                revoked_by_operator_id: None,
                revoked_by_operator_name: None,
                revoked_by_operator_role: None,
            },
            BanRecord {
                id: "ban_002".to_string(),
                nickname: None,
                ban_type: "ip".to_string(),
                status: "active".to_string(),
                steam_identifier: "https://steamcommunity.com/profiles/76561197960505731".to_string(),
                steam_id64: "76561197960505731".to_string(),
                steam_id: "STEAM_1:1:120001".to_string(),
                steam_id3: "[U:1:240003]".to_string(),
                ip_address: None,
                reason: "恶意刷屏与骚扰其他玩家".to_string(),
                duration_seconds: Some(86400),
                banned_at: "2026-03-07T01:15:00.000Z".to_string(),
                server_name: "手动录入（未关联服务器）".to_string(),
                community_name: None,
                operator_id: "admin_root".to_string(),
                operator_name: "主系统管理员".to_string(),
                operator_role: "system_admin".to_string(),
                source: "manual".to_string(),
                updated_at: Some("2026-03-07T01:15:00.000Z".to_string()),
                revoked_at: None,
                revoked_by_operator_id: None,
                revoked_by_operator_name: None,
                revoked_by_operator_role: None,
            },
        ],
        admins: vec![
            WebsiteAdmin {
                id: "admin_root".to_string(),
                username: "root_admin".to_string(),
                display_name: "主系统管理员".to_string(),
                role: "system_admin".to_string(),
                password: "Admin@123".to_string(),
                email: Some("root@kzguard.local".to_string()),
                note: Some("拥有网站全部权限，可维护其他管理员账号。".to_string()),
                created_at: "2026-03-06T09:00:00.000Z".to_string(),
                updated_at: "2026-03-06T09:00:00.000Z".to_string(),
            },
            WebsiteAdmin {
                id: "admin_ops".to_string(),
                username: "ops_manager".to_string(),
                display_name: "运营管理员".to_string(),
                role: "normal_admin".to_string(),
                password: "Ops@1234".to_string(),
                email: Some("ops@kzguard.local".to_string()),
                note: Some("负责日常社区与白名单审核。".to_string()),
                created_at: "2026-03-06T09:10:00.000Z".to_string(),
                updated_at: "2026-03-06T09:10:00.000Z".to_string(),
            },
            WebsiteAdmin {
                id: "admin_review".to_string(),
                username: "review_guard".to_string(),
                display_name: "审核管理员".to_string(),
                role: "normal_admin".to_string(),
                password: "Review@123".to_string(),
                email: Some("review@kzguard.local".to_string()),
                note: Some("负责玩家申请初审与记录维护。".to_string()),
                created_at: "2026-03-06T09:20:00.000Z".to_string(),
                updated_at: "2026-03-06T09:20:00.000Z".to_string(),
            },
        ],
        operation_logs: vec![
            OperationLog {
                id: "log_001".to_string(),
                created_at: "2026-03-06T09:35:00.000Z".to_string(),
                operator_id: "admin_root".to_string(),
                operator_name: "主系统管理员".to_string(),
                operator_role: "system_admin".to_string(),
                action: "admin_profile_updated".to_string(),
                detail: "修改了 运营管理员 的备注信息，用于明确其负责社区与白名单日常维护。".to_string(),
            },
            OperationLog {
                id: "log_002".to_string(),
                created_at: "2026-03-06T10:10:00.000Z".to_string(),
                operator_id: "admin_ops".to_string(),
                operator_name: "运营管理员".to_string(),
                operator_role: "normal_admin".to_string(),
                action: "community_created".to_string(),
                detail: "新增社区 “HighTower KZ 社区”。".to_string(),
            },
            OperationLog {
                id: "log_003".to_string(),
                created_at: "2026-03-06T10:30:00.000Z".to_string(),
                operator_id: "admin_review".to_string(),
                operator_name: "审核管理员".to_string(),
                operator_role: "normal_admin".to_string(),
                action: "whitelist_approved".to_string(),
                detail: "审核通过玩家 KZRunner 的白名单申请。".to_string(),
            },
        ],
    }
}
