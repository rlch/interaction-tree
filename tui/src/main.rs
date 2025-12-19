mod address;
mod app;
pub mod chat;
mod commands;
mod event;
mod flutter_log;
mod markdown;
mod project;
mod session;
mod theme;
mod tree_format;
pub mod types;
mod ui;
mod ws;

use anyhow::Result;
use clap::{Parser, ValueEnum};
use std::path::PathBuf;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[derive(Debug, Clone, Copy, ValueEnum)]
enum ThemeArg {
    Auto,
    Dark,
    Light,
}

#[derive(Parser, Debug)]
#[command(name = "it-tui")]
#[command(about = "TUI client for interaction-tree-server monitoring")]
struct Args {
    /// WebSocket server URI
    #[arg(short, long, default_value = "ws://127.0.0.1:9877")]
    uri: String,

    /// Flutter project directory (defaults to current directory)
    #[arg(short, long)]
    project: Option<PathBuf>,

    /// Maximum events to keep in buffer
    #[arg(long, default_value = "1000")]
    max_events: usize,

    /// Color theme (auto-detected by default)
    #[arg(long, value_enum, default_value = "auto")]
    theme: ThemeArg,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Setup logging to ~/.fleeter/logs/ with daily rotation (TUI owns stdout)
    let logs_dir = dirs::home_dir()
        .map(|h| h.join(".fleeter").join("logs"))
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    std::fs::create_dir_all(&logs_dir)?;

    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("tui.log")
        .build(&logs_dir)
        .expect("failed to create log appender");

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("it_tui=debug,warn"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt::layer().with_writer(file_appender).with_ansi(false))
        .init();

    let args = Args::parse();

    // Validate Flutter project
    let project = project::ProjectInfo::from_path_or_cwd(args.project.as_deref())?;

    // Initialize theme based on CLI arg
    let theme_mode = match args.theme {
        ThemeArg::Auto => None,
        ThemeArg::Dark => Some(theme::ThemeMode::Dark),
        ThemeArg::Light => Some(theme::ThemeMode::Light),
    };
    theme::init_theme(theme_mode);

    let mut app = app::App::new(args.uri, args.max_events, project);
    event::run(&mut app).await
}
