# Terminal Persistence

Terminals survive browser refresh and reconnects. Your scrollback history stays intact.

## What's preserved

- Full scrollback (10,000 lines)
- Colors and ANSI formatting
- Running processes continue server-side

## How it works

```
PTY → node-pty → xterm-headless buffer → serialize to disk
                        ↓
                   WebSocket to browser
```

State saves every 5 seconds to `~/.vibetrees/sessions/{id}/pty-state.json`.

On reconnect, the server streams the saved buffer back to your terminal.

## Cleanup

Sessions inactive for over an hour are automatically cleaned up.
