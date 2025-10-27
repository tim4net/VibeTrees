#!/usr/bin/env node

import { StateManager } from './state-manager.mjs';
import { ClaudeCLI } from './claude-cli.mjs';
import { TaskExecutor } from './task-executor.mjs';
import { getAllPhases } from './phases/index.mjs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';

export class Orchestrator {
  constructor({ workingDir, model, dbPath = '.orchestrator-state/state.db', dashboardPort = 3334, enableDashboard = true, skipApprovals = false }) {
    this.config = {
      workingDir,
      model,
      dbPath,
      dashboardPort,
      enableDashboard,
      skipApprovals
    };

    // Ensure state directory exists
    const stateDir = path.dirname(dbPath);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    this.stateManager = new StateManager(dbPath);
    this.cli = new ClaudeCLI(workingDir);
    this.executor = new TaskExecutor(this.stateManager, this.cli);
    this.dashboard = null;
    this.currentSessionId = null;
  }

  createSession({ startPhase = 1 }) {
    this.currentSessionId = this.stateManager.createSession({
      model: this.config.model,
      startPhase
    });
    return this.currentSessionId;
  }

  getSessionSummary(sessionId) {
    return this.stateManager.getSessionSummary(sessionId);
  }

  async start({ startPhase = 1 }) {
    console.log(chalk.bold.green('\n🌳 VibeTrees Semi-Attended Orchestrator\n'));

    // Start dashboard (if enabled)
    if (this.config.enableDashboard) {
      try {
        const { DashboardServer } = await import('./dashboard/server.mjs');
        this.dashboard = new DashboardServer(this.config.dashboardPort, this.config.dbPath);
        this.dashboard.start();
      } catch (error) {
        console.log(chalk.yellow('⚠ Dashboard not available (optional feature)'));
      }
    }

    // Test CLI connection
    console.log(chalk.cyan('Testing Claude CLI connection...'));
    const cliWorks = await this.cli.testConnection();
    if (!cliWorks) {
      console.log(chalk.red('✗ Claude CLI not available or not responding.'));
      console.log(chalk.yellow('  Install with: npm install -g @anthropic-ai/claude-cli'));
      console.log(chalk.yellow('  Or check your API key configuration.'));
      process.exit(1);
    }
    console.log(chalk.green('✓ Claude CLI connected\n'));

    // Create or resume session
    if (!this.currentSessionId) {
      this.currentSessionId = this.createSession({ startPhase });
    }

    // Execute phases
    const phases = getAllPhases();
    let sessionId = null;

    for (let i = startPhase - 1; i < phases.length; i++) {
      const phase = phases[i];

      console.log(chalk.bold.magenta(`\n${'='.repeat(60)}`));
      console.log(chalk.bold.magenta(`Starting Phase ${phase.number}: ${phase.name}`));
      console.log(chalk.bold.magenta(`Estimated: ${phase.estimatedDays}`));
      console.log(chalk.bold.magenta(`${'='.repeat(60)}\n`));

      const phaseId = this.stateManager.startPhase(
        this.currentSessionId,
        phase.number,
        phase.name
      );

      this.dashboard?.broadcast?.('phase_started', { phaseId, phase });

      const result = await this.executor.executePhase(phaseId, phase.tasks, {
        model: this.config.model,
        sessionId
      });

      if (result.success) {
        sessionId = result.sessionId;

        // Checkpoint - require human approval
        if (phase.checkpoint) {
          const checkpointId = this.stateManager.createCheckpoint(
            this.currentSessionId,
            phaseId,
            'phase_complete',
            phase.checkpoint.message,
            phase.checkpoint.requiresApproval
          );

          this.dashboard?.broadcast?.('checkpoint_created', { checkpointId, checkpoint: phase.checkpoint });

          if (phase.checkpoint.requiresApproval && !this.config.skipApprovals) {
            const approved = await this.waitForApproval(checkpointId, phase.checkpoint.message);

            if (!approved) {
              console.log(chalk.yellow('\n⏸  Orchestration paused by user.\n'));
              this.stateManager.db.prepare(
                "UPDATE sessions SET status = 'paused' WHERE id = ?"
              ).run(this.currentSessionId);
              return;
            }
          } else if (this.config.skipApprovals) {
            console.log(chalk.yellow('\n⚠️  Checkpoint skipped (--no-approval mode)\n'));
            this.stateManager.approveCheckpoint(checkpointId);
          }
        }
      } else {
        console.log(chalk.red.bold(`\n✗ Phase ${phase.number} failed!\n`));
        console.log(chalk.red(`Failed at task: ${result.failedTask}`));

        this.stateManager.db.prepare(
          "UPDATE sessions SET status = 'failed' WHERE id = ?"
        ).run(this.currentSessionId);

        this.dashboard?.broadcast?.('phase_failed', { phaseId, result });

        // Ask user if they want to retry or abort
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { name: 'Retry this phase', value: 'retry' },
              { name: 'Skip to next phase', value: 'skip' },
              { name: 'Abort orchestration', value: 'abort' }
            ]
          }
        ]);

        if (action === 'retry') {
          i--; // Retry current phase
          continue;
        } else if (action === 'abort') {
          console.log(chalk.yellow('\n⏸  Orchestration aborted by user.\n'));
          return;
        }
        // else skip to next phase
      }
    }

    // All phases complete!
    console.log(chalk.bold.green('\n🎉 All phases completed successfully!\n'));
    console.log(chalk.green('VibeTrees is ready for release.\n'));

    this.stateManager.db.prepare(
      "UPDATE sessions SET status = 'completed' WHERE id = ?"
    ).run(this.currentSessionId);

    this.dashboard?.broadcast?.('orchestration_complete', { sessionId: this.currentSessionId });
  }

  async waitForApproval(checkpointId, message) {
    console.log(chalk.bold.yellow('\n' + '─'.repeat(60)));
    console.log(chalk.bold.yellow('HUMAN CHECKPOINT REQUIRED'));
    console.log(chalk.bold.yellow('─'.repeat(60) + '\n'));
    console.log(message);

    if (this.config.enableDashboard) {
      console.log(chalk.dim('\nView details: http://localhost:' + this.config.dashboardPort));
    }

    const { approved } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'approved',
        message: 'Approve and continue to next phase?',
        default: true
      }
    ]);

    if (approved) {
      this.stateManager.approveCheckpoint(checkpointId);
    }

    return approved;
  }

  cleanup() {
    this.dashboard?.close?.();
    this.stateManager.close();
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  const config = {
    workingDir: process.cwd(),
    model: 'sonnet', // Use model alias
    dbPath: '.orchestrator-state/state.db',
    dashboardPort: 3334,
    enableDashboard: true,
    startPhase: 1,
    skipApprovals: false
  };

  // Parse CLI args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      config.model = args[i + 1];
      i++;
    } else if (args[i] === '--phase' && args[i + 1]) {
      config.startPhase = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--no-dashboard') {
      config.enableDashboard = false;
    } else if (args[i] === '--no-approval') {
      config.skipApprovals = true;
    }
  }

  const orchestrator = new Orchestrator(config);

  orchestrator.start({ startPhase: config.startPhase }).catch(error => {
    console.error(chalk.red('\n✗ Fatal error:'), error);
    orchestrator.cleanup();
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\nShutting down gracefully...'));
    orchestrator.cleanup();
    process.exit(0);
  });
}
