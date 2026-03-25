import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";

type LookupResponse = {
  customer: {
    id: string;
    email: string;
    locale: string;
    timezone: string;
    emailVerifiedAt: string | null;
    createdAt: string;
  } | null;
  eligibility: {
    hasPaidOrder: boolean;
    hasLinkedAccess: boolean;
    eligible: boolean;
  } | null;
  telegram: {
    isActive: boolean;
    telegramId: string;
    telegramIdMasked: string;
    telegramUsername: string | null;
    firstName: string | null;
    linkedAt: string | null;
    unlinkedAt: string | null;
    lastError: string | null;
    updatedAt: string;
  } | null;
  telegramEvents: Array<{
    id: string;
    type: string;
    status: string;
    attempts: number;
    lastError: string | null;
    sentAt: string | null;
    createdAt: string;
  }>;
  orders: Array<{
    id: string;
    email: string;
    status: string;
    totalAmount: string;
    currency: string;
    createdAt: string;
  }>;
  vpnAccesses: Array<{
    id: string;
    email: string | null;
    orderId: string | null;
    orderEmail: string | null;
    orderStatus: string | null;
    plan: string;
    source: string;
    status: string;
    daysLeft: number | null;
    expiresAt: string;
  }>;
};

function extractApiError(error: unknown, fallback: string) {
  const message =
    (error as any)?.response?.data?.message ||
    (error as any)?.response?.data?.error ||
    (error as any)?.message ||
    fallback;
  return String(message || fallback);
}

