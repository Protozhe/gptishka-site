import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { accountService } from "../account/account.service";
import { ordersService } from "../orders/orders.service";
import { parseSiteOrderStartPayload } from "../orders/telegram-order-linking";
import { telegramOrdersService } from "../orders/telegram-orders.service";
import {
  buildTelegramLinkedOrderText,
  buildTelegramOrderDetailsText,
  buildTelegramOrdersText,
  TelegramActivationPayload,
} from "./telegram-order-messages";
import { telegramSender } from "./telegram.sender";

const GENERIC_ORDER_BOT_TYPE = "chatgpt" as const;
const PAID_ORDER_STATUSES = new Set(["paid", "completed", "activated", "fulfilled", "delivered"]);

function extractTextMessage(update: any) {
  const message = update?.message || update?.edited_message || null;
  if (!message || typeof message !== "object") return null;
  const text = String(message.text || "").trim();
  if (!text) return null;
  const from = message.from || {};
  return {
    chatId: String(message.chat?.id || "").trim(),
    text,
    telegramId: String(from.id || "").trim(),
    telegramUsername: String(from.username || "").trim() || null,
    firstName: String(from.first_name || "").trim() || null,
  };
}

function extractStartPayload(text: string) {
  const raw = String(text || "").trim();
  if (!raw.toLowerCase().startsWith("/start")) return "";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "";
  return String(parts[1] || "").trim();
}

function isStartCommand(text: string) {
  return String(text || "").trim().toLowerCase().startsWith("/start");
}

function isCommand(text: string, command: string) {
  return new RegExp(`^/${command}(?:@\\w+)?(?:\\s|$)`, "i").test(String(text || "").trim());
}

function parseCheckCommand(text: string) {
  const match = String(text || "").match(/^\/check(?:@\w+)?\s+(\S+)\s*$/i);
  return String(match?.[1] || "").trim();
}

function parseTokenCommand(text: string) {
  const match = String(text || "").match(/^\/token(?:@\w+)?\s+(\S+)\s+([\s\S]+)$/i);
  if (!match) return null;
  const orderId = String(match[1] || "").trim();
  const token = String(match[2] || "").trim();
  if (!orderId || !token) return null;
  return { orderId, token };
}

function getSendTelegramId(message: ReturnType<typeof extractTextMessage>) {
  return String(message?.chatId || message?.telegramId || "").trim();
}

function getOwnerTelegramId(message: ReturnType<typeof extractTextMessage>) {
  return String(message?.telegramId || message?.chatId || "").trim();
}

function buildOrderContext(message: NonNullable<ReturnType<typeof extractTextMessage>>) {
  const telegramUserId = getOwnerTelegramId(message);
  const telegramChatId = getSendTelegramId(message) || telegramUserId;
  return {
    botType: GENERIC_ORDER_BOT_TYPE,
    telegramUserId,
    telegramChatId,
    telegramUsername: message.telegramUsername,
  };
}

function isPaidOrderStatus(status: unknown) {
  return PAID_ORDER_STATUSES.has(String(status || "").trim().toLowerCase());
}

function toPublicActivationError(error: unknown): TelegramActivationPayload {
  if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
    return {
      status: "pending",
      message: "Данные активации ещё готовятся. Попробуйте проверить заказ позже.",
    };
  }

  return {
    status: "error",
    message: "Не удалось получить данные активации. Попробуйте позже или напишите в поддержку.",
  };
}

function toRussianActivationReason(reason: unknown) {
  const text = String(reason || "").trim();
  const normalized = text.toLowerCase();
  if (!text) return "";
  if (normalized.includes("token is required")) return "токен не указан";
  if (normalized.includes("token is too long")) return "токен слишком длинный";
  if (normalized.includes("token json is invalid")) return "JSON токена некорректный";
  if (normalized.includes("does not include")) return "JSON не содержит accessToken, sessionToken или token";
  if (normalized.includes("token is expired")) return "срок действия токена истёк";
  if (normalized.includes("already bound")) return "заказ уже привязан к другому токену";
  if (normalized.includes("activation key is not issued yet")) return "ключ активации ещё не выдан";
  return text;
}

async function sendOrderStatusWithActivation(message: NonNullable<ReturnType<typeof extractTextMessage>>, orderId: string) {
  const ctx = buildOrderContext(message);
  const order = await telegramOrdersService.getOrderStatus({ ...ctx, orderId });
  let activation: TelegramActivationPayload | null = null;
  if (isPaidOrderStatus(order.status)) {
    try {
      activation = await ordersService.getActivationForTelegram(order.id, ctx.telegramUserId);
    } catch (error) {
      activation = toPublicActivationError(error);
    }
  }

  await telegramSender.sendLongTextMessage({
    telegramId: getSendTelegramId(message),
    text: buildTelegramOrderDetailsText({ order, activation }),
  });

  return order;
}

