use crate::config::AccessControlConfig;
use redis::Client as RedisClient;
use sqlx::MySqlPool;
use std::sync::Arc;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) pool: MySqlPool,
    pub(crate) redis: RedisClient,
    pub(crate) http_client: reqwest::Client,
    pub(crate) player_presence_ttl_seconds: u64,
    pub(crate) access_control: AccessControlConfig,
}

pub(crate) type SharedState = Arc<AppState>;
