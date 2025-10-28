# Terminal Persistence

Terminal sessions now survive browser refresh and network disconnections.

## Features

- **Session Recovery**: Browser refresh preserves terminal history
- **Process Continuity**: Running commands continue executing server-side
- **Auto-Reconnection**: WebSocket reconnects within 30 seconds
- **State Serialization**: Terminal buffer saved every 5 seconds
- **Orphan Cleanup**: Inactive sessions cleaned up after 24 hours

## Architecture

- `PTYSessionManager`: Session lifecycle management
- `PTYStateSerializer`: Terminal state capture/restore
- Storage: `~/.vibetrees/sessions/{session-id}/pty-state.json`

## Usage

No user action required - persistence is automatic.

Session ID stored in browser sessionStorage for reconnection.

## Limitations

- Large terminal buffers (>10k lines) may cause slow restoration
- WebSocket disconnect >30s requires manual reconnect
- Sessions killed after 24 hours of inactivity
