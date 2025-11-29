/**
 * Worker Thread for listWorktrees()
 * Runs heavy git/docker operations off the main thread to prevent blocking
 */

import { parentPort } from 'worker_threads';
import { execSync } from 'child_process';
import { basename } from 'path';

parentPort.on('message', ({ portRegistry, rootDir, runtimeInfo }) => {
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
          processWorktree(current, portRegistry, rootDir, runtimeInfo);
          worktrees.push(current);
          current = {};
        }
      }
    }

    if (current.path) {
      processWorktree(current, portRegistry, rootDir, runtimeInfo);
      worktrees.push(current);
    }

    parentPort.postMessage({ success: true, worktrees });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
});

function processWorktree(worktree, portRegistry, rootDir, runtimeInfo) {
  // Use 'main' for root worktree or main branch, otherwise use directory name
  const isRootWorktree = !worktree.path.includes('.worktrees');
  worktree.name = (isRootWorktree || worktree.branch === 'main') ? 'main' : basename(worktree.path);
  worktree.ports = portRegistry[worktree.name] || {};

  // Get Docker/Podman status
  worktree.dockerStatus = getDockerStatus(worktree.path, worktree.name, runtimeInfo);

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

function getDockerStatus(path, name, runtimeInfo = {}) {
  try {
    // Use label-based filtering to find containers by working directory
    // This works even if COMPOSE_PROJECT_NAME has changed since containers were started
    const runtime = runtimeInfo.runtime || 'docker';
    const needsSudo = runtimeInfo.needsSudo ?? false;

    // Build the command based on detected runtime
    const baseCmd = `${runtime} ps -a --filter "label=com.docker.compose.project.working_dir=${path}" --format json`;
    const cmd = needsSudo ? `sudo ${baseCmd}` : baseCmd;

    let output;
    try {
      output = execSync(`${cmd} 2>/dev/null`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch {
      // Fallback: try without sudo if sudo failed, or with sudo if non-sudo failed
      const fallbackCmd = needsSudo ? baseCmd : `sudo ${baseCmd}`;
      output = execSync(`${fallbackCmd} 2>/dev/null`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }

    // Parse JSON - handle both Docker (newline-delimited) and Podman (single array) formats
    const trimmed = output.trim();
    let containers;
    if (trimmed.startsWith('[')) {
      // Podman returns a JSON array
      containers = JSON.parse(trimmed);
    } else {
      // Docker returns newline-delimited JSON objects
      containers = trimmed.split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    }
    containers = containers.filter(c => c.Names); // Basic filter - check Names exists

    // Map containers to service objects with extracted service names
    const mapped = containers
      .map(c => {
        // Extract service name from Labels
        let serviceName = null;

        if (c.Labels) {
          if (typeof c.Labels === 'string') {
            // Docker returns labels as comma-separated string
            const serviceMatch = c.Labels.match(/com\.docker\.compose\.service=([^,]+)/);
            serviceName = serviceMatch ? serviceMatch[1] : null;
          } else if (typeof c.Labels === 'object') {
            // Podman returns labels as an object
            serviceName = c.Labels['com.docker.compose.service'] || null;
          }
        }

        // Fallback: parse from container name if label extraction failed
        if (!serviceName && c.Names) {
          // Handle both string (Docker) and array (Podman) formats
          const name = Array.isArray(c.Names) ? c.Names[0] : c.Names;
          const parts = name.split('-');
          serviceName = parts.length > 1 ? parts.slice(0, -1).join('-') : parts[0];
        }

        // Last resort: use container ID (handle both ID and Id)
        if (!serviceName) {
          const id = c.ID || c.Id;
          serviceName = id ? id.substring(0, 12) : 'unknown';
        }

        return {
          name: serviceName,
          state: c.State || 'unknown',
          status: c.Status || '',
          ports: c.Ports ? parsePorts(c.Ports) : [],
          createdAt: c.CreatedAt || '' // Keep creation time for deduplication
        };
      })
      .filter(c => !c.name.includes('init')); // Filter out init containers

    // Deduplicate by service name - prioritize running containers
    // This handles cases where COMPOSE_PROJECT_NAME changed but working_dir stayed the same
    const serviceMap = new Map();
    for (const container of mapped) {
      const existing = serviceMap.get(container.name);

      if (!existing) {
        // No existing container for this service, add it
        serviceMap.set(container.name, container);
      } else {
        // Priority: running > created/exited, then most recent createdAt
        const existingRunning = existing.state === 'running';
        const currentRunning = container.state === 'running';

        if (currentRunning && !existingRunning) {
          // Current is running, existing is not - prefer current
          serviceMap.set(container.name, container);
        } else if (currentRunning === existingRunning && container.createdAt > existing.createdAt) {
          // Same state, prefer more recent
          serviceMap.set(container.name, container);
        }
        // Otherwise keep existing
      }
    }

    // Remove createdAt from final output and return deduplicated containers
    return Array.from(serviceMap.values()).map(c => {
      const { createdAt, ...rest } = c;
      return rest;
    });
  } catch (error) {
    return [];
  }
}

function parsePorts(ports) {
  if (!ports) return [];

  const publishers = [];
  const seen = new Set(); // Track unique port mappings

  // Handle Podman array format: [{host_port, container_port, ...}]
  if (Array.isArray(ports)) {
    for (const p of ports) {
      if (p.host_port && p.container_port) {
        const key = `${p.host_port}->${p.container_port}`;
        if (!seen.has(key)) {
          seen.add(key);
          publishers.push({
            PublishedPort: p.host_port,
            TargetPort: p.container_port
          });
        }
      }
    }
    return publishers;
  }

  // Handle Docker string format: "0.0.0.0:5432->5432/tcp, :::5432->5432/tcp"
  if (typeof ports === 'string') {
    const portMappings = ports.split(',').map(p => p.trim());
    for (const mapping of portMappings) {
      const match = mapping.match(/(?:[\d.]+|:::)?:?(\d+)->(\d+)/);
      if (match) {
        const publishedPort = parseInt(match[1], 10);
        const targetPort = parseInt(match[2], 10);
        const key = `${publishedPort}->${targetPort}`;

        if (!seen.has(key)) {
          seen.add(key);
          publishers.push({
            PublishedPort: publishedPort,
            TargetPort: targetPort
          });
        }
      }
    }
  }

  return publishers;
}

function extractPortsFromDockerStatus(dockerStatus) {
  const ports = {};
  for (const container of dockerStatus) {
    const serviceName = container.name;
    const publishers = container.ports || [];
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
