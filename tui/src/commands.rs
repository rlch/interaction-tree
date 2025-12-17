#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TuiCommand {
    Quit,
    Reload,
    Restart,
    Run {
        device: Option<String>,
    },
    Stop,
    Status,
    Tree,
    Filter(Option<String>),
    Clear,
    Agent {
        intent: String,
        answer: Option<String>,
    },
    Help,
    // Session management
    CreateSession {
        name: String,
        project_path: String,
    },
    ListSessions,
    Connect {
        session: String,
    },
    DestroySession {
        session: String,
    },
    Unknown(String),
}

pub fn parse_command(input: &str) -> TuiCommand {
    let input = input.trim();
    let mut parts = input.splitn(2, char::is_whitespace);
    let cmd = parts.next().unwrap_or("");
    let args = parts.next().map(|s| s.trim());

    match cmd.to_lowercase().as_str() {
        "q" | "quit" | "exit" => TuiCommand::Quit,
        "r" | "reload" => TuiCommand::Reload,
        "R" | "restart" => TuiCommand::Restart,
        "run" => {
            let device = parse_run_args(args);
            TuiCommand::Run { device }
        }
        "stop" => TuiCommand::Stop,
        "status" => TuiCommand::Status,
        "tree" | "t" => TuiCommand::Tree,
        "filter" | "f" => TuiCommand::Filter(args.map(String::from)),
        "clear" | "c" => TuiCommand::Clear,
        "agent" | "a" => {
            if let Some(intent) = args {
                TuiCommand::Agent {
                    intent: intent.to_string(),
                    answer: None,
                }
            } else {
                TuiCommand::Unknown("agent requires an intent".to_string())
            }
        }
        "answer" => {
            if let Some(answer) = args {
                TuiCommand::Agent {
                    intent: String::new(),
                    answer: Some(answer.to_string()),
                }
            } else {
                TuiCommand::Unknown("answer requires text".to_string())
            }
        }
        "help" | "h" | "?" => TuiCommand::Help,
        // Session management
        "create" | "new" => {
            if let Some((name, path)) = parse_create_session_args(args) {
                TuiCommand::CreateSession {
                    name,
                    project_path: path,
                }
            } else {
                TuiCommand::Unknown("create <name> <project_path>".to_string())
            }
        }
        "sessions" | "ls" => TuiCommand::ListSessions,
        "connect" | "use" => {
            if let Some(session) = args {
                TuiCommand::Connect {
                    session: session.to_string(),
                }
            } else {
                TuiCommand::Unknown("connect <session_name>".to_string())
            }
        }
        "destroy" | "rm" => {
            if let Some(session) = args {
                TuiCommand::DestroySession {
                    session: session.to_string(),
                }
            } else {
                TuiCommand::Unknown("destroy <session_name>".to_string())
            }
        }
        "" => TuiCommand::Unknown(String::new()),
        other => TuiCommand::Unknown(other.to_string()),
    }
}

fn parse_run_args(args: Option<&str>) -> Option<String> {
    let Some(args) = args else {
        return None;
    };

    for part in args.split_whitespace() {
        if let Some(d) = part.strip_prefix("--device=") {
            return Some(d.to_string());
        } else if let Some(d) = part.strip_prefix("-d=") {
            return Some(d.to_string());
        }
    }

    // First arg is device if no flag
    args.split_whitespace().next().map(String::from)
}

fn parse_create_session_args(args: Option<&str>) -> Option<(String, String)> {
    let args = args?;
    let mut parts = args.splitn(2, char::is_whitespace);
    let name = parts.next()?.trim().to_string();
    let path = parts.next()?.trim().to_string();
    if name.is_empty() || path.is_empty() {
        return None;
    }
    Some((name, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_quit_commands() {
        assert_eq!(parse_command("q"), TuiCommand::Quit);
        assert_eq!(parse_command("quit"), TuiCommand::Quit);
        assert_eq!(parse_command("exit"), TuiCommand::Quit);
        assert_eq!(parse_command("QUIT"), TuiCommand::Quit);
    }

    #[test]
    fn test_parse_reload_restart() {
        assert_eq!(parse_command("r"), TuiCommand::Reload);
        assert_eq!(parse_command("reload"), TuiCommand::Reload);
        assert_eq!(parse_command("restart"), TuiCommand::Restart);
    }

    #[test]
    fn test_parse_run_no_args() {
        assert_eq!(parse_command("run"), TuiCommand::Run { device: None });
    }

    #[test]
    fn test_parse_run_with_device() {
        assert_eq!(
            parse_command("run chrome"),
            TuiCommand::Run {
                device: Some("chrome".to_string())
            }
        );
    }

    #[test]
    fn test_parse_run_with_device_flag() {
        assert_eq!(
            parse_command("run --device=macos"),
            TuiCommand::Run {
                device: Some("macos".to_string())
            }
        );
    }

    #[test]
    fn test_parse_create_session() {
        assert_eq!(
            parse_command("create my-app /path/to/flutter"),
            TuiCommand::CreateSession {
                name: "my-app".to_string(),
                project_path: "/path/to/flutter".to_string()
            }
        );
    }

    #[test]
    fn test_parse_connect() {
        assert_eq!(
            parse_command("connect my-app"),
            TuiCommand::Connect {
                session: "my-app".to_string()
            }
        );
        assert_eq!(
            parse_command("use admin"),
            TuiCommand::Connect {
                session: "admin".to_string()
            }
        );
    }

    #[test]
    fn test_parse_sessions() {
        assert_eq!(parse_command("sessions"), TuiCommand::ListSessions);
        assert_eq!(parse_command("ls"), TuiCommand::ListSessions);
    }

    #[test]
    fn test_parse_destroy() {
        assert_eq!(
            parse_command("destroy my-app"),
            TuiCommand::DestroySession {
                session: "my-app".to_string()
            }
        );
    }

    #[test]
    fn test_parse_filter() {
        assert_eq!(
            parse_command("filter flutter"),
            TuiCommand::Filter(Some("flutter".to_string()))
        );
        assert_eq!(parse_command("filter"), TuiCommand::Filter(None));
        assert_eq!(
            parse_command("f agent"),
            TuiCommand::Filter(Some("agent".to_string()))
        );
    }

    #[test]
    fn test_parse_agent() {
        assert_eq!(
            parse_command("agent tap the button"),
            TuiCommand::Agent {
                intent: "tap the button".to_string(),
                answer: None
            }
        );
    }

    #[test]
    fn test_parse_answer() {
        assert_eq!(
            parse_command("answer the red one"),
            TuiCommand::Agent {
                intent: String::new(),
                answer: Some("the red one".to_string())
            }
        );
    }

    #[test]
    fn test_parse_help() {
        assert_eq!(parse_command("help"), TuiCommand::Help);
        assert_eq!(parse_command("h"), TuiCommand::Help);
        assert_eq!(parse_command("?"), TuiCommand::Help);
    }

    #[test]
    fn test_parse_unknown() {
        assert_eq!(
            parse_command("foobar"),
            TuiCommand::Unknown("foobar".to_string())
        );
    }

    #[test]
    fn test_parse_empty() {
        assert_eq!(parse_command(""), TuiCommand::Unknown(String::new()));
        assert_eq!(parse_command("  "), TuiCommand::Unknown(String::new()));
    }
}
