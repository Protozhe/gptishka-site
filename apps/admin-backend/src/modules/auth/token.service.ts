import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { RoleCode } from "@prisma/client";
import { randomUUID } from "node:crypto";

export type AccessPayload = { sub: string; role: RoleCode; type: "access"; sid: string; mfa?: boolean };
export type RefreshPayload = { sub: string; type: "refresh"; mfa?: boolean };

export function signAccessToken(userId: string, role: RoleCode, sessionId: string, mfa = false) {
  return jwt.sign({ sub: userId, role, type: "access", sid: sessionId, mfa }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(userId: string, mfa = false) {
  return jwt.sign({ sub: userId, type: "refresh", mfa, jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d` as jwt.SignOptions["expiresIn"],
  });
}

export function signPanelToken(userId: string, sessionId: string, expiresAt: Date) {
  return jwt.sign({ sub: userId, sid: sessionId, type: "panel", mfa: true, exp: Math.floor(expiresAt.getTime() / 1000) }, env.JWT_ACCESS_SECRET);
}

export function verifyPanelToken(token: string): { sub: string; sid: string } {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
  if (typeof payload === "string" || payload.type !== "panel" || payload.mfa !== true ||
      typeof payload.sub !== "string" || !payload.sub || typeof payload.sid !== "string" || !payload.sid) {
    throw new Error("Invalid panel token claims");
  }
  return { sub: payload.sub, sid: payload.sid };
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
