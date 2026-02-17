module.exports = {
  apps: [
    {
      name: "gptishka-storefront",
      script: "./server.js",
      cwd: "/var/www/gptishka-new",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
      max_memory_restart: "300M",
      autorestart: true,
      watch: false,
    },
    {
      name: "gptishka-admin-api",
      script: "./apps/admin-backend/dist/main.js",
      cwd: "/var/www/gptishka-new",
      env: {
        NODE_ENV: "production",
        PORT: 4100,
      },
      max_memory_restart: "350M",
      autorestart: true,
      watch: false,
    },
  ],
};
