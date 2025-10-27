# VibeTrees Orchestrator

Semi-attended autonomous development system.

## Usage

```bash
# Start orchestration
npm start

# View monitoring dashboard
npm run dashboard
```

## Architecture

- **State Manager**: SQLite-based persistence
- **CLI Wrapper**: Correct Claude Code syntax
- **Task Executor**: Retry logic, error handling
- **Monitor Dashboard**: Real-time progress tracking
- **Human Checkpoints**: Review between phases
