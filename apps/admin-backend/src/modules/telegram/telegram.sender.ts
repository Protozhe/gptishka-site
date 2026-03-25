import { env } from "../../config/env";

export type TelegramSendSuccess = {
  ok: true;
  messageId: number | null;
};

export type TelegramSendFailure = {
  ok: false;
  retryable: boolean;
  deactivateLink: boolean;
  code:
    | "not_configured"
    | "chat_not_found"
    | "bot_blocked"
    | "user_not_started_bot"
    | "rate_limited"
    | "temporary_telegram_error"
    | "network_error"
    | "bad_request"
    | "unknown_error";
  description: string;
  retryAfterSeconds?: number;
};

export type TelegramSendResult = TelegramSendSuccess | TelegramSendFailure;

function parseTelegramDescription(description: string): Omit<TelegramSendFailure, "ok" | "description"> {
  const text = String(description || "").toLowerCase();

  if (text.includes("bot was blocked by the user")) {
    return { retryable: false, deactivateLink: true, code: "bot_blocked" };
  }
  if (text.includes("chat not found")) {
    return { retryable: false, deactivateLink: true, code: "chat_not_found" };
  }
  if (text.includes("user is deactivated") || text.includes("user not found")) {
    return { retryable: false, deactivateLink: true, code: "user_not_started_bot" };
  }
  if (text.includes("too many requests")) {
    return { retryable: true, deactivateLink: false, code: "rate_limited" };
  }
  if (text.includes("bad request")) {
    return { retryable: false, deactivateLink: false, code: "bad_request" };
  }
  return { retryable: true, deactivateLink: false, code: "unknown_error" };
}

function toTelegramApiUrl(method: string) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return "";
  return `https://api.telegram.org/bot${token}/${method}`;
}

export const telegramSender = {
  async sendTextMessage(input: { telegramId: string; text: string }): Promise<TelegramSendResult> {
    const telegramId = String(input.telegramId || "").trim();
    const text = String(input.text || "").trim();
    if (!telegramId || !text) {
      return {
        ok: false,
        retryable: false,
        deactivateLink: false,
        code: "bad_request",
        description: "telegramId and text are required",
      };
    }

    const url = toTelegramApiUrl("sendMessage");
    if (!url) {
      return {
        ok: false,
        retryable: false,
        deactivateLink: false,
        code: "not_configured",
        description: "TELEGRAM_BOT_TOKEN is not configured",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramId,
          text,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload?.ok) {
        const description = String(payload?.description || `HTTP_${response.status}`);
        const parsed = parseTelegramDescription(description);
        const retryAfterSeconds =
          Number(payload?.parameters?.retry_after) > 0 ? Number(payload.parameters.retry_after) : undefined;
        if (response.status >= 500) {
          return {
            ok: false,
            retryable: true,
            deactivateLink: false,
            code: "temporary_telegram_error",
            description,
          };
        }
        return {
          ok: false,
          description,
          retryAfterSeconds,
          ...parsed,
        };
      }

      return {
        ok: true,
        messageId: Number(payload?.result?.message_id) || null,
      };
    } catch (error) {
      const description = String((error as Error)?.message || "network_error");
      return {
        ok: false,
        retryable: true,
        deactivateLink: false,
        code: "network_error",
        description,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};

