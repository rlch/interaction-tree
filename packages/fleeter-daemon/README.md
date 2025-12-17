# Fleeter Daemon

Central daemon for Flutter session management. Manages sessions, Flutter processes, and AI agents.

## Installation

From the repository root:

```bash
bun install
bun run build
```

## Usage

### Start the daemon

```bash
# From repo root - foreground
bun run daemon:start

# Or directly
bun run --cwd packages/fleeter-daemon start
```

### Auto-start on macOS (launchd)

```bash
# Install as a launchd service (generates plist dynamically)
bun run daemon:install

# Check status
bun run daemon:status

# View logs
bun run daemon:logs

# Uninstall
bun run daemon:uninstall

# Reinstall (after updates)
bun run daemon:restart
```

### Auto-start on Linux (systemd)

```bash
# Create user service directory
mkdir -p ~/.config/systemd/user

# Create service file
cat > ~/.config/systemd/user/fleeter-daemon.service << EOF
[Unit]
Description=Fleeter Daemon
After=network.target

[Service]
ExecStart=$(which bun) run $(pwd)/packages/fleeter-daemon/dist/bin/daemon.js
Restart=always
Environment=FLEETER_PORT=9877

[Install]
WantedBy=default.target
EOF

# Enable and start
systemctl --user enable fleeter-daemon
systemctl --user start fleeter-daemon
```

## Configuration

Environment variables:
- `FLEETER_PORT` - WebSocket port (default: 9877)
- `FLEETER_HOST` - Host to bind (default: 127.0.0.1)
- `ANTHROPIC_API_KEY` - Required for AI agent mode

## WebSocket Protocol

See `DAEMON_DESIGN.md` for full protocol documentation.
