import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";

async function bootstrap() {
  await prisma.$connect();
  const app = createApp();

  app.listen(env.PORT, () => {
    process.stdout.write(`[admin-backend] started on ${env.APP_URL}\n`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start admin backend", error);
  process.exit(1);
});
