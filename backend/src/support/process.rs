use std::process::Stdio;
use tokio::{process::Command, time::{Duration, timeout}};

const HOST_COMMAND_TIMEOUT: Duration = Duration::from_secs(20);

pub(crate) async fn execute_host_command(command: &str) -> Result<(), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("宿主机重启命令为空".to_string());
    }

    let mut process = Command::new("sh");
    process
        .arg("-lc")
        .arg(trimmed)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let output = timeout(HOST_COMMAND_TIMEOUT, process.output())
        .await
        .map_err(|_| format!("宿主机命令执行超时（>{} 秒）", HOST_COMMAND_TIMEOUT.as_secs()))?
        .map_err(|error| format!("启动宿主机命令失败：{}", error))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("退出码 {:?}", output.status.code())
    };

    Err(format!("宿主机命令执行失败：{}", detail))
}
