import chalk from 'chalk';
import ora from 'ora';

export class TaskExecutor {
  constructor(stateManager, claudeCLI, options = {}) {
    this.stateManager = stateManager;
    this.cli = claudeCLI;
    this.defaultMaxRetries = 3;
    this.retryDelayMs = options.retryDelayMs ?? 5000; // 5 seconds between retries (configurable for testing)
  }

  async executeTask(taskId, { prompt, model, sessionId = null, maxRetries = null }) {
    const maxAttempts = (maxRetries ?? this.defaultMaxRetries) + 1;
    const task = this.stateManager.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    this.stateManager.startTask(taskId, sessionId);

    let lastError = null;
    let currentSessionId = sessionId;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        console.log(chalk.yellow(`  ↻ Retry ${attempt}/${maxRetries}...`));
        await this.sleep(this.retryDelayMs);
      }

      const spinner = ora({
        text: attempt === 0
          ? `Executing: ${task.description}`
          : `Retrying: ${task.description}`,
        color: 'cyan'
      }).start();

      try {
        const result = await this.cli.execute({
          prompt,
          model,
          useContinuation: !!currentSessionId
        });

        if (result.success) {
          spinner.succeed(chalk.green(`✓ ${task.description}`));

          // Update session ID for next task
          if (result.sessionId) {
            currentSessionId = result.sessionId;
          }

          this.stateManager.completeTask(taskId);

          return {
            success: true,
            output: result.output,
            sessionId: currentSessionId,
            attempts: attempt + 1
          };
        } else {
          lastError = result.error || result.stderr || 'Unknown error';
          spinner.fail(chalk.red(`✗ ${task.description}: ${lastError}`));
          this.stateManager.incrementRetry(taskId);
        }
      } catch (error) {
        lastError = error.message;
        spinner.fail(chalk.red(`✗ ${task.description}: ${lastError}`));
        this.stateManager.incrementRetry(taskId);
      }
    }

    // All retries exhausted
    this.stateManager.completeTask(taskId, lastError);

    return {
      success: false,
      error: lastError,
      attempts: maxAttempts
    };
  }

  async executePhase(phaseId, tasks, { model, sessionId = null }) {
    const phase = this.stateManager.db.prepare('SELECT * FROM phases WHERE id = ?').get(phaseId);
    console.log(chalk.bold.blue(`\n=== Phase ${phase.phase_number}: ${phase.name} ===\n`));

    let currentSessionId = sessionId;
    const results = [];

    for (const taskConfig of tasks) {
      const taskId = this.stateManager.createTask(
        phaseId,
        taskConfig.taskNumber,
        taskConfig.description
      );

      const result = await this.executeTask(taskId, {
        prompt: taskConfig.prompt,
        model,
        sessionId: currentSessionId,
        maxRetries: taskConfig.maxRetries
      });

      results.push({ taskId, ...result });

      if (result.success) {
        currentSessionId = result.sessionId;
      } else {
        // Task failed after all retries
        console.log(chalk.red.bold(`\n✗ Phase ${phase.phase_number} failed at task ${taskConfig.taskNumber}\n`));
        this.stateManager.completePhase(phaseId, result.error);
        return {
          success: false,
          failedTask: taskConfig.taskNumber,
          results
        };
      }

      // Optional: Run tests after each task
      if (taskConfig.runTestsAfter) {
        const testResult = await this.runTests();
        if (!testResult.success) {
          console.log(chalk.red.bold(`\n✗ Tests failed after task ${taskConfig.taskNumber}\n`));
          this.stateManager.completePhase(phaseId, 'Tests failed');
          return {
            success: false,
            failedTask: taskConfig.taskNumber,
            testsFailed: true,
            results
          };
        }
      }
    }

    this.stateManager.completePhase(phaseId);
    console.log(chalk.green.bold(`\n✓ Phase ${phase.phase_number} completed successfully\n`));

    return {
      success: true,
      results,
      sessionId: currentSessionId
    };
  }

  async runTests() {
    const spinner = ora('Running test suite...').start();

    try {
      const { execSync } = await import('child_process');
      const output = execSync('npm test', {
        cwd: this.cli.workingDir,
        encoding: 'utf8'
      });

      spinner.succeed(chalk.green('✓ Tests passed'));
      return { success: true, output };
    } catch (error) {
      spinner.fail(chalk.red('✗ Tests failed'));
      return { success: false, error: error.message, output: error.stdout };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
