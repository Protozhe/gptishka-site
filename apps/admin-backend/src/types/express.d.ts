import type { RoleCode } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: RoleCode;
      };
      requestMeta?: {
        ip?: string;
        userAgent?: string;
      };
    }
  }
}

export {};
