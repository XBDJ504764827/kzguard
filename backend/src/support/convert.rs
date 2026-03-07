pub(crate) fn bool_to_i32(value: bool) -> i32 {
    if value { 1 } else { 0 }
}

pub(crate) fn trim_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}
