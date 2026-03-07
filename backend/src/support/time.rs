use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};

pub(crate) fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(crate) fn naive_to_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(crate) fn iso_to_mysql(value: &str) -> String {
    let slice = value.get(0..23).unwrap_or(value);
    slice.replace('T', " ")
}
