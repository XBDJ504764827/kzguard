use crate::{
    application::{mappers::map_website_admin, operation_logs::append_operation_log},
    domain::{
        db::DbWebsiteAdmin,
        models::{OperatorSnapshot, WebsiteAdmin},
    },
    error::{AppError, AppResult},
    http::requests::WebsiteAdminUpdateDraft,
    support::{
        convert::trim_to_none,
        time::{iso_to_mysql, now_iso},
        validation::validate_website_admin_update_draft,
    },
};
use axum::http::StatusCode;
use sqlx::MySqlPool;

pub(crate) async fn list_website_admins(pool: &MySqlPool) -> AppResult<Vec<WebsiteAdmin>> {
    let rows =
        sqlx::query_as::<_, DbWebsiteAdmin>("SELECT * FROM website_admins ORDER BY created_at ASC")
            .fetch_all(pool)
            .await?;

    Ok(rows.into_iter().map(map_website_admin).collect())
}

pub(crate) async fn get_operator_snapshot(
    pool: &MySqlPool,
    operator_id: Option<&str>,
    allow_fallback: bool,
) -> AppResult<OperatorSnapshot> {
    let admins = list_website_admins(pool).await?;
    if admins.is_empty() {
        return Err(AppError::http(
            StatusCode::INTERNAL_SERVER_ERROR,
            "管理员数据未初始化",
        ));
    }

    let matched = operator_id.and_then(|id| admins.iter().find(|admin| admin.id == id));
    let fallback = if allow_fallback { admins.first() } else { None };
    let operator = matched
        .or(fallback)
        .ok_or_else(|| AppError::http(StatusCode::UNAUTHORIZED, "未识别当前操作管理员"))?;

    Ok(OperatorSnapshot {
        id: operator.id.clone(),
        name: operator.display_name.clone(),
        role: operator.role.clone(),
    })
}

pub(crate) async fn update_website_admin(
    pool: &MySqlPool,
    admin_id: &str,
    draft: WebsiteAdminUpdateDraft,
    operator_id: Option<String>,
) -> AppResult<WebsiteAdmin> {
    validate_website_admin_update_draft(&draft)?;

    let admins = list_website_admins(pool).await?;
    let current_admin = get_operator_snapshot(pool, operator_id.as_deref(), false).await?;
    let current_admin_record = admins.iter().find(|admin| admin.id == current_admin.id);
    let target_admin = admins.iter().find(|admin| admin.id == admin_id);

    let current_admin_record = current_admin_record
        .ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标管理员"))?;
    let target_admin =
        target_admin.ok_or_else(|| AppError::http(StatusCode::NOT_FOUND, "未找到目标管理员"))?;

    let is_self_edit = current_admin_record.id == admin_id;
    let is_system_admin = current_admin_record.role == "system_admin";

    if !is_system_admin && !is_self_edit {
        return Err(AppError::http(
            StatusCode::FORBIDDEN,
            "普通管理员只能编辑自己的信息",
        ));
    }

    let next_username = draft.username.trim().to_string();
    let next_display_name = draft.display_name.trim().to_string();
    let next_email = trim_to_none(draft.email);
    let next_note = trim_to_none(draft.note);
    let next_password = if draft.password.trim().is_empty() {
        target_admin.password.clone()
    } else {
        draft.password.trim().to_string()
    };
    let next_role = if is_system_admin {
        draft.role
    } else {
        target_admin.role.clone()
    };

    let has_duplicate_username = admins
        .iter()
        .any(|admin| admin.id != admin_id && admin.username.eq_ignore_ascii_case(&next_username));
    if has_duplicate_username {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "用户名已存在，请更换其他用户名",
        ));
    }

    let remaining_system_admin_count = admins
        .iter()
        .filter(|admin| admin.id != admin_id && admin.role == "system_admin")
        .count();
    if target_admin.role == "system_admin"
        && next_role != "system_admin"
        && remaining_system_admin_count == 0
    {
        return Err(AppError::http(
            StatusCode::BAD_REQUEST,
            "系统中至少需要保留一名系统管理员",
        ));
    }

    let updated_at = now_iso();
    sqlx::query(
        r#"
        UPDATE website_admins
           SET username = ?, display_name = ?, role = ?, password = ?, email = ?, note = ?, updated_at = ?
         WHERE id = ?
        "#,
    )
    .bind(&next_username)
    .bind(&next_display_name)
    .bind(&next_role)
    .bind(&next_password)
    .bind(&next_email)
    .bind(&next_note)
    .bind(iso_to_mysql(&updated_at))
    .bind(admin_id)
    .execute(pool)
    .await?;

    let updated_admin = WebsiteAdmin {
        id: target_admin.id.clone(),
        username: next_username,
        display_name: next_display_name,
        role: next_role,
        password: next_password,
        email: next_email,
        note: next_note,
        created_at: target_admin.created_at.clone(),
        updated_at,
    };

    append_operation_log(
        pool,
        "admin_profile_updated",
        if is_self_edit {
            format!(
                "修改了自己的管理员资料，当前用户名为 {}。",
                updated_admin.username
            )
        } else {
            format!(
                "修改了管理员 {} 的资料，当前用户名为 {}。",
                target_admin.display_name, updated_admin.username
            )
        },
        &OperatorSnapshot {
            id: current_admin_record.id.clone(),
            name: current_admin_record.display_name.clone(),
            role: current_admin_record.role.clone(),
        },
    )
    .await?;

    Ok(updated_admin)
}
