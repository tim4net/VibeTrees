#!/bin/bash

################################################################################
# VibeTrees Agent Builder
#
# Orchestrates AI agents via Zen MCP to implement the full VibeTrees project
# according to the 8-phase plan in PLANNING-SUMMARY-V2.md
#
# Usage: ./build-with-agents.sh [--phase N] [--resume] [--model MODEL]
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$PROJECT_DIR/.agent-builder-state.json"
LOG_DIR="$PROJECT_DIR/.agent-logs"
DEFAULT_MODEL="gpt-5"
CONTINUATION_FILE="$PROJECT_DIR/.agent-continuation.txt"

# Command line args
START_PHASE=1
RESUME=false
MODEL="$DEFAULT_MODEL"

################################################################################
# Helper Functions
################################################################################

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

success() {
    echo -e "${GREEN}✓${NC} $*"
}

error() {
    echo -e "${RED}✗${NC} $*" >&2
}

warn() {
    echo -e "${YELLOW}⚠${NC} $*"
}

# Save state
save_state() {
    local phase=$1
    local status=$2
    local continuation_id=$3
    cat > "$STATE_FILE" <<EOF
{
  "current_phase": $phase,
  "status": "$status",
  "continuation_id": "$continuation_id",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "model": "$MODEL"
}
EOF
}

# Load state
load_state() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE"
    else
        echo '{"current_phase": 1, "status": "not_started"}'
    fi
}

# Get continuation ID
get_continuation_id() {
    if [[ -f "$CONTINUATION_FILE" ]]; then
        cat "$CONTINUATION_FILE"
    fi
}

# Save continuation ID
save_continuation_id() {
    echo "$1" > "$CONTINUATION_FILE"
}

# Run tests
run_tests() {
    log "Running test suite..."
    if npm test 2>&1 | tee "$LOG_DIR/test-$(date +%s).log"; then
        success "Tests passed"
        return 0
    else
        error "Tests failed"
        return 1
    fi
}

# Commit changes
commit_phase() {
    local phase=$1
    local message=$2

    log "Committing Phase $phase..."
    git add -A
    git commit -m "$message

🤖 Generated with Claude Code + Zen MCP
Phase $phase: Auto-implemented by AI agents

Co-Authored-By: Claude <noreply@anthropic.com>" || {
        warn "Nothing to commit or commit failed"
    }
}

# Push to GitHub
push_changes() {
    log "Pushing to GitHub..."
    git push || {
        warn "Push failed, will retry later"
    }
}

################################################################################
# Agent Orchestration Functions
################################################################################

# Use Zen MCP planner to create detailed phase plan
create_phase_plan() {
    local phase=$1
    local phase_name=$2
    local continuation_id=$(get_continuation_id)

    log "Creating detailed plan for Phase $phase: $phase_name..."

    # Call claude with zen planner
    local prompt="Review PLANNING-SUMMARY-V2.md and create a detailed, step-by-step implementation plan for Phase $phase: $phase_name.

Break it down into specific, actionable tasks with:
- Exact files to create/modify
- Specific code changes needed
- Tests to write
- Validation steps

Current codebase state: $(git log -1 --oneline)

Make the plan concrete enough that another agent can execute it."

    local continuation_arg=""
    if [[ -n "$continuation_id" ]]; then
        continuation_arg="--continuation-id $continuation_id"
    fi

    claude --mcp zen planner \
        --model "$MODEL" \
        --prompt "$prompt" \
        --files "$PROJECT_DIR/PLANNING-SUMMARY-V2.md" "$PROJECT_DIR/CLAUDE.md" \
        $continuation_arg \
        --output "$LOG_DIR/phase-${phase}-plan.md" || return 1

    success "Phase $phase plan created"
}

# Use Zen MCP chat to implement a specific task
implement_task() {
    local phase=$1
    local task_num=$2
    local task_description=$3
    local continuation_id=$(get_continuation_id)

    log "Implementing Phase $phase, Task $task_num: $task_description"

    local prompt="Implement the following task for VibeTrees Phase $phase:

Task: $task_description

Requirements:
- Follow TDD: write tests first, then implementation
- Use existing code style from CLAUDE.md
- Update relevant documentation
- Ensure all tests pass

Current working directory: $PROJECT_DIR
Previous work: $(git log -1 --oneline)"

    local continuation_arg=""
    if [[ -n "$continuation_id" ]]; then
        continuation_arg="--continuation-id $continuation_id"
    fi

    # Use chat for implementation
    local result=$(claude --mcp zen chat \
        --model "$MODEL" \
        --prompt "$prompt" \
        --working-dir "$PROJECT_DIR" \
        $continuation_arg 2>&1 | tee "$LOG_DIR/phase-${phase}-task-${task_num}.log")

    # Extract and save continuation ID if present
    local new_continuation_id=$(echo "$result" | grep -o '"continuation_id":"[^"]*"' | cut -d'"' -f4)
    if [[ -n "$new_continuation_id" ]]; then
        save_continuation_id "$new_continuation_id"
    fi

    # Run tests after implementation
    if ! run_tests; then
        warn "Tests failed after implementing task $task_num"
        return 1
    fi

    success "Task $task_num completed"
}

