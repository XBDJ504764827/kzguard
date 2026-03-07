use uuid::Uuid;

pub(crate) fn prefixed_id(prefix: &str) -> String {
    format!("{}_{}", prefix, Uuid::new_v4())
}


pub(crate) fn generate_plugin_token() -> String {
    format!("pt_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}
