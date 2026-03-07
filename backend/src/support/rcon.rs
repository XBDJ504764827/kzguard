use crate::http::requests::ServerDraft;
use std::time::Duration;
use tokio::time::sleep;

pub(crate) async fn verify_rcon_connection(draft: &ServerDraft) -> bool {
    sleep(Duration::from_millis(300)).await;
    draft.rcon_password.trim().len() >= 6 && draft.port > 0
}
