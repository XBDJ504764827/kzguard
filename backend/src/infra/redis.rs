use crate::{
    config::Config,
    error::AppResult,
};
use redis::Client;

pub(crate) async fn init_redis(config: &Config) -> AppResult<Client> {
    let client = Client::open(config.redis.url.as_str())?;
    let mut connection = client.get_multiplexed_async_connection().await?;
    redis::cmd("PING").query_async::<String>(&mut connection).await?;
    Ok(client)
}
