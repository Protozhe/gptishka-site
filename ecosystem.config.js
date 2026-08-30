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
        AI_BATTLE_STATS_FILE: "/var/lib/gptishka-runtime/ai-battle-stats.json",
        ACTIVATION_CHONGZHI_IP: process.env.ACTIVATION_CHONGZHI_IP || "172.105.209.180",
        ACTIVATION_GROK_BASE_URL:
          process.env.ACTIVATION_GROK_BASE_URL || "https://aichongzhi.fun/?product=grok",
        ACTIVATION_GROK_IP: process.env.ACTIVATION_GROK_IP || "139.162.68.169",
      },
      max_memory_restart: "350M",
      autorestart: true,
      watch: false,
    },
    {
      name: "gptishka-telegram-bots",
      script: "./apps/admin-backend/dist/telegram-bots.main.js",
      cwd: "/var/www/gptishka-new",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "250M",
      autorestart: true,
      watch: false,
    },
  ],
};
