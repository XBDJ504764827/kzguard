use crate::{
    application::mappers::map_website_admin,
    config::DefaultAdminConfig,
    domain::{db::DbWebsiteAdmin, models::{AuthSession, WebsiteAdmin}},
    error::{AppError, AppResult},
    support::{
        ids::prefixed_id,
        time::{iso_to_mysql, now_iso},
        validation::require_non_empty,
    },
};
use axum::http::StatusCode;
use chrono::{Duration, SecondsFormat, Utc};
use sqlx::MySqlPool;
use uuid::Uuid;

const SESSION_DURATION_DAYS: i64 = 7;

fn generate_session_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn session_expires_at_iso() -> String {
    (Utc::now() + Duration::days(SESSION_DURATION_DAYS))
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(crate) async fn login_admin(
    pool: &MySqlPool,
    username: String,
    password: String,
    user_agent: Option<String>,
    ip_address: Option<String>,
) -> AppResult<AuthSession> {
    require_non_empty(&username, "请输入用户名")?;
    require_non_empty(&password, "请输入密码")?;

    let admin = sqlx::query_as::<_, DbWebsiteAdmin>(
        "SELECT * FROM website_admins WHERE username = ? LIMIT 1",
    )
    .bind(username.trim())
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::http(StatusCode::UNAUTHORIZED, "用户名或密码错误"))?;

    if admin.password != password {
        return Err(AppError::http(StatusCode::UNAUTHORIZED, "用户名或密码错误"));
    }

    let token = generate_session_token();
    let created_at = now_iso();
    let expires_at = session_expires_at_iso();

    sqlx::query(
        r#"
        INSERT INTO admin_sessions (
          id, admin_id, token, created_at, expires_at, revoked_at, user_agent, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(prefixed_id("session"))
    .bind(&admin.id)
    .bind(&token)
    .bind(iso_to_mysql(&created_at))
    .bind(iso_to_mysql(&expires_at))
    .bind(Option::<String>::None)
    .bind(user_agent)
    .bind(ip_address)
    .execute(pool)
    .await?;

    Ok(AuthSession {
        token,
        admin: map_website_admin(admin),
    })
}

pub(crate) async fn require_authenticated_admin(
    pool: &MySqlPool,
    token: Option<&str>,
) -> AppResult<WebsiteAdmin> {
    let token = token
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::http(StatusCode::UNAUTHORIZED, "请先登录"))?;

    let admin = sqlx::query_as::<_, DbWebsiteAdmin>(
        r#"
        SELECT a.*
          FROM admin_sessions s
          INNER JOIN website_admins a ON a.id = s.admin_id
         WHERE s.token = ?
           AND s.revoked_at IS NULL
           AND s.expires_at > UTC_TIMESTAMP(3)
         LIMIT 1
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::http(StatusCode::UNAUTHORIZED, "登录状态已失效，请重新登录"))?;

    Ok(map_website_admin(admin))
}

pub(crate) async fn logout_admin(pool: &MySqlPool, token: Option<&str>) -> AppResult<()> {
    let Some(token) = token.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };

    sqlx::query(
        "UPDATE admin_sessions SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL",
    )
    .bind(iso_to_mysql(&now_iso()))
    .bind(token)
    .execute(pool)
    .await?;

    Ok(())
}

pub(crate) async fn ensure_default_system_admin(
    pool: &MySqlPool,
    config: &DefaultAdminConfig,
) -> AppResult<()> {
    let existing = sqlx::query_as::<_, DbWebsiteAdmin>(
        "SELECT * FROM website_admins WHERE username = ? LIMIT 1",
    )
    .bind(&config.username)
    .fetch_optional(pool)
    .await?;

    if let Some(admin) = existing {
        if admin.role != "system_admin" {
            sqlx::query(
                "UPDATE website_admins SET role = 'system_admin', updated_at = ? WHERE id = ?",
            )
            .bind(iso_to_mysql(&now_iso()))
            .bind(&admin.id)
            .execute(pool)
            .await?;
        }

        return Ok(());
    }

    let now = now_iso();
    sqlx::query(
        r#"
        INSERT INTO website_admins (
          id, username, display_name, role, password, email, note, created_at, updated_at
        ) VALUES (?, ?, ?, 'system_admin', ?, ?, ?, ?, ?)
        "#,
    )
    .bind(prefixed_id("admin"))
    .bind(&config.username)
    .bind(&config.display_name)
    .bind(&config.password)
    .bind(&config.email)
    .bind(&config.note)
    .bind(iso_to_mysql(&now))
    .bind(iso_to_mysql(&now))
    .execute(pool)
    .await?;

    println!(
        "created default system admin: username={}, password={}",
        config.username, config.password
    );

    Ok(())
}
