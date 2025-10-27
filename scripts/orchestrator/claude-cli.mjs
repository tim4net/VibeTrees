import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export class ClaudeCLI {
  constructor(workingDir) {
    this.workingDir = workingDir;
    this.timeout = 600000; // 10 minutes default
  }

  async execute({ prompt, model, useContinuation = false, timeout = null }) {
    const cmd = this.buildCommand({ prompt, model, useContinuation });

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: this.workingDir,
        timeout: timeout || this.timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      const output = stdout + stderr;
      const sessionId = this.extractSessionId(output);

      return {
        success: true,
        output,
        sessionId,
        stderr
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        output: error.stdout || '',
        stderr: error.stderr || ''
      };
    }
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
      const result = await this.execute({
        prompt: 'Respond with: Claude CLI is working',
        model: 'claude-sonnet-4.5'
      });
      return result.success;
    } catch {
      return false;
    }
  }
}
