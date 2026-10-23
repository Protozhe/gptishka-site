import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { RoleCode } from "@prisma/client";
import { randomUUID } from "node:crypto";

export type AccessPayload = { sub: string; role: RoleCode; type: "access"; sid: string };
export type RefreshPayload = { sub: string; type: "refresh" };

export function signAccessToken(userId: string, role: RoleCode, sessionId: string) {
  return jwt.sign({ sub: userId, role, type: "access", sid: sessionId }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(userId: string) {
  return jwt.sign({ sub: userId, type: "refresh", jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d` as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
  if (typeof payload === "string" || payload.type !== "access" ||
      typeof payload.sub !== "string" || !payload.sub.trim() ||
      !Object.values(RoleCode).includes(payload.role) ||
      typeof payload.sid !== "string" || !payload.sid.trim()) {
    throw new Error("Invalid access token claims");
  }
  return payload as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
  if (typeof payload === "string" || payload.type !== "refresh" ||
      typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new Error("Invalid refresh token claims");
  }
  return payload as RefreshPayload;
}
