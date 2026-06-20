import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api } from "../lib/api";
import { fmtDate, money } from "../lib/format";

function getCheckErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const payload = error.response?.data as Record<string, unknown> | undefined;
    const message = String(payload?.message || payload?.error || "").trim();
    if (message) return message;
    if (status === 401) return "Сессия истекла. Войдите в админку заново.";
    if (status === 403) return "Недостаточно прав для проверки активации.";
  }

  if (error instanceof Error && error.message) return error.message;
  return "Не удалось проверить активацию. Проверьте подключение к API.";
}

const SITE_RESOURCE_URL = "https://www.gptishka.shop/";
const TELEGRAM_RESOURCE_FALLBACK = {
  handle: "@GPTishka_myBot",
  url: "https://t.me/GPTishka_myBot",
  title: "Telegram",
} as const;
const TELEGRAM_RESOURCE_BY_BOT_TYPE: Record<string, { handle: string; url: string; title: string }> = {
  grok: { handle: "@grokaioffbot", url: "https://t.me/grokaioffbot", title: "Telegram Grok" },
  chatgpt: { handle: "@chatgptaioffbot", url: "https://t.me/chatgptaioffbot", title: "Telegram ChatGPT" },
  claude: { handle: "@claudeaioffibot", url: "https://t.me/claudeaioffibot", title: "Telegram Claude" },
};

function normalizePaymentChannel(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "gateway" || raw === "enot.io") return "enot";
  return raw;
}

function resolveSourceResource(order: any) {
  const source = String(order?.source || "site")
    .trim()
    .toLowerCase();
  const botType = String(order?.botType || "")
    .trim()
    .toLowerCase();
  if (source === "telegram") {
    return TELEGRAM_RESOURCE_BY_BOT_TYPE[botType] || TELEGRAM_RESOURCE_FALLBACK;
  }
  return { handle: SITE_RESOURCE_URL, url: SITE_RESOURCE_URL, title: "Website" };
}

function stringifyCheckoutValue(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  return String(value).trim();
}

function buildCheckoutDetailRows(details: any) {
  if (!details || typeof details !== "object") return [];
  const rows: Array<[string, string]> = [];
  const push = (label: string, value: unknown) => {
    const text = stringifyCheckoutValue(value);
    if (text) rows.push([label, text]);
  };
  const selection = details.selection || {};
  const contact = details.contact || {};
  const gift = details.gift || {};
  const account = details.account || {};
  const recommendation = details.recommendation || {};
  const hasAccountDetails = Boolean(
    stringifyCheckoutValue(account.status) || stringifyCheckoutValue(account.login) || stringifyCheckoutValue(account.password)
  );

  push("План", selection.plan);
  push("Доставка", selection.deliveryMethod);
  push("Длительность", selection.duration);
  push("Способ оплаты", selection.paymentMethod);
  push("Email", contact.email);
  push("Telegram", contact.telegram);
  push("Подарок", gift.isGift);
  if (gift.isGift) {
    push("Отправитель", gift.sender);
    push("Получатель", gift.recipient);
    push("Куда отправить", gift.deliveryMethod);
    push("Контакт получателя", gift.recipientContact);
    push("Дата отправки", gift.sendDate);
    push("Время отправки", gift.sendTime);
    push("Сообщение", gift.message);
    push("Дизайн", gift.certificateDesign);
  }
  if (hasAccountDetails) {
    push("Статус аккаунта", account.status);
    push("Логин", account.login);
    push("Пароль", account.password);
  }
  push("Пришёл по рекомендации", recommendation.cameByRecommendation);
  push("Кто пригласил", recommendation.referrerContact);
  push("Комментарий", details.comment);
  return rows;
}

const ACCOUNT_OPTIONS = [
  {
    value: "has_account",
    title: "Да, у клиента есть почта и пароль от ChatGPT",
    description: "Клиент обычно входит в ChatGPT через email и пароль.",
  },
  {
    value: "apple_id",
    title: "Да, клиент входит через Apple",
    description: "Клиент использует «Continue with Apple» / «Войти через Apple». Пароль от ChatGPT не нужен.",
  },
  {
    value: "create_new",
    title: "Нет, аккаунта ChatGPT у клиента нет",
    description: "Нужно создать новый аккаунт, используя указанную контактную почту.",
  },
] as const;

