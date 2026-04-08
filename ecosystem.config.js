module.exports = {
  apps: [
    {
      name: "trafegoacademy-dashboard",
      script: ".next/standalone/server.js",
      cwd: "/var/www/trafegoacademy-dashboard",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
