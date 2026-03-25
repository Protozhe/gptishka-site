import type { RoleCode } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: RoleCode;
      };
      customerAuth?: {
        customerId: string;
        customerEmail: string;
        sessionId: string;
      };
      requestMeta?: {
        ip?: string;
        userAgent?: string;
      };
    }
  }
}

export {};
