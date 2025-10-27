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

      const child = spawn('npx', ['@anthropic-ai/claude-code', ...args], {
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
      // Test with a simple command - use longer timeout for npx first-run
      const result = await this.execute({
        prompt: 'Respond with just: OK',
        model: 'sonnet', // Use alias instead of version
        timeout: 30000 // 30 seconds for npx download
      });

      if (result.success) {
        return true;
      }

      // Log error for debugging
      console.error('Connection test failed:', result.error);
      console.error('Output:', result.output?.substring(0, 200));
      return false;
    } catch (error) {
      console.error('Connection test exception:', error.message);
      return false;
    }
  }
}