# Use Zen MCP debug when tests fail
debug_failures() {
    local phase=$1
    local continuation_id=$(get_continuation_id)

    error "Debugging test failures..."

    local test_output=$(npm test 2>&1 || true)

    local prompt="Tests are failing in VibeTrees Phase $phase. Debug and fix the issues.

Test output:
$test_output

Analyze the failures, identify root causes, and implement fixes.
Run tests after each fix to verify."

    local continuation_arg=""
    if [[ -n "$continuation_id" ]]; then
        continuation_arg="--continuation-id $continuation_id"
    fi

    claude --mcp zen debug \
        --model "$MODEL" \
        --prompt "$prompt" \
        --working-dir "$PROJECT_DIR" \
        $continuation_arg \
        --output "$LOG_DIR/phase-${phase}-debug.log" || return 1

    # Verify tests now pass
    if run_tests; then
        success "Debugging successful, tests now pass"
        return 0
    else
        error "Tests still failing after debug attempt"
        return 1
    fi
}

# Use Zen MCP codereview to validate phase completion
review_phase() {
    local phase=$1
    local phase_name=$2

    log "Running code review for Phase $phase: $phase_name..."

    local prompt="Review the implementation of Phase $phase: $phase_name for VibeTrees.

Check:
- All requirements from PLANNING-SUMMARY-V2.md are met
- Code quality and test coverage
- Documentation is updated
- No regressions introduced

Provide detailed feedback and identify any gaps."

    claude --mcp zen codereview \
        --model "$MODEL" \
        --prompt "$prompt" \
        --working-dir "$PROJECT_DIR" \
        --files "$PROJECT_DIR/PLANNING-SUMMARY-V2.md" \
        --output "$LOG_DIR/phase-${phase}-review.md" || return 1

    success "Code review completed"
}

################################################################################
# Phase Implementation Functions
################################################################################

phase_1_cleanup() {
    log "=== Phase 1: Cleanup & Setup ==="

    # Create plan
    create_phase_plan 1 "Cleanup & Setup" || return 1

    # Task 1: Remove tmux CLI interface
    implement_task 1 1 "Remove scripts/worktree-manager.mjs and all tmux-related code" || return 1

    # Task 2: Add --listen parameter
    implement_task 1 2 "Add --listen parameter to web server for network binding control" || return 1

    # Task 3: Create first-run wizard
    implement_task 1 3 "Create first-run wizard with Docker/git detection and test worktree" || return 1

    # Review
    review_phase 1 "Cleanup & Setup" || return 1

    # Commit
    commit_phase 1 "Phase 1 Complete: Cleanup & Setup

- Removed tmux CLI interface
- Added --listen parameter for bind address control
- Created first-run wizard with environment checks"

    success "Phase 1 completed!"
}

phase_2_codebase_agnostic() {
    log "=== Phase 2: Make Codebase-Agnostic ==="

    # This is the longest phase (29-31 days), break into sub-phases

    # 2.1: Container Runtime Abstraction
    log "Phase 2.1: Container Runtime Abstraction..."
    create_phase_plan 2.1 "Container Runtime" || return 1
    implement_task 2 1 "Create ContainerRuntime abstraction for Docker/Podman" || return 1
    implement_task 2 2 "Add port registry file locking" || return 1
    implement_task 2 3 "Add single instance lock (.vibe/server.lock)" || return 1

    # 2.2: Dynamic Service Discovery
    log "Phase 2.2: Dynamic Service Discovery..."
    implement_task 2 4 "Implement dynamic service discovery using docker compose config" || return 1
    implement_task 2 5 "Add COMPOSE_PROJECT_NAME with repo hash" || return 1

    # 2.3: Configuration System
    log "Phase 2.3: Configuration System..."
    implement_task 2 6 "Create .vibe/config.json structure" || return 1
    implement_task 2 7 "Store repoRoot in config (not process.cwd())" || return 1
    implement_task 2 8 "Add config schema validation and migrations" || return 1

    # 2.4: Data Import/Export
    log "Phase 2.4: Data Import/Export..."
    implement_task 2 9 "Add disk space pre-flight checks" || return 1
    implement_task 2 10 "Add dry-run mode for destructive operations" || return 1
    implement_task 2 11 "Create confirmation modals" || return 1

    # 2.5: Worktree Management
    log "Phase 2.5: Worktree Management..."
    implement_task 2 12 "Implement import existing worktrees" || return 1
    implement_task 2 13 "Create diagnostic mode (vibe diagnose)" || return 1

    # 2.6: Terminal Persistence (MAJOR - use planner for each sub-phase)
    log "Phase 2.6: Terminal Persistence..."
    for subtask in {1..8}; do
        local subtask_name=$(sed -n "/2.6.$subtask:/p" TERMINAL-UX.md | head -1)
        implement_task 2 "6.$subtask" "Terminal UX: $subtask_name (see TERMINAL-UX.md)" || return 1
    done

    # 2.7 & 2.8: Branch features
    implement_task 2 14 "Implement branch selector UI" || return 1
    implement_task 2 15 "Implement branch cleanup on delete" || return 1

    # Review entire Phase 2
    review_phase 2 "Codebase-Agnostic + Terminal UX" || return 1

    commit_phase 2 "Phase 2 Complete: Codebase-Agnostic + Terminal UX

- Container runtime abstraction (Docker + Podman)
- Dynamic service discovery
- Configuration system with repoRoot
- Terminal persistence with session recovery
- Branch selector and cleanup
- Diagnostic mode"

    success "Phase 2 completed!"
}

