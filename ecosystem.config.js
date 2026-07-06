// ecosystem.config.js
// PM2 Configuration for NovaStream Server
// Usage: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [{
    name: 'novastream',
    script: './server/src/app.js',

    // Process Management
    instances: 'max',          // Use all available CPU cores (PPR-003)
    exec_mode: 'cluster',      // Multi-core via cluster mode (PPR-003)
    watch: false,
    max_memory_restart: '1G',

    // Environment
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
    },

    // Logging
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    log_type: 'json',
    merge_logs: true,
    time: true,

    // Auto-restart
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    min_uptime: 10000,

    // Graceful Shutdown
    kill_timeout: 10000,
    listen_timeout: 3000,

    // Health
    exp_backoff_restart_delay: 100,
  }],
};