export default function AccountToolsPage() {
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupOrderId, setLookupOrderId] = useState("");
  const [lookupVpnAccessId, setLookupVpnAccessId] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicNext, setMagicNext] = useState("/account.html");
  const [linkOrderId, setLinkOrderId] = useState("");
  const [linkOrderEmail, setLinkOrderEmail] = useState("");
  const [linkOrderSyncOrder, setLinkOrderSyncOrder] = useState(false);
  const [linkOrderSyncVpn, setLinkOrderSyncVpn] = useState(true);
  const [linkVpnId, setLinkVpnId] = useState("");
  const [linkVpnEmail, setLinkVpnEmail] = useState("");
  const [linkVpnSyncOrder, setLinkVpnSyncOrder] = useState(false);
  const [telegramTestEmail, setTelegramTestEmail] = useState("");
  const [telegramTestMessage, setTelegramTestMessage] = useState("Тест Telegram-уведомления от GPTishka.");
  const [statusMessage, setStatusMessage] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);

  const lookupMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      if (lookupEmail.trim()) params.set("email", lookupEmail.trim());
      if (lookupOrderId.trim()) params.set("orderId", lookupOrderId.trim());
      if (lookupVpnAccessId.trim()) params.set("vpnAccessId", lookupVpnAccessId.trim());
      return (await api.get(`/account/lookup?${params.toString()}`)).data as LookupResponse;
    },
    onSuccess: (data) => {
      setLookupResult(data);
      setStatusMessage("Поиск выполнен");
    },
    onError: (error) => {
      setLookupResult(null);
      setStatusMessage(extractApiError(error, "Ошибка поиска"));
    },
  });

  const telegramTestMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/account/telegram/test-message", {
          email: telegramTestEmail,
          message: telegramTestMessage,
        })
      ).data,
    onSuccess: () => {
      setStatusMessage(`Тест Telegram отправлен: ${telegramTestEmail}`);
    },
    onError: (error) => {
      setStatusMessage(extractApiError(error, "Не удалось отправить Telegram тест"));
    },
  });

  const resendMagicMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/account/resend-magic-link", {
          email: magicEmail,
          next: magicNext || "/account.html",
        })
      ).data,
    onSuccess: (data) => {
      setStatusMessage(
        data?.sent
          ? `Ссылка отправлена: ${data.email}`
          : `SMTP не отправил письмо для ${data?.email || magicEmail}`
      );
    },
    onError: (error) => {
      setStatusMessage(extractApiError(error, "Не удалось отправить magic-link"));
    },
  });

  const linkOrderMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/account/link-order", {
          orderId: linkOrderId,
          email: linkOrderEmail,
          syncOrderEmail: linkOrderSyncOrder,
          syncVpnAccessEmail: linkOrderSyncVpn,
        })
      ).data,
    onSuccess: (data) => {
      setStatusMessage(
        `Привязка заказа ${data.orderId} выполнена. Обновлено VPN доступов: ${data.updatedVpnAccessCount}`
      );
    },
    onError: (error) => {
      setStatusMessage(extractApiError(error, "Не удалось привязать заказ"));
    },
  });

  const linkVpnMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/account/link-vpn-access", {
          vpnAccessId: linkVpnId,
          email: linkVpnEmail,
          syncOrderEmail: linkVpnSyncOrder,
        })
      ).data,
    onSuccess: (data) => {
      setStatusMessage(`VPN доступ ${data.vpnAccessId} привязан к ${data.email}`);
    },
    onError: (error) => {
      setStatusMessage(extractApiError(error, "Не удалось привязать VPN доступ"));
    },
  });

  const onLookup = (event: FormEvent) => {
    event.preventDefault();
    setStatusMessage("");
    lookupMutation.mutate();
  };

  const onResendMagic = (event: FormEvent) => {
    event.preventDefault();
    setStatusMessage("");
    resendMagicMutation.mutate();
  };

  const onLinkOrder = (event: FormEvent) => {
    event.preventDefault();
    setStatusMessage("");
    linkOrderMutation.mutate();
  };

  const onLinkVpn = (event: FormEvent) => {
    event.preventDefault();
    setStatusMessage("");
    linkVpnMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="text-lg font-bold">Клиентский кабинет: support tools</h2>
        <p className="mt-1 text-sm text-slate-500">
          Поиск клиента, ручная привязка подписки и повторная отправка ссылки входа.
        </p>
      </section>

      <section className="card p-4">
        <h3 className="text-base font-bold">Поиск клиента</h3>
        <form onSubmit={onLookup} className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            className="input"
            placeholder="Email"
            value={lookupEmail}
            onChange={(event) => setLookupEmail(event.target.value)}
          />
          <input
            className="input"
            placeholder="Order ID"
            value={lookupOrderId}
            onChange={(event) => setLookupOrderId(event.target.value)}
          />
          <input
            className="input"
            placeholder="VPN Access ID"
            value={lookupVpnAccessId}
            onChange={(event) => setLookupVpnAccessId(event.target.value)}
          />
          <button className="btn-primary md:col-span-3" disabled={lookupMutation.isPending}>
            {lookupMutation.isPending ? "Поиск..." : "Найти"}
          </button>
        </form>
      </section>

      {lookupResult && (
        <section className="card p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <div className="text-xs uppercase text-slate-500">Customer</div>
              <div className="mt-1 font-semibold">{lookupResult.customer?.email || "Не найден"}</div>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <div className="text-xs uppercase text-slate-500">Eligible</div>
              <div className="mt-1 font-semibold">{lookupResult.eligibility?.eligible ? "Да" : "Нет"}</div>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <div className="text-xs uppercase text-slate-500">Linked Access</div>
              <div className="mt-1 font-semibold">{lookupResult.eligibility?.hasLinkedAccess ? "Да" : "Нет"}</div>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800 md:col-span-3">
              <div className="text-xs uppercase text-slate-500">Telegram</div>
              <div className="mt-1 font-semibold">
                {lookupResult.telegram
                  ? `${lookupResult.telegram.isActive ? "Активен" : "Неактивен"} ${lookupResult.telegram.telegramUsername || lookupResult.telegram.telegramId || lookupResult.telegram.telegramIdMasked}`
                  : "Не привязан"}
              </div>
              {lookupResult.telegram?.lastError ? (
                <div className="mt-1 text-xs text-red-600">Ошибка: {lookupResult.telegram.lastError}</div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold">Заказы</div>
            <div className="mt-2 space-y-2 text-sm">
              {lookupResult.orders.length === 0 ? (
                <div className="rounded-xl bg-slate-100 p-3 text-slate-500 dark:bg-slate-800">Заказы не найдены</div>
              ) : (
                lookupResult.orders.map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    {item.id} - {item.status} - {item.totalAmount} {item.currency} - {item.email}
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold">VPN доступы</div>
            <div className="mt-2 space-y-2 text-sm">
              {lookupResult.vpnAccesses.length === 0 ? (
                <div className="rounded-xl bg-slate-100 p-3 text-slate-500 dark:bg-slate-800">Доступы не найдены</div>
              ) : (
                lookupResult.vpnAccesses.map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    {item.id} - {item.plan} - {item.status} - email: {item.email || "null"} - order: {item.orderId || "null"}
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold">Telegram notification events</div>
            <div className="mt-2 space-y-2 text-sm">
              {lookupResult.telegramEvents.length === 0 ? (
                <div className="rounded-xl bg-slate-100 p-3 text-slate-500 dark:bg-slate-800">События не найдены</div>
              ) : (
                lookupResult.telegramEvents.map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    {item.type} - {item.status} - attempts: {item.attempts}
                    {item.lastError ? ` - ${item.lastError}` : ""}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      <section className="card p-4">
        <h3 className="text-base font-bold">Повторная отправка magic-link</h3>
        <form onSubmit={onResendMagic} className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={magicEmail}
            onChange={(event) => setMagicEmail(event.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Next path"
            value={magicNext}
            onChange={(event) => setMagicNext(event.target.value)}
          />
          <button className="btn-primary md:col-span-2" disabled={resendMagicMutation.isPending}>
            {resendMagicMutation.isPending ? "Отправка..." : "Отправить ссылку входа"}
          </button>
        </form>
      </section>

      <section className="card p-4">
        <h3 className="text-base font-bold">Тест Telegram сообщения клиенту</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setStatusMessage("");
            telegramTestMutation.mutate();
          }}
          className="mt-3 grid gap-3 md:grid-cols-2"
        >
          <input
            className="input"
            type="email"
            placeholder="Email клиента"
            value={telegramTestEmail}
            onChange={(event) => setTelegramTestEmail(event.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Текст теста"
            value={telegramTestMessage}
            onChange={(event) => setTelegramTestMessage(event.target.value)}
          />
          <button className="btn-primary md:col-span-2" disabled={telegramTestMutation.isPending}>
            {telegramTestMutation.isPending ? "Отправка..." : "Отправить тест Telegram"}
          </button>
        </form>
      </section>

      <section className="card p-4">
        <h3 className="text-base font-bold">Привязка заказа к email</h3>
        <form onSubmit={onLinkOrder} className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            className="input"
            placeholder="Order ID"
            value={linkOrderId}
            onChange={(event) => setLinkOrderId(event.target.value)}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={linkOrderEmail}
            onChange={(event) => setLinkOrderEmail(event.target.value)}
            required
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={linkOrderSyncOrder} onChange={(e) => setLinkOrderSyncOrder(e.target.checked)} />
            Обновить email в самом заказе
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={linkOrderSyncVpn} onChange={(e) => setLinkOrderSyncVpn(e.target.checked)} />
            Обновить email во всех VPN доступах заказа
          </label>
          <button className="btn-primary md:col-span-2" disabled={linkOrderMutation.isPending}>
            {linkOrderMutation.isPending ? "Привязка..." : "Привязать заказ"}
          </button>
        </form>
      </section>

      <section className="card p-4">
        <h3 className="text-base font-bold">Привязка VPN доступа к email</h3>
        <form onSubmit={onLinkVpn} className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            className="input"
            placeholder="VPN Access ID"
            value={linkVpnId}
            onChange={(event) => setLinkVpnId(event.target.value)}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={linkVpnEmail}
            onChange={(event) => setLinkVpnEmail(event.target.value)}
            required
          />
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={linkVpnSyncOrder} onChange={(e) => setLinkVpnSyncOrder(e.target.checked)} />
            Если есть paid order, синхронизировать email в заказе
          </label>
          <button className="btn-primary md:col-span-2" disabled={linkVpnMutation.isPending}>
            {linkVpnMutation.isPending ? "Привязка..." : "Привязать VPN доступ"}
          </button>
        </form>
      </section>

      {statusMessage ? (
        <section className="card p-4 text-sm">
          <div className="font-semibold">Статус</div>
          <div className="mt-1 text-slate-600 dark:text-slate-300">{statusMessage}</div>
        </section>
      ) : null}
    </div>
  );
}