phase_3_mcp() {
    log "=== Phase 3: MCP Integration ==="

    create_phase_plan 3 "MCP Integration" || return 1

    implement_task 3 1 "Implement MCP auto-discovery" || return 1
    implement_task 3 2 "Use npx -y for MCP servers (latest)" || return 1
    implement_task 3 3 "Create cross-worktree MCP bridge" || return 1
    implement_task 3 4 "Create minimal CLI (list, create, delete, start, stop)" || return 1

    review_phase 3 "MCP Integration" || return 1

    commit_phase 3 "Phase 3 Complete: MCP Integration + CLI

- MCP auto-discovery and npx execution
- Cross-worktree MCP bridge
- Minimal CLI for automation"

    success "Phase 3 completed!"
}

phase_4_multi_agent() {
    log "=== Phase 4: Multi-Agent Support ==="

    create_phase_plan 4 "Multi-Agent" || return 1

    implement_task 4 1 "Create agent abstraction (Claude, Codex, Gemini, custom)" || return 1
    implement_task 4 2 "Build agent selection UI" || return 1
    implement_task 4 3 "Integrate agents with terminal system" || return 1

    review_phase 4 "Multi-Agent Support" || return 1

    commit_phase 4 "Phase 4 Complete: Multi-Agent Support

- Agent abstraction layer
- Support for Claude, Codex, Gemini
- Agent selection UI"

    success "Phase 4 completed!"
}

phase_5_automatic_updates() {
    log "=== Phase 5: Automatic Updates ==="

    create_phase_plan 5 "Automatic Updates" || return 1

    implement_task 5 1 "Implement sync with main branch" || return 1
    implement_task 5 2 "Add smart reload (detect changes)" || return 1
    implement_task 5 3 "Create comprehensive undo/rollback system" || return 1
    implement_task 5 4 "Build snapshot management UI" || return 1
    implement_task 5 5 "Implement conflict resolution UI with AI assist" || return 1

    review_phase 5 "Automatic Updates" || return 1

    commit_phase 5 "Phase 5 Complete: Automatic Updates

- Sync with main branch
- Smart reload with change detection
- Comprehensive undo/rollback
- Snapshot management UI
- AI-assisted conflict resolution"

    success "Phase 5 completed!"
}

phase_6_testing() {
    log "=== Phase 6: Testing & Documentation ==="

    create_phase_plan 6 "Testing & Documentation" || return 1

    implement_task 6 1 "Add WebSocket schema validation (zod)" || return 1
    implement_task 6 2 "Expand test suite to 80%+ coverage" || return 1
    implement_task 6 3 "Set up CI matrix (Docker on Linux/macOS, Podman on Linux)" || return 1
    implement_task 6 4 "Add ESLint + Prettier configuration" || return 1
    implement_task 6 5 "Implement graceful shutdown handlers" || return 1
    implement_task 6 6 "Create VS Code integration" || return 1
    implement_task 6 7 "Add config export/import for team sharing" || return 1
    implement_task 6 8 "Write comprehensive user documentation" || return 1

    review_phase 6 "Testing & Documentation" || return 1

    commit_phase 6 "Phase 6 Complete: Testing & Documentation

- 80%+ test coverage achieved
- WebSocket schema validation
- CI matrix with Docker + Podman
- ESLint + Prettier
- VS Code integration
- Comprehensive documentation"

    success "Phase 6 completed!"
}

