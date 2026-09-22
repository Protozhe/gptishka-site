import crypto from "crypto";
import { env } from "../../config/env";
import { AppError } from "../errors/app-error";

const AAD = Buffer.from("gptishka:manual-login-credentials:v1", "utf8");

export type ManualLoginCredentials = { login: string; password: string };
export type EncryptedManualLoginCredentials = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

function encryptionKey() {
  const secret = String(env.ACTIVATION_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!secret) throw new AppError("Manual login encryption is not configured", 503);
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptManualLoginCredentials(value: ManualLoginCredentials): EncryptedManualLoginCredentials {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptManualLoginCredentials(value: unknown): ManualLoginCredentials {
  if (!value || typeof value !== "object") throw new AppError("Credentials are not available", 404);
  const source = value as Record<string, unknown>;
  if (source.version !== 1 || source.algorithm !== "aes-256-gcm") {
    throw new AppError("Unsupported credentials format", 400);
  }
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(String(source.iv || ""), "base64")
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(String(source.tag || ""), "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(String(source.ciphertext || ""), "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as ManualLoginCredentials;
    if (!parsed.login || !parsed.password) throw new Error("Incomplete credentials");
    return { login: String(parsed.login), password: String(parsed.password) };
  } catch {
    throw new AppError("Credentials cannot be decrypted", 422);
  }
}
