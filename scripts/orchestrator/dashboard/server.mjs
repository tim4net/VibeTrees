import express from 'express';
import { WebSocketServer } from 'ws';
import { StateManager } from '../state-manager.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DashboardServer {
  constructor(port = 3334, dbPath = '.orchestrator-state/state.db') {
    this.port = port;
    this.stateManager = new StateManager(dbPath);
    this.app = express();
    this.server = null;
    this.wss = null;
    this.clients = new Set();

    this.setupRoutes();
  }

  setupRoutes() {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));

    // API: Get session summary
    this.app.get('/api/session', (req, res) => {
      try {
        // Get most recent session
        const session = this.stateManager.db.prepare(`
          SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1
        `).get();

        if (!session) {
          return res.json({ session: null });
        }

        const summary = this.stateManager.getSessionSummary(session.id);
        res.json({ session, summary });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get all phases for current session
    this.app.get('/api/phases', (req, res) => {
      try {
        const session = this.stateManager.db.prepare(`
          SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1
        `).get();

        if (!session) {
          return res.json({ phases: [] });
        }

        const phases = this.stateManager.db.prepare(`
          SELECT * FROM phases WHERE session_id = ? ORDER BY phase_number
        `).all(session.id);

        // Get tasks for each phase
        const phasesWithTasks = phases.map(phase => {
          const tasks = this.stateManager.db.prepare(`
            SELECT * FROM tasks WHERE phase_id = ? ORDER BY task_number
          `).all(phase.id);
          return { ...phase, tasks };
        });

        res.json({ phases: phasesWithTasks });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get pending checkpoints
    this.app.get('/api/checkpoints', (req, res) => {
      try {
        const checkpoints = this.stateManager.db.prepare(`
          SELECT c.*, p.name as phase_name, p.phase_number
          FROM checkpoints c
          JOIN phases p ON c.phase_id = p.id
          WHERE c.approved = 0 AND c.requires_approval = 1
          ORDER BY c.created_at DESC
        `).all();

        res.json({ checkpoints });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // API: Approve checkpoint
    this.app.post('/api/checkpoints/:id/approve', express.json(), (req, res) => {
      try {
        this.stateManager.approveCheckpoint(req.params.id);
        this.broadcast('checkpoint_approved', { checkpointId: req.params.id });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`📊 Dashboard running on http://localhost:${this.port}`);

        // Start WebSocket server
        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('connection', (ws) => {
          this.clients.add(ws);
          console.log('Dashboard client connected');

          // Send initial state
          ws.send(JSON.stringify({
            event: 'connected',
            timestamp: new Date().toISOString()
          }));

          ws.on('close', () => {
            this.clients.delete(ws);
            console.log('Dashboard client disconnected');
          });

          ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.clients.delete(ws);
          });
        });

        resolve();
      });
    });
  }

  broadcast(event, data) {
    const message = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
        }
      }
    });
  }

  close() {
    this.server?.close();
    this.wss?.close();
    this.clients.clear();
    this.stateManager.close();
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const dashboard = new DashboardServer();
  dashboard.start().then(() => {
    console.log('Dashboard server started');
  }).catch(error => {
    console.error('Failed to start dashboard:', error);
    process.exit(1);
  });
}
