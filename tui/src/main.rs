mod app;
mod commands;
mod event;
mod theme;
mod ui;
mod ws;

use anyhow::Result;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "it-tui")]
#[command(about = "TUI client for interaction-tree-server monitoring")]
struct Args {
    /// WebSocket server URI
    #[arg(short, long, default_value = "ws://127.0.0.1:9000")]
    uri: String,

    /// Maximum events to keep in buffer
    #[arg(long, default_value = "1000")]
    max_events: usize,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    let mut app = app::App::new(args.uri, args.max_events);
    event::run(&mut app).await
}
