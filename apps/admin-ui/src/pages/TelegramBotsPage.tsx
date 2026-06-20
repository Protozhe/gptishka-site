import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const BOT_OPTIONS = ["all", "claude", "chatgpt", "grok"] as const;

type BotOption = (typeof BOT_OPTIONS)[number];

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("ru-RU") : "-";
}
function fmtMoney(amount: number | string | null | undefined, currency = "RUB") {
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
function eventData(e: any) {
  if (e.callbackData || e.messageText) return e.callbackData || e.messageText;
  if (!e.meta) return "";
  try {
    return JSON.stringify(e.meta);
  } catch {
    return String(e.meta || "");
  }
}

export default function TelegramBotsPage() {
  const [botType, setBotType] = useState<BotOption>("all");
  const [days, setDays] = useState(7);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const queryParams = useMemo(() => {
    const q = new URLSearchParams();
    q.set("days", String(days));
    if (botType !== "all") q.set("botType", botType);
    return q.toString();
  }, [botType, days]);

  const overview = useQuery({
    queryKey: ["tg-bots-overview", botType, days],
    queryFn: async () => (await api.get(`/telegram-bots/overview?${queryParams}`)).data,
  });

  const events = useQuery({
    queryKey: ["tg-bots-events", botType],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("limit", "100");
      if (botType !== "all") q.set("botType", botType);
      return (await api.get(`/telegram-bots/events?${q.toString()}`)).data as { items: any[] };
    },
  });

  const users = useQuery({
    queryKey: ["tg-bots-users", botType, days],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("limit", "200");
      q.set("days", String(days));
      if (botType !== "all") q.set("botType", botType);
      return (await api.get(`/telegram-bots/users?${q.toString()}`)).data as { items: any[] };
    },
  });

  const timeline = useQuery({
    enabled: Boolean(selectedUserId),
    queryKey: ["tg-bots-user-timeline", botType, selectedUserId],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set("limit", "100");
      q.set("telegramUserId", selectedUserId);
      if (botType !== "all") q.set("botType", botType);
      return (await api.get(`/telegram-bots/user-timeline?${q.toString()}`)).data as { items: any[] };
    },
  });

  return (
    <section className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Telegram Bots Monitor</h2>
          <select className="input max-w-[180px]" value={botType} onChange={(e) => setBotType(e.target.value as BotOption)}>
            {BOT_OPTIONS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select className="input max-w-[140px]" value={days} onChange={(e) => setDays(Number(e.target.value || 7))}>
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-slate-500">Events</div><div className="text-2xl font-bold">{overview.data?.totalEvents ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">Unique users</div><div className="text-2xl font-bold">{overview.data?.uniqueUsers ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">Range</div><div className="text-2xl font-bold">{overview.data?.rangeDays ?? days}d</div></div>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 font-semibold">Client Funnel</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div><div className="text-xs text-slate-500">Start</div><div className="text-xl font-bold">{overview.data?.funnel?.start ?? 0}</div></div>
          <div><div className="text-xs text-slate-500">Buy intent</div><div className="text-xl font-bold">{overview.data?.funnel?.buyIntent ?? 0}</div></div>
          <div><div className="text-xs text-slate-500">Order created</div><div className="text-xl font-bold">{overview.data?.funnel?.orderCreated ?? 0}</div></div>
          <div><div className="text-xs text-slate-500">Payment confirmed</div><div className="text-xl font-bold">{overview.data?.funnel?.paymentConfirmed ?? 0}</div></div>
          <div><div className="text-xs text-slate-500">Activation success</div><div className="text-xl font-bold text-emerald-700">{overview.data?.funnel?.activationSuccess ?? 0}</div></div>
          <div><div className="text-xs text-slate-500">Activation failed</div><div className="text-xl font-bold text-rose-700">{overview.data?.funnel?.activationFailed ?? 0}</div></div>
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <h3 className="mb-2 font-semibold">Users Activity</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3">User</th><th className="py-2 pr-3">Events</th><th className="py-2 pr-3">Orders</th><th className="py-2 pr-3">Paid</th><th className="py-2 pr-3">Success</th><th className="py-2 pr-3">Failed</th><th className="py-2 pr-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {(users.data?.items || []).map((u: any) => (
              <tr
                key={u.telegramUserId}
                className={`border-b align-top cursor-pointer ${selectedUserId === u.telegramUserId ? "bg-slate-50" : ""}`}
                onClick={() => setSelectedUserId(String(u.telegramUserId))}
              >
                <td className="py-2 pr-3">{u.telegramUsername ? `@${u.telegramUsername}` : u.telegramUserId}</td>
                <td className="py-2 pr-3">{u.events}</td>
                <td className="py-2 pr-3">{u.orderCreated}</td>
                <td className="py-2 pr-3">{u.paymentConfirmed}</td>
                <td className="py-2 pr-3 text-emerald-700">{u.activationSuccess}</td>
                <td className="py-2 pr-3 text-rose-700">{u.activationFailed}</td>
                <td className="py-2 pr-3">{fmtDate(u.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4 overflow-x-auto">
        <h3 className="mb-2 font-semibold">User Timeline {selectedUserId ? `(${selectedUserId})` : ""}</h3>
        {!selectedUserId ? <div className="text-sm text-slate-500">Select a user in Users Activity table.</div> : null}
        {selectedUserId ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Order</th><th className="py-2 pr-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {(timeline.data?.items || []).map((e: any) => (
                <tr key={e.id} className="border-b align-top">
                  <td className="py-2 pr-3">{fmtDate(e.createdAt)}</td>
                  <td className="py-2 pr-3">{e.eventType}</td>
                  <td className="py-2 pr-3">{e.orderId || "-"}</td>
                  <td className="py-2 pr-3 text-xs">{eventData(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="card p-4 overflow-x-auto">
        <h3 className="mb-2 font-semibold">Recent Telegram Orders</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Order</th><th className="py-2 pr-3">Bot</th><th className="py-2 pr-3">User</th><th className="py-2 pr-3">Product</th><th className="py-2 pr-3">Amount</th><th className="py-2 pr-3">Promo</th><th className="py-2 pr-3">Payment</th><th className="py-2 pr-3">Activation</th><th className="py-2 pr-3">CDK</th><th className="py-2 pr-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {(overview.data?.recentOrders || []).map((row: any) => (
              <tr key={row.id} className="border-b align-top">
                <td className="py-2 pr-3">{row.id}<div className="text-xs text-slate-500">{row.status}</div></td>
                <td className="py-2 pr-3">{row.botType || "-"}</td>
                <td className="py-2 pr-3">{row.telegramUsername ? `@${row.telegramUsername}` : row.telegramUserId || "-"}</td>
                <td className="py-2 pr-3">{row.productTitle || "-"}</td>
                <td className="py-2 pr-3">{fmtMoney(row.totalAmount, row.currency || "RUB")}</td>
                <td className="py-2 pr-3">
                  {row.promoCode || "-"}
                  {Number(row.discountAmount || 0) > 0 ? <div className="text-xs text-emerald-700">-{fmtMoney(row.discountAmount, row.currency || "RUB")}</div> : null}
                </td>
                <td className="py-2 pr-3">{row.paymentStatus || "-"}<div className="text-xs text-slate-500">{row.paymentProvider || ""}</div></td>
                <td className="py-2 pr-3">{row.activationStatus || "-"}<div className="text-xs text-rose-600">{row.telegramLastError || row.activationMessage || ""}</div></td>
                <td className="py-2 pr-3 font-mono text-xs">{row.activationCdk || "-"}</td>
                <td className="py-2 pr-3">{fmtDate(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4 overflow-x-auto">
        <h3 className="mb-2 font-semibold">Recent Bot Events</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Bot</th><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">User</th><th className="py-2 pr-3">Order</th><th className="py-2 pr-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {(events.data?.items || []).map((e: any) => (
              <tr key={e.id} className="border-b align-top">
                <td className="py-2 pr-3">{fmtDate(e.createdAt)}</td>
                <td className="py-2 pr-3">{e.botType}</td>
                <td className="py-2 pr-3">{e.eventType}</td>
                <td className="py-2 pr-3">{e.telegramUsername ? `@${e.telegramUsername}` : e.telegramUserId || "-"}</td>
                <td className="py-2 pr-3">{e.orderId || "-"}</td>
                <td className="py-2 pr-3 text-xs">{eventData(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
