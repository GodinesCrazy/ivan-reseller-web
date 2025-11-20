// ✅ F6: Configuración PM2 para monitoreo y gestión de procesos
// Uso: pm2 start scripts/pm2-ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'ivan-reseller-backend',
      script: './backend/dist/server.js',
      cwd: './backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // ✅ F6: Configuración de monitoreo
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart en caso de errores
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',
      
      // Health checks
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,
      
      // Watch (opcional, desactivado en producción)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],
    },
    {
      name: 'ivan-reseller-health-monitor',
      script: './scripts/monitor-health.sh',
      interpreter: 'bash',
      instances: 1,
      exec_mode: 'fork',
      env: {
        HEALTH_URL: 'http://localhost:3000/health',
        MONITOR_LOG_FILE: './logs/health-monitor.log',
      },
      // Logs
      error_file: './logs/health-monitor-error.log',
      out_file: './logs/health-monitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Auto restart
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
    },
  ],
  
  // ✅ F6: Configuración de deployment (opcional)
  deploy: {
    production: {
      user: 'deploy',
      host: ['ivanreseller.com'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/ivan-reseller-web.git',
      path: '/var/www/ivan-reseller',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'post-setup': 'npm install && npm run build',
    },
  },
};