phase_7_polish() {
    log "=== Phase 7: Polish & Release ==="

    create_phase_plan 7 "Polish & Release" || return 1

    implement_task 7 1 "Optimize performance and add log backpressure" || return 1
    implement_task 7 2 "Create resource usage dashboard" || return 1
    implement_task 7 3 "Build audit log viewer UI" || return 1
    implement_task 7 4 "Add notification system" || return 1
    implement_task 7 5 "Implement self-update mechanism" || return 1
    implement_task 7 6 "Create uninstall/cleanup tool" || return 1
    implement_task 7 7 "Add Prometheus metrics endpoint" || return 1

    # Final review
    review_phase 7 "Polish & Release" || return 1

    # Run comprehensive validation
    log "Running final validation..."
    run_tests || { error "Final tests failed!"; return 1; }

    commit_phase 7 "Phase 7 Complete: Polish & Release - v1.0 Ready!

- Performance optimizations
- Resource monitoring dashboard
- Audit log viewer
- Notification system
- Self-update mechanism
- Production-ready release"

    success "Phase 7 completed! VibeTrees v1.0 is ready! 🎉"
}

################################################################################
# Main Execution Loop
################################################################################

main() {
    log "VibeTrees Agent Builder Starting..."
    log "Model: $MODEL"

    # Create log directory
    mkdir -p "$LOG_DIR"

    # Check prerequisites
    if ! command -v claude &> /dev/null; then
        error "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-cli"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        error "npm not found. Install Node.js first."
        exit 1
    fi

    # Load or create state
    local state=$(load_state)
    local current_phase=$(echo "$state" | grep -o '"current_phase":[0-9]*' | cut -d: -f2)

    if [[ "$RESUME" == "true" ]]; then
        log "Resuming from Phase $current_phase..."
        START_PHASE=$current_phase
    fi

    # Install dependencies if needed
    if [[ ! -d "node_modules" ]]; then
        log "Installing dependencies..."
        npm install
    fi

    # Execute phases
    local phases=(
        "phase_1_cleanup"
        "phase_2_codebase_agnostic"
        "phase_3_mcp"
        "phase_4_multi_agent"
        "phase_5_automatic_updates"
        "phase_6_testing"
        "phase_7_polish"
    )

    for phase_num in $(seq $START_PHASE 7); do
        local phase_func="${phases[$((phase_num-1))]}"

        log "========================================="
        log "Starting Phase $phase_num"
        log "========================================="

        save_state "$phase_num" "in_progress" "$(get_continuation_id)"

        # Execute phase
        if $phase_func; then
            save_state "$phase_num" "completed" "$(get_continuation_id)"
            push_changes
        else
            error "Phase $phase_num failed!"
            save_state "$phase_num" "failed" "$(get_continuation_id)"

            # Attempt to debug
            warn "Attempting automated debugging..."
            if debug_failures "$phase_num"; then
                warn "Debug successful, retrying phase..."
                if $phase_func; then
                    save_state "$phase_num" "completed" "$(get_continuation_id)"
                    push_changes
                else
                    error "Phase $phase_num still failing after debug. Manual intervention needed."
                    exit 1
                fi
            else
                error "Automated debugging failed. Manual intervention needed."
                error "Resume with: ./build-with-agents.sh --resume"
                exit 1
            fi
        fi

        log "Phase $phase_num completed successfully!"
        log ""
    done

    # All phases complete!
    success "========================================="
    success "ALL PHASES COMPLETE! 🎉"
    success "========================================="
    success ""
    success "VibeTrees v1.0 is fully implemented and tested!"
    success "Repository: $(git remote get-url origin)"
    success "Total commits: $(git rev-list --count HEAD)"
    success ""
    success "Next steps:"
    success "  - Review the implementation"
    success "  - Test manually"
    success "  - Create release tag: git tag v1.0.0 && git push --tags"
    success "  - Publish to npm: npm publish"
}

################################################################################
# Parse Command Line Arguments
################################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --phase)
            START_PHASE="$2"
            shift 2
            ;;
        --resume)
            RESUME=true
            shift
            ;;
        --model)
            MODEL="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --phase N       Start from phase N (1-7)"
            echo "  --resume        Resume from last saved state"
            echo "  --model MODEL   Use specific model (default: gpt-5)"
            echo "  --help          Show this help"
            echo ""
            echo "Examples:"
            echo "  $0                    # Start from phase 1"
            echo "  $0 --phase 3          # Start from phase 3"
            echo "  $0 --resume           # Resume from failure"
            echo "  $0 --model gpt-5-pro  # Use gpt-5-pro model"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main
main

################################################################################
# End of Script
################################################################################
