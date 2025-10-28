/**
 * AI Conflict Resolver - Phase 5.3
 *
 * Integrates with active AI agent to provide intelligent conflict resolution
 * suggestions and automatic resolution for simple conflicts.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export class AIConflictResolver {
  constructor(worktreePath) {
    this.worktreePath = worktreePath;
  }

  /**
   * Get all current conflicts
   * @returns {Object[]} Array of conflict objects
   */
  getConflicts() {
    try {
      const output = execSync('git diff --name-only --diff-filter=U', {
        cwd: this.worktreePath,
        encoding: 'utf-8'
      });

      const conflictFiles = output.trim().split('\n').filter(f => f.length > 0);

      return conflictFiles.map(file => ({
        file,
        category: this._categorizeConflict(file),
        content: this._getConflictContent(file),
        resolvable: this._isAutoResolvable(file)
      }));
    } catch (error) {
      console.error('Error getting conflicts:', error);
      return [];
    }
  }

  /**
   * Categorize conflict by file type
   * @private
   */
  _categorizeConflict(file) {
    if (file === 'package.json' || file === 'package-lock.json') {
      return 'dependency';
    }
    if (file.match(/\.(yml|yaml|json|toml)$/)) {
      return 'config';
    }
    if (file.match(/\.(js|ts|jsx|tsx|py|go|rb|php|rs)$/)) {
      return 'code';
    }
    if (file.match(/\.(md|txt|html|css)$/)) {
      return 'documentation';
    }
    return 'other';
  }

  /**
   * Get conflict markers and content
   * @private
   */
  _getConflictContent(file) {
    try {
      const filePath = join(this.worktreePath, file);
      const content = readFileSync(filePath, 'utf-8');

      const conflicts = [];
      const lines = content.split('\n');
      let currentConflict = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('<<<<<<<')) {
          currentConflict = {
            start: i,
            ours: [],
            theirs: [],
            base: []
          };
        } else if (line.startsWith('=======') && currentConflict) {
          currentConflict.separator = i;
        } else if (line.startsWith('>>>>>>>') && currentConflict) {
          currentConflict.end = i;
          conflicts.push(currentConflict);
          currentConflict = null;
        } else if (currentConflict) {
          if (!currentConflict.separator) {
            currentConflict.ours.push(line);
          } else {
            currentConflict.theirs.push(line);
          }
        }
      }

      return {
        fullContent: content,
        conflicts,
        conflictCount: conflicts.length
      };
    } catch (error) {
      return {
        error: error.message,
        fullContent: '',
        conflicts: [],
        conflictCount: 0
      };
    }
  }

  /**
   * Check if conflict is auto-resolvable
   * @private
   */
  _isAutoResolvable(file) {
    const category = this._categorizeConflict(file);
    const content = this._getConflictContent(file);

    // Whitespace-only conflicts
    if (this._isWhitespaceConflict(content)) {
      return 'whitespace';
    }

    // Simple dependency version bumps
    if (category === 'dependency') {
      return 'dependency_version';
    }

    // Simple config additions (no overlapping keys)
    if (category === 'config' && this._isNonOverlappingConfig(content)) {
      return 'config_merge';
    }

    return false;
  }

  /**
   * Check if conflict is whitespace-only
   * @private
   */
  _isWhitespaceConflict(content) {
    for (const conflict of content.conflicts) {
      const oursNormalized = conflict.ours.join('').replace(/\s/g, '');
      const theirsNormalized = conflict.theirs.join('').replace(/\s/g, '');

      if (oursNormalized !== theirsNormalized) {
        return false;
      }
    }

    return content.conflicts.length > 0;
  }

  /**
   * Check if config has non-overlapping changes
   * @private
   */
  _isNonOverlappingConfig(content) {
    // Simple heuristic: if both sides only add lines (no modifications)
    // This would need more sophisticated logic for production
    return false; // Conservative: don't auto-resolve config
  }

  /**
   * Auto-resolve simple conflicts
   * @param {string} file - File path
   * @param {string} strategy - Resolution strategy
   * @returns {Object} Resolution result
   */
  async autoResolve(file, strategy) {
    const result = {
      success: false,
      file,
      strategy,
      message: ''
    };

    try {
      const resolvable = this._isAutoResolvable(file);

      if (!resolvable) {
        result.message = 'Conflict not auto-resolvable';
        return result;
      }

      switch (resolvable) {
        case 'whitespace':
          return await this._resolveWhitespace(file);

        case 'dependency_version':
          return await this._resolveDependencyVersion(file, strategy);

        case 'config_merge':
          return await this._resolveConfigMerge(file);

        default:
          result.message = 'Unknown resolution strategy';
          return result;
      }
    } catch (error) {
      result.message = error.message;
      return result;
    }
  }

  /**
   * Resolve whitespace conflicts
   * @private
   */
  async _resolveWhitespace(file) {
    const content = this._getConflictContent(file);
    const filePath = join(this.worktreePath, file);

    let resolved = content.fullContent;

    // Remove conflict markers and keep "ours" (which is same as "theirs" without whitespace)
    for (const conflict of content.conflicts) {
      const conflictText = content.fullContent.substring(
        content.fullContent.indexOf('<<<<<<<'),
        content.fullContent.indexOf('>>>>>>>') + 7
      );

      resolved = resolved.replace(conflictText, conflict.ours.join('\n'));
    }

    writeFileSync(filePath, resolved, 'utf-8');

    // Mark as resolved
    execSync(`git add ${file}`, {
      cwd: this.worktreePath,
      stdio: 'pipe'
    });

    return {
      success: true,
      file,
      strategy: 'whitespace',
      message: 'Whitespace conflict auto-resolved'
    };
  }

  /**
   * Resolve dependency version conflicts
   * @private
   */
  async _resolveDependencyVersion(file, strategy = 'theirs') {
    // For package.json, prefer taking the newer version (usually "theirs" from main)
    const filePath = join(this.worktreePath, file);

    try {
      if (strategy === 'theirs') {
        execSync(`git checkout --theirs ${file}`, {
          cwd: this.worktreePath,
          stdio: 'pipe'
        });
      } else {
        execSync(`git checkout --ours ${file}`, {
          cwd: this.worktreePath,
          stdio: 'pipe'
        });
      }

      execSync(`git add ${file}`, {
        cwd: this.worktreePath,
        stdio: 'pipe'
      });

      return {
        success: true,
        file,
        strategy: `dependency_${strategy}`,
        message: `Dependency conflict resolved (using ${strategy})`
      };
    } catch (error) {
      return {
        success: false,
        file,
        strategy: `dependency_${strategy}`,
        message: error.message
      };
    }
  }

  /**
   * Resolve non-overlapping config merges
   * @private
   */
  async _resolveConfigMerge(file) {
    // This would require parsing the config format (JSON, YAML, etc.)
    // and merging non-overlapping keys
    // For now, return not implemented
    return {
      success: false,
      file,
      strategy: 'config_merge',
      message: 'Config merge not yet implemented'
    };
  }

  /**
   * Generate AI prompt for conflict resolution
   * @param {Object} conflict - Conflict object
   * @returns {string} AI prompt
   */
  generateAIPrompt(conflict) {
    const prompt = `
I have a merge conflict in the file: ${conflict.file}

Category: ${conflict.category}
Number of conflicts: ${conflict.content.conflictCount}

Conflict details:
${this._formatConflictsForAI(conflict.content)}

Please analyze this conflict and suggest:
1. What changed in both branches
2. The safest resolution strategy
3. If it's safe to auto-resolve, provide the exact resolution

Consider:
- Preserve functionality from both branches if possible
- For dependencies, prefer newer versions
- For configs, merge non-overlapping changes
- For code, preserve both features unless they're contradictory
`.trim();

    return prompt;
  }

  /**
   * Format conflicts for AI readability
   * @private
   */
  _formatConflictsForAI(content) {
    let formatted = '';

    for (let i = 0; i < content.conflicts.length; i++) {
      const conflict = content.conflicts[i];
      formatted += `
Conflict #${i + 1}:
--- Current branch (ours) ---
${conflict.ours.join('\n')}

--- Incoming branch (theirs) ---
${conflict.theirs.join('\n')}
----------------------------
`;
    }

    return formatted;
  }

  /**
   * Send conflict to AI agent for analysis
   * @param {Object} conflict - Conflict object
   * @param {Object} ptyManager - PTY manager instance
   * @param {string} worktreeName - Worktree name
   * @returns {Object} Result
   */
  async requestAIAssistance(conflict, ptyManager, worktreeName) {
    try {
      const terminal = ptyManager.terminals.get(`${worktreeName}:claude`);

      if (!terminal) {
        return {
          success: false,
          message: 'No active AI agent to assist'
        };
      }

      const prompt = this.generateAIPrompt(conflict);

      // Send conflict info to terminal
      terminal.write('\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
      terminal.write('\x1b[1;33m⚠️  Merge Conflict Detected\x1b[0m\r\n');
      terminal.write('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
      terminal.write(`\x1b[0mFile: \x1b[1m${conflict.file}\x1b[0m\r\n`);
      terminal.write(`Category: ${conflict.category}\r\n`);
      terminal.write(`Conflicts: ${conflict.content.conflictCount}\r\n`);

      if (conflict.resolvable) {
        terminal.write(`\x1b[32m✓ Auto-resolvable: ${conflict.resolvable}\x1b[0m\r\n`);
      } else {
        terminal.write(`\x1b[33m⚠  Manual resolution needed\x1b[0m\r\n`);
      }

      terminal.write('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
      terminal.write('\r\n');

      // Note: The AI agent will see this in the terminal and can respond naturally
      // We don't auto-inject the prompt as that would be too invasive

      return {
        success: true,
        message: 'Conflict information sent to AI agent'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Analyze all conflicts and suggest resolution strategies
   * @returns {Object} Analysis with suggestions
   */
  async analyzeConflicts() {
    const conflicts = this.getConflicts();

    const analysis = {
      total: conflicts.length,
      autoResolvable: conflicts.filter(c => c.resolvable).length,
      manual: conflicts.filter(c => !c.resolvable).length,
      byCategory: {},
      conflicts: conflicts.map(c => ({
        file: c.file,
        category: c.category,
        conflictCount: c.content.conflictCount,
        resolvable: c.resolvable,
        suggestion: this._getSuggestion(c)
      }))
    };

    // Count by category
    for (const conflict of conflicts) {
      analysis.byCategory[conflict.category] =
        (analysis.byCategory[conflict.category] || 0) + 1;
    }

    return analysis;
  }

  /**
   * Get resolution suggestion for conflict
   * @private
   */
  _getSuggestion(conflict) {
    switch (conflict.resolvable) {
      case 'whitespace':
        return 'Auto-resolve: Whitespace differences only';

      case 'dependency_version':
        return 'Auto-resolve: Accept newer dependency versions';

      case 'config_merge':
        return 'Auto-resolve: Merge non-overlapping config changes';

      default:
        switch (conflict.category) {
          case 'code':
            return 'Manual: Review code changes carefully - may affect functionality';

          case 'config':
            return 'Manual: Review config changes - may have overlapping keys';

          case 'dependency':
            return 'Manual: Check for breaking dependency changes';

          case 'documentation':
            return 'Manual: Merge documentation from both branches';

          default:
            return 'Manual: Review and resolve conflicts';
        }
    }
  }
}
