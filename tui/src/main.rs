mod app;
mod commands;
mod event;
mod project;
mod theme;
mod ui;
mod ws;

use anyhow::Result;
use clap::{Parser, ValueEnum};
use std::path::PathBuf;

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
    #[arg(short, long, default_value = "ws://127.0.0.1:9000")]
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
