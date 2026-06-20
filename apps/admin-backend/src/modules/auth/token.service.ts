import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { RoleCode } from "@prisma/client";

export type AccessPayload = { sub: string; role: RoleCode; type: "access" };
export type RefreshPayload = { sub: string; type: "refresh" };

export function signAccessToken(userId: string, role: RoleCode) {
  return jwt.sign({ sub: userId, role, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(userId: string) {
  return jwt.sign({ sub: userId, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d` as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
}
