use sqlx::MySqlPool;
use std::sync::Arc;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) pool: MySqlPool,
}

pub(crate) type SharedState = Arc<AppState>;
