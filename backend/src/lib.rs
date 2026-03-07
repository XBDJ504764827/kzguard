mod application;
mod config;
mod domain;
mod error;
mod http;
mod infra;
mod state;
mod support;

use anyhow::Context;
use dotenvy::dotenv;
use std::sync::Arc;
use tokio::net::TcpListener;

pub async fn run() -> anyhow::Result<()> {
    dotenv().ok();
    let config = config::load_config();
    let pool = infra::mysql::init_database(&config)
        .await
        .context("failed to initialize mysql database")?;
    let redis = infra::redis::init_redis(&config)
        .await
        .context("failed to initialize redis")?;

    println!(
        "mysql connected to {}:{}/{}",
        config.mysql.host, config.mysql.port, config.mysql.database
    );
    println!("redis connected to {}", config.redis.url);

    let state = Arc::new(state::AppState {
        pool,
        redis,
        player_presence_ttl_seconds: config.redis.player_presence_ttl_seconds,
    });
    let app = http::build_router(state);

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
