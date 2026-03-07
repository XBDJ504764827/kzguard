use axum::http::HeaderMap;

pub(crate) fn operator_id_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-kzguard-operator-id")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
}