export default function OrdersPage() {
  const qc = useQueryClient();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [botType, setBotType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [clientInfoDialog, setClientInfoDialog] = useState<null | { orderId: string; details: any }>(null);
  const [showClientPassword, setShowClientPassword] = useState(false);
  const [tokenDialog, setTokenDialog] = useState<null | { orderId: string; token: string; storedAt: string | null; expiresAt: string | null }>(
    null
  );

  const params = useMemo(
    () => ({
      page: 1,
      limit: 100,
      q,
      status: status || undefined,
      source: source || undefined,
      botType: botType || undefined,
      paymentMethod: paymentMethod || undefined,
    }),
    [q, status, source, botType, paymentMethod]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [qInput]);

  const orders = useQuery({
    queryKey: ["orders", params],
    queryFn: async () => (await api.get("/orders", { params })).data,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  const refund = useMutation({
    mutationFn: (id: string) => api.post(`/orders/${id}/refund`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  const completeActivation = useMutation({
    mutationFn: (id: string) => api.post(`/orders/${id}/activation/manual-complete`),
    onMutate: (id: string) => {
      setCheckMessage(`Отмечаем активацию выполненной для заказа ${id}...`);
    },
    onSuccess: () => {
      setCheckMessage("Активация отмечена как выполненная");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error: unknown) => {
      setCheckMessage(getCheckErrorMessage(error));
    },
  });

  const checkActivation = useMutation({
    mutationFn: async (id: string) => (await api.get(`/orders/${id}/activation-proof`, { params: { forceCheck: 1 } })).data,
    onMutate: (id: string) => {
      setCheckMessage(`Проверяем активацию для заказа ${id}...`);
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      const certaintyCode = String(data?.certainty?.code || "");
      const certaintyLabel =
        certaintyCode === "ACTIVATED_CONFIRMED_PROVIDER"
          ? "Активация подтверждена провайдером"
          : certaintyCode === "ACTIVATION_FAILED"
          ? "Провайдер вернул ошибку активации"
          : certaintyCode === "ACTIVATION_IN_PROGRESS"
          ? "Активация в обработке"
          : certaintyCode === "ACTIVATION_UNCONFIRMED"
          ? "Активация не запущена или не подтверждена"
          : "Проверка активации завершена";
      const providerMessage = String(data?.activation?.lastProviderMessage || "").trim();
      setCheckMessage(providerMessage ? `${certaintyLabel}. ${providerMessage}` : certaintyLabel);
    },
    onError: (error: unknown) => {
      setCheckMessage(getCheckErrorMessage(error));
    },
  });

  const readActivationToken = useMutation({
    mutationFn: async (id: string) => (await api.get(`/orders/${id}/activation-token`)).data,
    onMutate: (id: string) => {
      setCheckMessage(`Загружаем токен клиента для заказа ${id}...`);
    },
    onSuccess: (data: any) => {
      const token = String(data?.token || "");
      setTokenDialog({
        orderId: String(data?.orderId || ""),
        token,
        storedAt: data?.storedAt ? String(data.storedAt) : null,
        expiresAt: data?.expiresAt ? String(data.expiresAt) : null,
      });
      setCheckMessage("Токен клиента загружен");
    },
    onError: (error: unknown) => {
      setCheckMessage(getCheckErrorMessage(error));
    },
  });

  async function copyTokenFromDialog() {
    if (!tokenDialog?.token) return;
    try {
      await navigator.clipboard.writeText(tokenDialog.token);
      setCheckMessage("Токен скопирован в буфер обмена");
    } catch {
      setCheckMessage("Не удалось скопировать токен");
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-sm"
          value={qInput}
          placeholder="Поиск: order id / email / payment id / telegram"
          onChange={(e) => setQInput(e.target.value)}
        />
        <select className="input max-w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="PENDING">PENDING</option>
          <option value="PAID">PAID</option>
          <option value="FAILED">FAILED</option>
          <option value="REFUNDED">REFUNDED</option>
        </select>
        <select className="input max-w-40" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Источник: все</option>
          <option value="site">site</option>
          <option value="telegram">telegram</option>
        </select>
        <select className="input max-w-40" value={botType} onChange={(e) => setBotType(e.target.value)}>
          <option value="">Бот: все</option>
          <option value="claude">claude</option>
          <option value="chatgpt">chatgpt</option>
          <option value="grok">grok</option>
        </select>
        <select className="input max-w-40" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="">Оплата: все</option>
          <option value="enot">enot</option>
          <option value="lava">lava</option>
          <option value="gateway">gateway (legacy)</option>
        </select>
        <a className="btn-secondary" href={`${(import.meta.env.VITE_ADMIN_API_URL || "/api/admin")}/orders/export/csv`}>
          Экспорт CSV
        </a>
        {checkMessage ? (
          <div className={`basis-full text-sm ${checkActivation.isError ? "text-rose-600" : "text-slate-600 dark:text-slate-300"}`}>
            {checkMessage}
          </div>
        ) : null}
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Заказ</th>
                <th className="px-4 py-3">Источник / ресурс</th>
                <th className="px-4 py-3">Покупатель</th>
                <th className="px-4 py-3">Что купили</th>
                <th className="px-4 py-3">Данные клиента</th>
                <th className="px-4 py-3">Сумма</th>
                <th className="px-4 py-3">Оплата</th>
                <th className="px-4 py-3">Промокод</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Активация</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(orders.data?.items || []).map((o: any) => {
                const tokenValidationAttempts = Number(o.activation?.tokenValidationAttempts || 0);
                const hasRepeatedTokenInput = tokenValidationAttempts > 1;
                const sourceResource = resolveSourceResource(o);
                const sourceCode = String(o.source || "site")
                  .trim()
                  .toLowerCase();
                const paymentMethodSelected = normalizePaymentChannel(o.paymentMethodRequested || o.paymentMethod);
                const paymentProviderUsed = normalizePaymentChannel(o.paymentProvider || o.paymentProviderRaw);
                const checkoutDetails = o.checkoutDetails || o.orderDetails;
                const checkoutDetailRows = buildCheckoutDetailRows(checkoutDetails);
                const clientPreviewRows = checkoutDetailRows
                  .filter(([label]) => ["Email", "Telegram", "Логин", "Пароль", "Статус аккаунта"].includes(label))
                  .slice(0, 4);
                const isSuccessfullyPaid = String(o.status || "").toUpperCase() === "PAID" && String(o.paymentStatus || "").toUpperCase() === "SUCCESS";

                return (
                <tr className="border-t border-slate-200 dark:border-slate-800" key={o.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{o.id}</div>
                    <div className="text-xs text-slate-500">{fmtDate(o.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs leading-5">
                      <div className="font-semibold">{sourceResource.title}</div>
                      <a className="text-cyan-700 underline" href={sourceResource.url} target="_blank" rel="noreferrer">
                        {sourceResource.handle}
                      </a>
                      <div className="text-slate-500">
                        {sourceCode}
                        {o.botType ? ` / ${o.botType}` : ""}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs leading-5">
                      <div>{o.email}</div>
                      {o.telegramUserId ? <div className="text-slate-500">id: {o.telegramUserId}</div> : null}
                      {o.telegramUsername ? <div className="text-slate-500">@{o.telegramUsername}</div> : null}
                      {o.telegramUserId ? (
                        <a className="text-cyan-700 underline" href={`tg://user?id=${o.telegramUserId}`}>
                          Открыть чат
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs leading-5">
                      <div className="font-semibold">{o.product?.title || "-"}</div>
                      <div className="text-slate-500">{o.product?.slug || o.product?.id || "-"}</div>
                      <div className="text-slate-500">
                        qty: {Number(o.product?.quantity || 1)}
                        {o.product?.unitPrice !== null && o.product?.unitPrice !== undefined
                          ? ` x ${money(Number(o.product.unitPrice), o.currency)}`
                          : ""}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isSuccessfullyPaid && checkoutDetailRows.length ? (
                      <div className="min-w-56 text-xs leading-5">
                        <div className="mb-2 rounded border border-cyan-200 bg-cyan-50 p-2 dark:border-cyan-900/60 dark:bg-cyan-950/30">
                          <div className="font-semibold text-cyan-800 dark:text-cyan-200">Оплачено · форма сохранена</div>
                          <dl className="mt-1 space-y-1">
                            {clientPreviewRows.map(([label, value]) => (
                              <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2" key={`${label}:${value}`}>
                                <dt className="text-slate-500">{label}</dt>
                                <dd className="break-words font-medium">{label === "Пароль" ? "••••••••" : value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setShowClientPassword(false);
                            setClientInfoDialog({ orderId: o.id, details: checkoutDetails });
                          }}
                        >
                          Смотреть данные клиента
                        </button>
                      </div>
                    ) : isSuccessfullyPaid ? (
                      <div className="text-xs font-medium text-amber-700 dark:text-amber-300">Оплачено, но данные формы не сохранены</div>
                    ) : (
                      <div className="text-xs text-slate-500">Доступно после успешной оплаты</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{money(Number(o.totalAmount), o.currency)}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs leading-5">
                      <div className="font-semibold">{o.paymentStatus || "-"}</div>
                      <div className="text-slate-500">method: {paymentMethodSelected || "-"}</div>
                      <div className="text-slate-500">provider: {paymentProviderUsed || "-"}</div>
                      {o.paymentRef ? <div className="text-slate-400">ref: {String(o.paymentRef)}</div> : null}
                      {o.paidAt ? <div className="text-slate-400">paid: {fmtDate(o.paidAt)}</div> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{o.promoCodeSnapshot || "-"}</td>
                  <td className="px-4 py-3">{o.status}</td>
                  <td className="px-4 py-3">
                    {o.activation ? (
                      <div className="text-xs leading-5">
                        <div className="font-semibold">{o.activation.status}</div>
                        <div className="text-slate-500">{o.activation.verificationState || "unknown"}</div>
                        <div className="text-slate-500">
                          token: {o.activation.tokenBound ? "bound" : o.activation.tokenSeen ? "entered" : "missing"}
                        </div>
                        <div className="text-slate-500">stored token: {o.activation.tokenStored ? "yes" : "no"}</div>
                        <div className={`text-slate-500 ${hasRepeatedTokenInput ? "font-semibold text-amber-700" : ""}`}>
                          token input:{" "}
                          {hasRepeatedTokenInput ? `repeated (${tokenValidationAttempts}x)` : tokenValidationAttempts === 1 ? "single" : "none"}
                        </div>
                        <div className="text-slate-500">validations: {tokenValidationAttempts}</div>
                        <div className="text-slate-500">attempts: {Number(o.activation.attempts || 0)} / 3</div>
                        {o.activation.lastTokenValidatedAt ? (
                          <div className="text-slate-400">token seen: {fmtDate(o.activation.lastTokenValidatedAt)}</div>
                        ) : null}
                        {o.activation.tokenExpiresAt ? (
                          <div className="text-slate-400">token expires: {fmtDate(o.activation.tokenExpiresAt)}</div>
                        ) : null}
                        {o.activation.taskId ? <div className="text-slate-400">task: {String(o.activation.taskId)}</div> : null}
                        {o.activation.lastProviderCheckedAt ? (
                          <div className="text-slate-400">{fmtDate(o.activation.lastProviderCheckedAt)}</div>
                        ) : null}
                        {o.activation.completedAt ? <div className="text-slate-400">done: {fmtDate(o.activation.completedAt)}</div> : null}
                        {o.telegramLastError ? <div className="text-rose-600">error: {o.telegramLastError}</div> : null}
                      </div>
                    ) : (
                      <div className="text-xs leading-5">
                        <div>-</div>
                        {o.telegramLastError ? <div className="text-rose-600">error: {o.telegramLastError}</div> : null}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" onClick={() => checkActivation.mutate(o.id)} disabled={checkActivation.isPending}>
                        {checkActivation.isPending && checkActivation.variables === o.id ? "Проверяем..." : "Проверить активацию"}
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => readActivationToken.mutate(o.id)}
                        disabled={readActivationToken.isPending}
                      >
                        {readActivationToken.isPending && readActivationToken.variables === o.id ? "Загружаем..." : "Токен клиента"}
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => completeActivation.mutate(o.id)}
                        disabled={completeActivation.isPending || String(o.activation?.status || "").toLowerCase() === "success"}
                      >
                        {completeActivation.isPending && completeActivation.variables === o.id ? "Сохраняем..." : "Отметить активированным"}
                      </button>
                      <button className="btn-secondary" onClick={() => patch.mutate({ id: o.id, status: "PAID" })}>
                        Отметить оплаченным
                      </button>
                      <button className="btn-secondary" onClick={() => patch.mutate({ id: o.id, status: "FAILED" })}>
                        Отметить как ошибка
                      </button>
                      <button className="btn-secondary" onClick={() => refund.mutate(o.id)}>
                        Возврат
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {clientInfoDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0 px-5 pt-5">
                <div className="text-lg font-semibold">Данные клиента</div>
                <div className="break-words text-xs text-slate-500">Заказ {clientInfoDialog.orderId}</div>
              </div>
              <button className="btn-secondary mr-5 mt-5" onClick={() => setClientInfoDialog(null)}>
                Закрыть
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-semibold">Контакты</h3>
                <p className="mb-3 text-xs text-slate-500">Для статуса заказа и связи</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="font-medium">Почта</div>
                    <div className="text-xs text-slate-500">Нужна для связи по заказу</div>
                    <div className="mt-2 break-words font-semibold">{clientInfoDialog.details?.contact?.email || "Не указана"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="font-medium">Telegram</div>
                    <div className="text-xs text-slate-500">Ник с @</div>
                    <div className="mt-2 break-words font-semibold">{clientInfoDialog.details?.contact?.telegram || "Не указан"}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-semibold">Данные для подключения</h3>
                <p className="mb-3 text-xs text-slate-500">Заполнены по выбранному клиентом способу</p>
                <div className="mb-2 font-medium">У клиента уже есть аккаунт ChatGPT?</div>
                <div className="space-y-2">
                  {ACCOUNT_OPTIONS.map((option) => {
                    const selected = String(clientInfoDialog.details?.account?.status || "") === option.value;
                    return (
                      <div
                        className={`rounded-xl border p-3 ${
                          selected
                            ? "border-cyan-500 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/40"
                            : "border-slate-200 opacity-60 dark:border-slate-700"
                        }`}
                        key={option.value}
                      >
                        <div className="flex gap-2">
                          <span className="font-semibold">{selected ? "●" : "○"}</span>
                          <div>
                            <div className="font-semibold">{option.title}</div>
                            <div className="text-xs text-slate-500">{option.description}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {String(clientInfoDialog.details?.account?.status || "") !== "create_new" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div className="font-medium">Почта или логин ChatGPT</div>
                      <div className="text-xs text-slate-500">Нужен для подключения</div>
                      <div className="mt-2 break-words font-semibold">{clientInfoDialog.details?.account?.login || "Не указан"}</div>
                    </div>
                    {String(clientInfoDialog.details?.account?.status || "") === "has_account" ? (
                      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <div className="font-medium">Пароль от ChatGPT</div>
                        <div className="text-xs text-slate-500">Указан клиентом перед оплатой</div>
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          <div className="min-w-0 flex-1 break-all font-semibold">
                            {showClientPassword ? clientInfoDialog.details?.account?.password || "Не указан" : "••••••••••••"}
                          </div>
                          <button className="btn-secondary" onClick={() => setShowClientPassword((current) => !current)}>
                            {showClientPassword ? "Скрыть" : "Показать"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-100">
                    (!) При создании нового аккаунта будет использоваться указанная выше почта
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-semibold">Дополнительно</h3>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="font-semibold">Оформить в подарок: {clientInfoDialog.details?.gift?.isGift ? "Да" : "Нет"}</div>
                    {clientInfoDialog.details?.gift?.isGift ? (
                      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div><dt className="text-xs text-slate-500">Отправитель</dt><dd>{clientInfoDialog.details.gift.sender || "Не указан"}</dd></div>
                        <div><dt className="text-xs text-slate-500">Получатель</dt><dd>{clientInfoDialog.details.gift.recipient || "Не указан"}</dd></div>
                        <div><dt className="text-xs text-slate-500">Контакт получателя</dt><dd>{clientInfoDialog.details.gift.recipientContact || "Не указан"}</dd></div>
                        <div><dt className="text-xs text-slate-500">Дата и время</dt><dd>{[clientInfoDialog.details.gift.sendDate, clientInfoDialog.details.gift.sendTime].filter(Boolean).join(" ") || "Не указаны"}</dd></div>
                        <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Сообщение</dt><dd>{clientInfoDialog.details.gift.message || "Не указано"}</dd></div>
                      </dl>
                    ) : null}
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="font-semibold">
                      Пришёл по рекомендации: {clientInfoDialog.details?.recommendation?.cameByRecommendation ? "Да" : "Нет"}
                    </div>
                    {clientInfoDialog.details?.recommendation?.cameByRecommendation ? (
                      <div className="mt-1 break-words text-slate-600 dark:text-slate-300">
                        Кто пригласил: {clientInfoDialog.details.recommendation.referrerContact || "Не указан"}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="font-semibold">Комментарий к заказу</div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300">
                      {clientInfoDialog.details?.comment || "Комментарий не оставлен"}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
      {tokenDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Токен клиента · {tokenDialog.orderId}</div>
              <button className="btn-secondary" onClick={() => setTokenDialog(null)}>
                Закрыть
              </button>
            </div>
            <div className="mb-2 text-xs text-slate-500">
              {tokenDialog.storedAt ? `Сохранен: ${fmtDate(tokenDialog.storedAt)}.` : ""}
              {tokenDialog.expiresAt ? ` Истекает: ${fmtDate(tokenDialog.expiresAt)}.` : ""}
            </div>
            <textarea className="input min-h-40 w-full font-mono text-xs" value={tokenDialog.token} readOnly />
            <div className="mt-3 flex gap-2">
              <button className="btn-secondary" onClick={copyTokenFromDialog}>
                Скопировать
              </button>
              <button className="btn-secondary" onClick={() => setTokenDialog(null)}>
                Готово
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