function buildStartHintText() {
  const accountUrl = `${String(env.APP_BASE_URL || "https://gptishka.shop").replace(/\/+$/, "")}/account.html`;
  return [
    "Привет! Это бот GPTishka.",
    "",
    "Чтобы привязать Telegram и получать напоминания о подписке:",
    "1) Войдите в личный кабинет",
    "2) Нажмите «Привязать Telegram»",
    "",
    accountUrl,
  ].join("\n");
}

export const telegramService = {
  async handleWebhookUpdate(update: any) {
    const message = extractTextMessage(update);
    if (!message) return { handled: false, reason: "no_text_message" };

    if (isCommand(message.text, "orders")) {
      const ctx = buildOrderContext(message);
      const orders = await telegramOrdersService.listOrders(ctx);
      await telegramSender.sendLongTextMessage({
        telegramId: getSendTelegramId(message),
        text: buildTelegramOrdersText(orders),
      });
      return { handled: true, action: "telegram_orders_listed" };
    }

    if (isCommand(message.text, "check")) {
      const orderId = parseCheckCommand(message.text);
      if (!orderId) {
        await telegramSender.sendTextMessage({
          telegramId: getSendTelegramId(message),
          text: "Формат команды: /check <orderId>",
        });
        return { handled: true, action: "telegram_order_check_bad_format" };
      }

      try {
        const order = await sendOrderStatusWithActivation(message, orderId);
        return { handled: true, action: "telegram_order_checked", orderId: order.id };
      } catch (error) {
        if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
          await telegramSender.sendTextMessage({
            telegramId: getSendTelegramId(message),
            text: "Заказ не найден среди ваших покупок. Проверьте номер заказа или откройте /orders.",
          });
          return { handled: true, action: "telegram_order_check_failed", reason: error.message };
        }
        throw error;
      }
    }

    if (isCommand(message.text, "token")) {
      const parsed = parseTokenCommand(message.text);
      if (!parsed) {
        await telegramSender.sendTextMessage({
          telegramId: getSendTelegramId(message),
          text: "Формат команды: /token <orderId> <clientToken>",
        });
        return { handled: true, action: "telegram_order_token_bad_format" };
      }

      const ctx = buildOrderContext(message);
      let verifiedOrderId: string | null = null;
      try {
        const order = await telegramOrdersService.getOrderStatus({ ...ctx, orderId: parsed.orderId });
        verifiedOrderId = order.id;
        if (!isPaidOrderStatus(order.status)) {
          await telegramSender.sendTextMessage({
            telegramId: getSendTelegramId(message),
            text: "Заказ ещё не оплачен. После оплаты проверьте его командой /check " + order.id + ".",
          });
          return { handled: true, action: "telegram_order_token_unpaid", orderId: order.id };
        }

        const validation = await ordersService.validateActivationTokenForTelegram(
          order.id,
          parsed.token,
          ctx.telegramUserId
        );
        if (!validation.ok) {
          const reason =
            (validation.reasons || []).map(toRussianActivationReason).filter(Boolean).join("; ") ||
            "токен не прошёл проверку";
          await telegramOrdersService.setOrderError({ orderId: order.id, error: reason });
          await telegramSender.sendTextMessage({
            telegramId: getSendTelegramId(message),
            text: "Токен не принят: " + reason,
          });
          return { handled: true, action: "telegram_order_token_rejected", orderId: order.id };
        }

        const result = await ordersService.startActivationForTelegram(order.id, parsed.token, ctx.telegramUserId);
        await telegramOrdersService.clearOrderError(order.id);
        await telegramSender.sendTextMessage({
          telegramId: getSendTelegramId(message),
          text: [
            "Токен принят.",
            "Активация запущена.",
            result?.taskId ? `Номер задачи: ${String(result.taskId)}` : "",
            "Статус можно проверить командой /check " + order.id + ".",
          ]
            .filter(Boolean)
            .join("\n"),
        });
        return { handled: true, action: "telegram_order_activation_started", orderId: order.id };
      } catch (error) {
        const publicMessage =
          error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500
            ? "Не удалось принять токен: " + toRussianActivationReason(error.message)
            : "Не удалось запустить активацию. Попробуйте позже или напишите в поддержку.";
        if (verifiedOrderId) {
          await telegramOrdersService.setOrderError({ orderId: verifiedOrderId, error: publicMessage });
        }
        await telegramSender.sendTextMessage({
          telegramId: getSendTelegramId(message),
          text: publicMessage,
        });
        if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
          return { handled: true, action: "telegram_order_token_failed", reason: error.message };
        }
        throw error;
      }
    }

    if (!isStartCommand(message.text)) {
      return { handled: false, reason: "not_start_command" };
    }

    const startPayload = extractStartPayload(message.text);
    if (!startPayload) {
      await telegramSender.sendTextMessage({
        telegramId: getSendTelegramId(message),
        text: buildStartHintText(),
      });
      return {
        handled: true,
        action: "telegram_start_without_payload",
      };
    }

    if (startPayload.startsWith("login_")) {
      const rawToken = startPayload.slice("login_".length).trim();
      if (!rawToken) {
        throw new AppError("Telegram login token is required", 400);
      }

      try {
        await accountService.approveTelegramAuthToken({
          rawToken,
          telegramId: getOwnerTelegramId(message),
          telegramUsername: message.telegramUsername,
          firstName: message.firstName,
        });

        await telegramSender.sendTextMessage({
          telegramId: getSendTelegramId(message),
          text: "Вход в личный кабинет подтвержден. Вернитесь на сайт, авторизация завершится автоматически.",
        });

        return {
          handled: true,
          action: "telegram_login_approved",
        };
      } catch (error) {
        await telegramSender.sendTextMessage({
          telegramId: getSendTelegramId(message),
          text:
            "Не удалось подтвердить вход. Возможно ссылка устарела или Telegram еще не привязан в кабинете. Запросите вход снова на сайте.",
        });

        if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
          return {
            handled: true,
            action: "telegram_login_failed",
            reason: error.message,
          };
        }

        throw error;
      }
    }

    const parsedSiteOrderPayload = parseSiteOrderStartPayload(startPayload);
    if (parsedSiteOrderPayload) {
      const ctx = buildOrderContext(message);
      try {
        const linked = await telegramOrdersService.linkSiteOrderToTelegram({
          ...ctx,
          startPayload: parsedSiteOrderPayload,
        });

        await telegramSender.sendTextMessage({
          telegramId: getSendTelegramId(message),
          text: buildTelegramLinkedOrderText(linked),
        });

        if (isPaidOrderStatus(linked.status)) {
          let activation: TelegramActivationPayload | null = null;
          try {
            activation = await ordersService.getActivationForTelegram(linked.id, ctx.telegramUserId);
          } catch (error) {
            activation = toPublicActivationError(error);
          }
          await telegramSender.sendLongTextMessage({
            telegramId: getSendTelegramId(message),
            text: buildTelegramOrderDetailsText({ order: linked, activation }),
          });
        }

        return {
          handled: true,
          action: "telegram_site_order_linked",
          orderId: linked.id,
        };
      } catch (error) {
        await telegramSender.sendTextMessage({
          telegramId: getSendTelegramId(message),
          text:
            "Не удалось привязать заказ к Telegram. Возможно ссылка устарела или заказ уже привязан к другому аккаунту.",
        });

        if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
          return {
            handled: true,
            action: "telegram_site_order_link_failed",
            reason: error.message,
          };
        }

        throw error;
      }
    }

    if (!startPayload.startsWith("link_")) {
      await telegramSender.sendTextMessage({
        telegramId: getSendTelegramId(message),
        text: "Ссылка для привязки не распознана. Запросите новую кнопку «Привязать Telegram» в личном кабинете.",
      });
      return {
        handled: true,
        action: "telegram_start_unsupported_payload",
      };
    }

    const rawToken = startPayload.slice("link_".length).trim();
    if (!rawToken) {
      throw new AppError("Telegram link token is required", 400);
    }

    try {
      const linked = await accountService.consumeTelegramLinkToken({
        rawToken,
        telegramId: getOwnerTelegramId(message),
        telegramUsername: message.telegramUsername,
        firstName: message.firstName,
      });

      await telegramSender.sendTextMessage({
        telegramId: getSendTelegramId(message),
        text: "Telegram успешно привязан к вашему кабинету GPTishka. Напоминания о подписке включены.",
      });

      return {
        handled: true,
        action: "telegram_linked",
        customerId: linked.customerId,
      };
    } catch (error) {
      await telegramSender.sendTextMessage({
        telegramId: getSendTelegramId(message),
        text: "Не удалось привязать Telegram. Возможно ссылка устарела. Запросите новую ссылку в личном кабинете.",
      });

      if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
        return {
          handled: true,
          action: "telegram_link_failed",
          reason: error.message,
        };
      }

      throw error;
    }
  },
};
