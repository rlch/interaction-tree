#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TuiCommand {
    Quit,
    Reload,
    Restart,
    Run {
        project: Option<String>,
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
            let (project, device) = parse_run_args(args);
            TuiCommand::Run { project, device }
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
        "" => TuiCommand::Unknown(String::new()),
        other => TuiCommand::Unknown(other.to_string()),
    }
}

fn parse_run_args(args: Option<&str>) -> (Option<String>, Option<String>) {
    let Some(args) = args else {
        return (None, None);
    };

    let mut project = None;
    let mut device = None;

    for part in args.split_whitespace() {
        if let Some(p) = part.strip_prefix("--project=") {
            project = Some(p.to_string());
        } else if let Some(p) = part.strip_prefix("-p=") {
            project = Some(p.to_string());
        } else if let Some(d) = part.strip_prefix("--device=") {
            device = Some(d.to_string());
        } else if let Some(d) = part.strip_prefix("-d=") {
            device = Some(d.to_string());
        } else if project.is_none() {
            project = Some(part.to_string());
        }
    }

    (project, device)
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
        assert_eq!(
            parse_command("run"),
            TuiCommand::Run {
                project: None,
                device: None
            }
        );
    }

    #[test]
    fn test_parse_run_with_project() {
        assert_eq!(
            parse_command("run /path/to/project"),
            TuiCommand::Run {
                project: Some("/path/to/project".to_string()),
                device: None
            }
        );
    }

    #[test]
    fn test_parse_run_with_flags() {
        assert_eq!(
            parse_command("run --project=/path --device=chrome"),
            TuiCommand::Run {
                project: Some("/path".to_string()),
                device: Some("chrome".to_string())
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
