import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { ensureWelcomePromoCode } from "./modules/promocodes/welcome-promo.service";
import { vpnService } from "./services/vpn.service";

async function bootstrap() {
  await prisma.$connect();
  try {
    await ensureWelcomePromoCode();
  } catch (error) {
    console.error("[promo] failed to ensure welcome promo code", error);
  }
  try {
    await vpnService.ensureVpnCatalogProducts();
  } catch (error) {
    console.error("[vpn] failed to ensure vpn catalog products", error);
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
