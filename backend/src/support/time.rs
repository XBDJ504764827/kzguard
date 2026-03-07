use chrono::{DateTime, Duration, NaiveDateTime, SecondsFormat, Utc};

pub(crate) fn datetime_to_iso(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(crate) fn now_iso() -> String {
    datetime_to_iso(Utc::now())
}

pub(crate) fn now_utc() -> DateTime<Utc> {
    Utc::now()
}

pub(crate) fn naive_to_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(crate) fn seconds_ago_from(base: DateTime<Utc>, seconds: i64) -> String {
    let safe_seconds = seconds.max(0);
    datetime_to_iso(base - Duration::seconds(safe_seconds))
}

pub(crate) fn iso_to_mysql(value: &str) -> String {
    let slice = value.get(0..23).unwrap_or(value);
    slice.replace('T', " ")
}
