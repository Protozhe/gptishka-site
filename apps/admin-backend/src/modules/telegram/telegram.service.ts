import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { accountService } from "../account/account.service";
import { activationReviewsStore } from "../orders/activation-reviews.store";
import { parseActivationReviewModerationCallback } from "../orders/activation-review-moderation";
import {
  answerTelegramCallbackQuery,
  editTelegramNotification,
} from "../notifications/notifications.service";
import { telegramSender } from "./telegram.sender";

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
    const callbackQuery = update?.callback_query;
    if (callbackQuery && typeof callbackQuery === "object") {
      const callbackId = String(callbackQuery.id || "").trim();
      const callbackData = String(callbackQuery.data || "").trim();
      const moderation = parseActivationReviewModerationCallback(callbackData);
      if (!moderation) return { handled: false, reason: "unsupported_callback" };

      const callbackChatId = String(callbackQuery.message?.chat?.id || "").trim();
      const adminChatId = String(env.TELEGRAM_CHAT_ID || "").trim();
      if (!adminChatId || callbackChatId !== adminChatId) {
        await answerTelegramCallbackQuery(callbackId, "Эта кнопка доступна только администратору").catch(() => undefined);
        return { handled: true, action: "activation_review_moderation_denied" };
      }

      const { decision, publicId } = moderation;
      const moderator = String(
        callbackQuery.from?.username || callbackQuery.from?.id || callbackChatId
      ).trim();
      const result = await activationReviewsStore.moderate(publicId, decision, moderator);
      if (!result) {
        await answerTelegramCallbackQuery(callbackId, "Отзыв не найден").catch(() => undefined);
        return { handled: true, action: "activation_review_not_found", reviewId: publicId };
      }

      const approved = result.review.moderationStatus === "approved";
      const statusText = approved ? "✅ ОДОБРЕН И ОПУБЛИКОВАН" : "❌ ОТКЛОНЁН";
      const originalText = String(callbackQuery.message?.text || "⭐ Отзыв").trim();
      const cleanText = originalText.replace(/\n\n(?:✅ ОДОБРЕН И ОПУБЛИКОВАН|❌ ОТКЛОНЁН).*$/s, "");
      const messageId = Number(callbackQuery.message?.message_id || 0);
      await Promise.all([
        answerTelegramCallbackQuery(
          callbackId,
          result.changed
            ? (approved ? "Отзыв опубликован" : "Отзыв отклонён")
            : "Отзыв уже обработан"
        ).catch(() => undefined),
        editTelegramNotification({
          chatId: callbackChatId,
          messageId,
          text: `${cleanText}\n\n${statusText}`,
        }).catch((error) => {
          console.error(`[activation-review] failed to update moderation message review=${publicId}`, error);
        }),
      ]);

      return {
        handled: true,
        action: approved ? "activation_review_approved" : "activation_review_rejected",
        reviewId: publicId,
        changed: result.changed,
      };
    }

    const message = extractTextMessage(update);
    if (!message) return { handled: false, reason: "no_text_message" };

    if (!isStartCommand(message.text)) {
      return { handled: false, reason: "not_start_command" };
    }

    const startPayload = extractStartPayload(message.text);
    if (!startPayload) {
      await telegramSender.sendTextMessage({
        telegramId: message.telegramId || message.chatId,
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
          telegramId: message.telegramId || message.chatId,
          telegramUsername: message.telegramUsername,
          firstName: message.firstName,
        });

        await telegramSender.sendTextMessage({
          telegramId: message.telegramId || message.chatId,
          text: "Вход в личный кабинет подтвержден. Вернитесь на сайт, авторизация завершится автоматически.",
        });

        return {
          handled: true,
          action: "telegram_login_approved",
        };
      } catch (error) {
        await telegramSender.sendTextMessage({
          telegramId: message.telegramId || message.chatId,
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

    if (!startPayload.startsWith("link_")) {
      await telegramSender.sendTextMessage({
        telegramId: message.telegramId || message.chatId,
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
        telegramId: message.telegramId || message.chatId,
        telegramUsername: message.telegramUsername,
        firstName: message.firstName,
      });

      await telegramSender.sendTextMessage({
        telegramId: linked.telegramId,
        text: "Telegram успешно привязан к вашему кабинету GPTishka. Напоминания о подписке включены.",
      });

      return {
        handled: true,
        action: "telegram_linked",
        customerId: linked.customerId,
      };
    } catch (error) {
      await telegramSender.sendTextMessage({
        telegramId: message.telegramId || message.chatId,
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
