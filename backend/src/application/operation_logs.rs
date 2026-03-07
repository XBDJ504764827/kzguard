use crate::{
    application::mappers::map_operation_log,
    domain::{
        db::DbOperationLog,
        models::{OperationLog, OperatorSnapshot},
    },
    error::AppResult,
    support::{
        ids::prefixed_id,
        time::{iso_to_mysql, now_iso},
    },
};
use sqlx::MySqlPool;

pub(crate) async fn list_operation_logs(pool: &MySqlPool) -> AppResult<Vec<OperationLog>> {
    let rows = sqlx::query_as::<_, DbOperationLog>(
        "SELECT * FROM operation_logs ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(map_operation_log).collect())
}

pub(crate) async fn append_operation_log(
    pool: &MySqlPool,
    action: &str,
    detail: String,
    operator: &OperatorSnapshot,
) -> AppResult<OperationLog> {
    let log = OperationLog {
        id: prefixed_id("log"),
        created_at: now_iso(),
        operator_id: operator.id.clone(),
        operator_name: operator.name.clone(),
        operator_role: operator.role.clone(),
        action: action.to_string(),
        detail,
    };

    sqlx::query(
        r#"
        INSERT INTO operation_logs (
          id, created_at, operator_id, operator_name, operator_role, action, detail
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&log.id)
    .bind(iso_to_mysql(&log.created_at))
    .bind(&log.operator_id)
    .bind(&log.operator_name)
    .bind(&log.operator_role)
    .bind(&log.action)
    .bind(&log.detail)
    .execute(pool)
    .await?;

    Ok(log)
}
