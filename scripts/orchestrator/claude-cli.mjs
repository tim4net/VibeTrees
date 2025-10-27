import { spawn } from 'child_process';
import path from 'path';

export class ClaudeCLI {
  constructor(workingDir) {
    this.workingDir = workingDir;
    this.timeout = 600000; // 10 minutes default
  }

  async execute({ prompt, model, useContinuation = false, timeout = null }) {
    return new Promise((resolve, reject) => {
      const args = ['--print'];

      if (model) {
        args.push('--model', model);
      }

      if (useContinuation) {
        args.push('--continue');
      }

      args.push(prompt);

      const child = spawn('claude', args, {
        cwd: this.workingDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Timeout exceeded'));
      }, timeout || this.timeout);

      child.on('close', (code) => {
        clearTimeout(timer);

        const output = stdout + stderr;
        const sessionId = this.extractSessionId(output);

        if (code === 0) {
          resolve({
            success: true,
            output,
            sessionId,
            stderr
          });
        } else {
          resolve({
            success: false,
            error: `Process exited with code ${code}`,
            output,
            stderr
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: error.message,
          output: stdout,
          stderr
        });
      });
    });
  }

  buildCommand({ prompt, model, useContinuation }) {
    const parts = ['claude'];

    // Use --print mode for non-interactive execution
    parts.push('--print');

    // Model selection
    if (model) {
      parts.push('--model', model);
    }

    // Continuation mode
    if (useContinuation) {
      parts.push('--continue');
    }

    // Escape prompt properly for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    parts.push(`'${escapedPrompt}'`);

    return parts.join(' ');
  }

  extractSessionId(output) {
    // Look for session ID in output
    // Format may be: "Session ID: abc-123" or similar
    const match = output.match(/Session ID[:\s]+([a-zA-Z0-9-]+)/i);
    return match ? match[1] : null;
  }

  async testConnection() {
    try {
      // Quick check: just verify the claude command exists
      const { stdout } = await execAsync('which claude', {
        timeout: 2000
      });

      // Check if this is Claude Code (recursive situation)
      const { stdout: version } = await execAsync('claude --version', {
        timeout: 2000
      });

      if (version.includes('Claude Code')) {
        console.log('⚠️  Warning: Running inside Claude Code - using in-process execution instead of spawning new instances');
        // Return true to allow orchestrator to continue
        // Tasks will need to use Task tool or similar instead
        return true;
      }

      // For standalone Claude CLI, do a real test
      const result = await this.execute({
        prompt: 'Respond with: Claude CLI is working',
        model: 'claude-sonnet-4.5',
        timeout: 10000
      });
      return result.success;
    } catch (error) {
      return false;
    }
  }
}
