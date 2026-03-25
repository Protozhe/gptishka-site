import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { ensureWelcomePromoCode } from "./modules/promocodes/welcome-promo.service";
import { vpnService } from "./services/vpn.service";
import { accountNotificationsService } from "./modules/account/account-notifications.service";

async function bootstrap() {
  await prisma.$connect();
  try {
    await ensureWelcomePromoCode();
  } catch (error) {
    console.error("[promo] failed to ensure welcome promo code", error);
  }
  if (env.VPN_AUTO_SEED_PRODUCTS) {
    try {
      await vpnService.ensureVpnCatalogProducts();
    } catch (error) {
      console.error("[vpn] failed to ensure vpn catalog products", error);
    }
  }
  accountNotificationsService.startScheduler();
  const app = createApp();
  const bindHost = String(env.HOST || "127.0.0.1").trim() || "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(env.PORT, bindHost, () => {
      server.off("error", onError);
      resolve();
    });

    function onError(error: NodeJS.ErrnoException) {
      reject(error);
    }

    server.once("error", onError);
  });

  process.stdout.write(`[admin-backend] started on ${env.APP_URL} (bind ${bindHost}:${env.PORT})\n`);
}

bootstrap().catch((error: NodeJS.ErrnoException) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`[admin-backend] failed to bind port ${env.PORT}: already in use`);
  }
  console.error("Failed to start admin backend", error);
  process.exit(1);
});
