module.exports = {
  apps: [{
    name: 'comfy-biometric-sync',
    script: 'sync.js',
    watch: false,
    restart_delay: 5000,
    max_restarts: 20,
    log_file: './logs/sync.log',
    error_file: './logs/error.log',
    time: true,
  }],
};
