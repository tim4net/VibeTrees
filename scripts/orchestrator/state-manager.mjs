import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export class StateManager {
  constructor(dbPath = '.orchestrator-state/state.db') {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        start_phase INTEGER DEFAULT 1,
        current_phase INTEGER DEFAULT 1,
        status TEXT DEFAULT 'pending',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS phases (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        phase_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        phase_id TEXT NOT NULL,
        task_number INTEGER NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        started_at INTEGER,
        completed_at INTEGER,
        continuation_id TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        FOREIGN KEY (phase_id) REFERENCES phases(id)
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        phase_id TEXT,
        checkpoint_type TEXT NOT NULL,
        message TEXT,
        requires_approval BOOLEAN DEFAULT 0,
        approved BOOLEAN,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (phase_id) REFERENCES phases(id)
      );

      CREATE INDEX IF NOT EXISTS idx_phases_session
        ON phases(session_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_phase
        ON tasks(phase_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_session
        ON checkpoints(session_id);
    `);
  }

  createSession({ model, startPhase = 1 }) {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO sessions (id, model, start_phase, current_phase)
      VALUES (?, ?, ?, ?)
    `).run(id, model, startPhase, startPhase);
    return id;
  }

  getSession(sessionId) {
    return this.db.prepare(
      'SELECT * FROM sessions WHERE id = ?'
    ).get(sessionId);
  }

  startPhase(sessionId, phaseNumber, phaseName) {
    const phaseId = randomUUID();
    this.db.prepare(`
      INSERT INTO phases (id, session_id, phase_number, name, status, started_at)
      VALUES (?, ?, ?, ?, 'in_progress', strftime('%s', 'now'))
    `).run(phaseId, sessionId, phaseNumber, phaseName);

    this.db.prepare(
      'UPDATE sessions SET current_phase = ? WHERE id = ?'
    ).run(phaseNumber, sessionId);

    return phaseId;
  }

  getCurrentPhase(sessionId) {
    return this.db.prepare(`
      SELECT * FROM phases
      WHERE session_id = ? AND status = 'in_progress'
      ORDER BY started_at DESC
      LIMIT 1
    `).get(sessionId);
  }

  completePhase(phaseId, error = null) {
    const status = error ? 'failed' : 'completed';
    this.db.prepare(`
      UPDATE phases
      SET status = ?, completed_at = strftime('%s', 'now'), error = ?
      WHERE id = ?
    `).run(status, error, phaseId);
  }

  createTask(phaseId, taskNumber, description) {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO tasks (id, phase_id, task_number, description)
      VALUES (?, ?, ?, ?)
    `).run(id, phaseId, taskNumber, description);
    return id;
  }

  startTask(taskId, continuationId = null) {
    this.db.prepare(`
      UPDATE tasks
      SET status = 'in_progress', started_at = strftime('%s', 'now'), continuation_id = ?
      WHERE id = ?
    `).run(continuationId, taskId);
  }

  completeTask(taskId, error = null) {
    const status = error ? 'failed' : 'completed';
    this.db.prepare(`
      UPDATE tasks
      SET status = ?, completed_at = strftime('%s', 'now'), error = ?
      WHERE id = ?
    `).run(status, error, taskId);
  }

  incrementRetry(taskId) {
    this.db.prepare(
      'UPDATE tasks SET retry_count = retry_count + 1 WHERE id = ?'
    ).run(taskId);
  }

  createCheckpoint(sessionId, phaseId, type, message, requiresApproval = false) {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO checkpoints (id, session_id, phase_id, checkpoint_type, message, requires_approval)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, phaseId, type, message, requiresApproval ? 1 : 0);
    return id;
  }

  approveCheckpoint(checkpointId) {
    this.db.prepare(
      'UPDATE checkpoints SET approved = 1 WHERE id = ?'
    ).run(checkpointId);
  }

  getPendingCheckpoints(sessionId) {
    return this.db.prepare(`
      SELECT * FROM checkpoints
      WHERE session_id = ? AND requires_approval = 1 AND approved IS NULL
      ORDER BY created_at DESC
    `).all(sessionId);
  }

  getSessionSummary(sessionId) {
    const session = this.getSession(sessionId);
    const phases = this.db.prepare(
      'SELECT * FROM phases WHERE session_id = ? ORDER BY phase_number'
    ).all(sessionId);

    const summary = {
      session,
      phases: phases.map(phase => ({
        ...phase,
        tasks: this.db.prepare(
          'SELECT * FROM tasks WHERE phase_id = ? ORDER BY task_number'
        ).all(phase.id)
      }))
    };

    return summary;
  }

  close() {
    this.db.close();
  }
}
