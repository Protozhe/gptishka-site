import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { ensureWelcomePromoCode } from "./modules/promocodes/welcome-promo.service";

async function bootstrap() {
  await prisma.$connect();
  try {
    await ensureWelcomePromoCode();
  } catch (error) {
    console.error("[promo] failed to ensure welcome promo code", error);
  }
  const app = createApp();

  app.listen(env.PORT, () => {
    process.stdout.write(`[admin-backend] started on ${env.APP_URL}\n`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start admin backend", error);
  process.exit(1);
});
