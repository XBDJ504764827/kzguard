use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct ApiEnvelope<T> {
    pub(crate) data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) message: Option<String>,
}

impl<T> ApiEnvelope<T> {
    pub(crate) fn new(data: T) -> Self {
        Self {
            data,
            message: None,
        }
    }

    pub(crate) fn with_message(data: T, message: impl Into<String>) -> Self {
        Self {
            data,
            message: Some(message.into()),
        }
    }
}

#[derive(Serialize)]
pub(crate) struct MessageResponse {
    pub(crate) message: String,
}
