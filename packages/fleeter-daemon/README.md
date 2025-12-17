# Fleeter Daemon

Central daemon for Flutter session management. Manages sessions, Flutter processes, and AI agents.

## Installation

```bash
cd packages/fleeter-daemon
npm install
npm run build
```

## Usage

### Start the daemon

```bash
# Foreground
npx fleeter-daemon

# With custom port
npx fleeter-daemon --port 9877

# Or after global install
fleeter-daemon
```

### Auto-start on macOS

```bash
# Copy the launchd plist
cp service/com.fleeter.daemon.plist ~/Library/LaunchAgents/

# Edit paths in the plist to match your installation
# Then load it
launchctl load ~/Library/LaunchAgents/com.fleeter.daemon.plist
```

### Auto-start on Linux (systemd)

```bash
# Copy the service file
mkdir -p ~/.config/systemd/user
cp service/fleeter-daemon.service ~/.config/systemd/user/

# Edit paths in the service file
# Then enable and start
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
