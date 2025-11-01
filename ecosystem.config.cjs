module.exports = {
  apps: [{
    name: 'vibe-worktrees',
    script: './scripts/worktree-web/server.mjs',
    cwd: __dirname, // Run from the installation directory
    instances: 1,
    autorestart: true,
    watch: false, // Set to true for development if you want auto-reload on file changes
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3335
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3335,
      watch: true // Watch files in development
    },
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '~/.vibetrees/logs/error.log',
    out_file: '~/.vibetrees/logs/output.log',
    merge_logs: true,
    // Restart behavior
    min_uptime: '10s', // Min uptime before considered successful
    max_restarts: 10, // Max consecutive restarts within 1 minute
    restart_delay: 4000, // Delay between restarts (ms)
    // Advanced options
    kill_timeout: 5000, // Time to wait before force kill (ms)
    listen_timeout: 3000, // Time to wait for app to listen (ms)
    // Graceful shutdown
    wait_ready: false,
    shutdown_with_message: false,
    // Cron restart (optional - restart daily at 3am)
    // cron_restart: '0 3 * * *',
  }]
};
