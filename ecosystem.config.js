module.exports = {
  apps: [
    {
      name: "gptishka-storefront",
      script: "./server.js",
      cwd: "/var/www/gptishka-new",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        HOST: "127.0.0.1",
        BIND_HOST: "127.0.0.1",
        ADMIN_BACKEND_URL: "http://127.0.0.1:4100",
        ADMIN_BACKEND_FALLBACK_URLS: "http://127.0.0.1:4100,http://localhost:4100",
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
        HOST: "127.0.0.1",
        BIND_HOST: "127.0.0.1",
      },
      max_memory_restart: "350M",
      autorestart: true,
      watch: false,
    },
  ],
};
