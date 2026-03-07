use axum::Json;
use serde_json::json;

use crate::support::time::now_iso;

pub(crate) async fn health_handler() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "kzguard-backend",
        "timestamp": now_iso(),
    }))
}
