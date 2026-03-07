#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kzguard_backend::run().await
}
