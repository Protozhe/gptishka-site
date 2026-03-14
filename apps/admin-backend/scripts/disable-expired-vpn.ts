import { prisma } from "../src/config/prisma";
import { vpnService } from "../src/services/vpn.service";

async function run() {
  await prisma.$connect();
  const limit = Math.max(1, Math.min(Number(process.env.VPN_EXPIRED_SYNC_LIMIT || 200), 1000));
  const result = await vpnService.disableExpiredAccesses(limit);
  console.log(`[vpn-expired] checked=${result.checked} disabled=${result.disabled} failed=${result.failed}`);
  await prisma.$disconnect();
}

run().catch(async (error) => {
  console.error("[vpn-expired] failed", error);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});

