/**
 * Worker Thread for listWorktrees()
 * Runs heavy git/docker operations off the main thread to prevent blocking
 */

import { parentPort } from 'worker_threads';
import { execSync } from 'child_process';
import { basename } from 'path';

parentPort.on('message', ({ portRegistry, rootDir }) => {
  try {
    const output = execSync('git worktree list --porcelain', {
      encoding: 'utf-8',
      cwd: rootDir
    });

    const worktrees = [];
    const lines = output.split('\n');
    let current = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        current.path = line.substring('worktree '.length);
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring('branch '.length).replace('refs/heads/', '');
      } else if (line === '') {
        if (current.path) {
          processWorktree(current, portRegistry, rootDir);
          worktrees.push(current);
          current = {};
        }
      }
    }

    if (current.path) {
      processWorktree(current, portRegistry, rootDir);
      worktrees.push(current);
    }

    parentPort.postMessage({ success: true, worktrees });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
});

function processWorktree(worktree, portRegistry, rootDir) {
  // Use 'main' for root worktree or main branch, otherwise use directory name
  const isRootWorktree = !worktree.path.includes('.worktrees');
  worktree.name = (isRootWorktree || worktree.branch === 'main') ? 'main' : basename(worktree.path);
  worktree.ports = portRegistry[worktree.name] || {};

  // Get Docker status
  worktree.dockerStatus = getDockerStatus(worktree.path, worktree.name);

  // Extract ports from running containers if registry is empty
  if (Object.keys(worktree.ports).length === 0 && worktree.dockerStatus.length > 0) {
    worktree.ports = extractPortsFromDockerStatus(worktree.dockerStatus);
  }

  // Get Git info
  worktree.gitStatus = getGitStatus(worktree.path);
  worktree.githubUrl = getGitHubUrl(worktree.path);
  worktree.commitCount = getCommitCount(worktree.path, worktree.branch);

  const aheadBehind = getAheadBehind(worktree.path, worktree.branch);
  worktree.ahead = aheadBehind.ahead;
  worktree.behind = aheadBehind.behind;

  const fileChanges = getFileChanges(worktree.path);
  worktree.modifiedFiles = fileChanges.modifiedFiles;
  worktree.untrackedFiles = fileChanges.untrackedFiles;

  worktree.lastCommit = getLastCommit(worktree.path);
}

function getDockerStatus(path, name) {
  try {
    const output = execSync('docker compose ps --format json 2>/dev/null', {
      cwd: path,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return output.trim().split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch (error) {
    return [];
  }
}

function extractPortsFromDockerStatus(dockerStatus) {
  const ports = {};
  for (const container of dockerStatus) {
    const serviceName = container.Service || container.Name;
    const publishers = container.Publishers || [];
    if (publishers.length > 0) {
      ports[serviceName] = publishers[0].PublishedPort;
    }
  }
  return ports;
}

function getGitStatus(path) {
  try {
    execSync('git status --porcelain', { cwd: path, encoding: 'utf-8', stdio: 'pipe' });
    return 'clean';
  } catch (error) {
    return 'dirty';
  }
}

function getGitHubUrl(path) {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: path,
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();
    return remote.replace(/\.git$/, '');
  } catch (error) {
    return null;
  }
}

function getCommitCount(path, branch) {
  try {
    const count = execSync(`git rev-list --count ${branch}`, {
      cwd: path,
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();
    return parseInt(count, 10);
  } catch (error) {
    return 0;
  }
}

function getAheadBehind(path, branch) {
  try {
    const output = execSync(`git rev-list --left-right --count origin/${branch}...${branch}`, {
      cwd: path,
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();
    const [behind, ahead] = output.split('\t').map(n => parseInt(n, 10));
    return { ahead: ahead || 0, behind: behind || 0 };
  } catch (error) {
    return { ahead: 0, behind: 0 };
  }
}

function getFileChanges(path) {
  try {
    const output = execSync('git status --porcelain', {
      cwd: path,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    const lines = output.trim().split('\n').filter(l => l);
    const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
    const untracked = lines.filter(l => l.startsWith('??')).length;
    return { modifiedFiles: modified, untrackedFiles: untracked };
  } catch (error) {
    return { modifiedFiles: 0, untrackedFiles: 0 };
  }
}

function getLastCommit(path) {
  try {
    const output = execSync('git log -1 --format="%H|%s|%an|%ar"', {
      cwd: path,
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();
    const [hash, subject, author, date] = output.split('|');
    return { hash, subject, author, date };
  } catch (error) {
    return null;
  }
}
