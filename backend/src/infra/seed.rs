use crate::domain::models::{
    BanRecord, Community, OperationLog, SeedData, UserSummary, WebsiteAdmin, WhitelistPlayer,
};

pub(crate) fn users_summary() -> UserSummary {
    UserSummary {
        enabled: true,
        message: "网站用户模块已启用，当前使用 Rust 后端与真实数据。".to_string(),
        planned_modules: vec![
            "更细粒度的社区权限控制".to_string(),
            "玩家个人中心与申诉流程".to_string(),
            "双因素认证与审计增强".to_string(),
        ],
    }
}

pub(crate) fn seed_data() -> SeedData {
    SeedData {
        communities: Vec::<Community>::new(),
        whitelist: Vec::<WhitelistPlayer>::new(),
        bans: Vec::<BanRecord>::new(),
        admins: Vec::<WebsiteAdmin>::new(),
        operation_logs: Vec::<OperationLog>::new(),
    }
}
