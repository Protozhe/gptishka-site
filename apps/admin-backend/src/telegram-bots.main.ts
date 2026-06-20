import { prisma } from "./config/prisma";
import { startTelegramBotsWorker } from "./modules/telegram-bots/telegram-bots.worker";

async function bootstrap() {
  await prisma.$connect();
  const started = await startTelegramBotsWorker();
  if (!started) {
    // Keep process alive for pm2 to avoid restart loops when bots are intentionally disabled.
    setInterval(() => {
      process.stdout.write("[tg-bot] idle\n");
    }, 10 * 60 * 1000);
    await new Promise<void>(() => {
      // no-op
    });
  }
}

function setupShutdownHandlers() {
  const shutdown = async (signal: string) => {
    try {
      process.stdout.write(`[tg-bot] received ${signal}, closing prisma\n`);
      await prisma.$disconnect();
    } catch (error) {
      console.error("[tg-bot] prisma disconnect failed", error);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

setupShutdownHandlers();

bootstrap().catch((error) => {
  console.error("[tg-bot] failed to start", error);
  process.exit(1);
});
