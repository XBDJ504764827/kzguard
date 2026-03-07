use uuid::Uuid;

pub(crate) fn prefixed_id(prefix: &str) -> String {
    format!("{}_{}", prefix, Uuid::new_v4())
}
