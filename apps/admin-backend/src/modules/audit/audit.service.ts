import { prisma } from "../../config/prisma";

type AuditInput = {
  userId?: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
};

export async function writeAuditLog(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: input.before as any,
      after: input.after as any,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}
