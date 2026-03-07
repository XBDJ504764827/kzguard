use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use thiserror::Error;

pub(crate) type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub(crate) enum AppError {
    #[error("{message}")]
    Http { status: StatusCode, message: String },
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

impl AppError {
    pub(crate) fn http(status: StatusCode, message: impl Into<String>) -> Self {
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
