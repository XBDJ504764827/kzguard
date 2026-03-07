use crate::http::requests::ServerDraft;
use anyhow::anyhow;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    time::{Duration, timeout},
};

const RCON_TIMEOUT: Duration = Duration::from_secs(3);
const AUTH_PACKET_ID: i32 = 21_474;
const COMMAND_PACKET_ID: i32 = 21_475;
const SERVERDATA_RESPONSE_VALUE: i32 = 0;
const SERVERDATA_EXECCOMMAND: i32 = 2;
const SERVERDATA_AUTH: i32 = 3;
const SERVERDATA_AUTH_RESPONSE: i32 = 2;
const MAX_PACKET_SIZE: i32 = 8192;

#[derive(Debug)]
struct RconPacket {
    id: i32,
    packet_type: i32,
    body: String,
}

pub(crate) async fn verify_rcon_connection(draft: &ServerDraft) -> Result<(), String> {
    let mut stream = connect_and_authenticate(draft.ip.trim(), draft.port, draft.rcon_password.trim()).await?;
    send_packet(&mut stream, COMMAND_PACKET_ID, SERVERDATA_EXECCOMMAND, "echo kzguard_rcon_ok")
        .await
        .map_err(|error| format!("发送 RCON 测试命令失败：{}", error))?;
    Ok(())
}

pub(crate) async fn execute_rcon_command(
    ip: &str,
    port: i32,
    password: &str,
    command: &str,
) -> Result<String, String> {
    let mut stream = connect_and_authenticate(ip.trim(), port, password.trim()).await?;

    send_packet(&mut stream, COMMAND_PACKET_ID, SERVERDATA_EXECCOMMAND, command)
        .await
        .map_err(|error| format!("发送 RCON 指令失败：{}", error))?;

    let mut response = String::new();

    for _ in 0..4 {
        let packet = match timeout(RCON_TIMEOUT, read_packet(&mut stream)).await {
            Ok(Ok(packet)) => packet,
            Ok(Err(error)) => return Err(format!("读取 RCON 指令响应失败：{}", error)),
            Err(_) => break,
        };

        if packet.id != COMMAND_PACKET_ID {
            continue;
        }

        if packet.packet_type == SERVERDATA_RESPONSE_VALUE && !packet.body.trim().is_empty() {
            response.push_str(packet.body.trim());
        }
    }

    Ok(response)
}

async fn connect_and_authenticate(
    ip: &str,
    port: i32,
    password: &str,
) -> Result<TcpStream, String> {
    let address = format!("{}:{}", ip, port);
    let connect_result = timeout(RCON_TIMEOUT, TcpStream::connect(&address))
        .await
        .map_err(|_| format!("连接服务器 {} 超时，请确认 IP、端口和防火墙设置", address))?;

    let mut stream = connect_result.map_err(|error| format!("无法连接到服务器 {}：{}", address, error))?;

    send_packet(&mut stream, AUTH_PACKET_ID, SERVERDATA_AUTH, password)
        .await
        .map_err(|error| format!("发送 RCON 认证请求失败：{}", error))?;

    for _ in 0..6 {
        let packet = timeout(RCON_TIMEOUT, read_packet(&mut stream))
            .await
            .map_err(|_| "等待 RCON 响应超时，请确认服务器已开启 RCON 并允许 TCP 连接".to_string())?
            .map_err(|error| format!("读取 RCON 响应失败：{}", error))?;

        if packet.packet_type != SERVERDATA_AUTH_RESPONSE {
            continue;
        }

        if packet.id == -1 {
            return Err("RCON 密码验证失败，请检查密码是否正确".to_string());
        }

        if packet.id == AUTH_PACKET_ID {
            return Ok(stream);
        }
    }

    Err("未收到有效的 RCON 认证响应，请确认服务器已开启 RCON".to_string())
}

async fn send_packet(
    stream: &mut TcpStream,
    packet_id: i32,
    packet_type: i32,
    body: &str,
) -> anyhow::Result<()> {
    let body_bytes = body.as_bytes();
    let packet_size = 4 + 4 + body_bytes.len() + 2;
    let packet_size = i32::try_from(packet_size).map_err(|_| anyhow!("RCON 数据包过大"))?;

    let mut packet = Vec::with_capacity(4 + packet_size as usize);
    packet.extend_from_slice(&packet_size.to_le_bytes());
    packet.extend_from_slice(&packet_id.to_le_bytes());
    packet.extend_from_slice(&packet_type.to_le_bytes());
    packet.extend_from_slice(body_bytes);
    packet.extend_from_slice(&[0, 0]);

    stream.write_all(&packet).await?;
    stream.flush().await?;

    Ok(())
}

async fn read_packet(stream: &mut TcpStream) -> anyhow::Result<RconPacket> {
    let mut size_bytes = [0u8; 4];
    stream.read_exact(&mut size_bytes).await?;

    let packet_size = i32::from_le_bytes(size_bytes);
    if !(10..=MAX_PACKET_SIZE).contains(&packet_size) {
        return Err(anyhow!("返回了无效的 RCON 数据包大小：{}", packet_size));
    }

    let mut payload = vec![0u8; packet_size as usize];
    stream.read_exact(&mut payload).await?;

    if payload.len() < 10 {
        return Err(anyhow!("RCON 数据包长度不足"));
    }

    if payload[payload.len() - 2] != 0 || payload[payload.len() - 1] != 0 {
        return Err(anyhow!("RCON 数据包结尾格式无效"));
    }

    let id = i32::from_le_bytes(
        payload[0..4]
            .try_into()
            .map_err(|_| anyhow!("RCON 数据包 ID 解析失败"))?,
    );
    let packet_type = i32::from_le_bytes(
        payload[4..8]
            .try_into()
            .map_err(|_| anyhow!("RCON 数据包类型解析失败"))?,
    );
    let body = String::from_utf8_lossy(&payload[8..payload.len() - 2]).to_string();

    Ok(RconPacket {
        id,
        packet_type,
        body,
    })
}
