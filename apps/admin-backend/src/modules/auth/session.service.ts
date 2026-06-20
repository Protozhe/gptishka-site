import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { sha256 } from "../../common/utils/hash";

const REFRESH_TOKEN_LOCK_NAMESPACE = 912734;

export async function withUserRefreshTokenLock<T>(
  userId: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>
) {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("userId is required");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFRESH_TOKEN_LOCK_NAMESPACE}::integer, hashtext(${uid}))`;
    return action(tx);
  });
}

export async function revokeRefreshToken(rawToken: string) {
  const token = String(rawToken || "").trim();
  if (!token) return { revoked: 0, userId: null as string | null };
  const tokenHash = sha256(token);
  const existing = await prisma.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null },
    select: { userId: true },
  });
  const result = await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { revoked: result.count, userId: existing?.userId || null };
}

export async function revokeAllUserRefreshTokens(userId: string) {
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  return withUserRefreshTokenLock(uid, async (tx) => {
    const result = await tx.refreshToken.updateMany({
      where: { userId: uid, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    return result.count;
  });
}
