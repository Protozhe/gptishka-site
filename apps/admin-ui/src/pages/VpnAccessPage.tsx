import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";

type VpnAccessItem = {
  id: string;
  email: string;
  telegramId: string;
  orderId: string;
  orderStatus: string;
  orderAmount: string;
  orderCurrency: string;
  paymentMethod: string;
  paymentProvider: string;
  paymentRef: string;
  paymentStatus: string;
  productTitle: string;
  uuid: string;
  accessLink: string;
  plan: string;
  source: string;
  serverId: string;
  expiresAt: string;
  isActive: string;
  trafficUsedBytes: string;
  createdAt: string;
  updatedAt: string;
};

type VpnListResponse = {
  items: VpnAccessItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function bytesToHuman(input: string) {
  const value = Number(input || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 || index === 0 ? 0 : 2)} ${units[index]}`;
}

function isActiveRow(item: VpnAccessItem) {
  if (String(item.isActive) !== "true") return false;
  const expiresAt = new Date(item.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export default function VpnAccessPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");

  const params = useMemo(() => ({ page, limit: 50, q, active }), [page, q, active]);

  const listQuery = useQuery({
    queryKey: ["vpn-access", params],
    queryFn: async () => (await api.get<VpnListResponse>("/vpn/list", { params })).data,
    placeholderData: (previousData) => previousData,
  });

  const reload = () => qc.invalidateQueries({ queryKey: ["vpn-access"] });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/vpn/${id}/revoke`, { reason: "revoked_by_admin" }),
    onSuccess: () => {
      setMessage("Доступ отключен");
      reload();
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/vpn/${id}/regenerate`, { reason: "regenerated_by_admin" }),
    onSuccess: () => {
      setMessage("Ключ пересоздан");
      reload();
    },
  });

  const syncTrafficMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/vpn/${id}/sync-traffic`),
    onSuccess: () => {
      setMessage("Трафик синхронизирован");
      reload();
    },
  });

  const setExpiryMutation = useMutation({
    mutationFn: async ({ id, expiresAt }: { id: string; expiresAt: string }) =>
      api.patch(`/vpn/${id}/expiry`, { expiresAt, reason: "expiry_updated_by_admin" }),
    onSuccess: () => {
      setMessage("Срок обновлен");
      reload();
    },
  });

  const syncExpiredMutation = useMutation({
    mutationFn: async () => api.post("/vpn/sync-expired", { limit: 200 }),
    onSuccess: (response) => {
      const payload = response.data as { disabled?: number; failed?: number; checked?: number };
      setMessage(
        `Обработка истекших: checked=${Number(payload?.checked || 0)}, disabled=${Number(payload?.disabled || 0)}, failed=${Number(payload?.failed || 0)}`
      );
      reload();
    },
  });

  function askAndSetExpiry(item: VpnAccessItem) {
    const currentIso = String(item.expiresAt || "");
    const current = currentIso ? new Date(currentIso).toISOString().slice(0, 16) : "";
    const value = window.prompt("Новый срок (ISO, например 2026-12-31T23:59):", current);
    if (!value) return;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      setMessage("Некорректная дата");
      return;
    }
    setExpiryMutation.mutate({ id: item.id, expiresAt: parsed.toISOString() });
  }

  async function copyAccessLink(link: string) {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage("VPN ключ скопирован");
    } catch {
      setMessage("Не удалось скопировать ключ");
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-sm"
          value={q}
          placeholder="Поиск по email / uuid / order id"
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="input max-w-44"
          value={active}
          onChange={(e) => {
            setPage(1);
            setActive(e.target.value);
          }}
        >
          <option value="">Все</option>
          <option value="active">Только активные</option>
          <option value="inactive">Только неактивные</option>
        </select>
        <a className="btn-secondary" href={`${(import.meta.env.VITE_ADMIN_API_URL || "/api/admin")}/vpn/export`} target="_blank" rel="noreferrer">
          Экспорт CSV
        </a>
        <button className="btn-secondary" onClick={() => syncExpiredMutation.mutate()} disabled={syncExpiredMutation.isPending}>
          {syncExpiredMutation.isPending ? "Обрабатываем..." : "Отключить истекшие"}
        </button>
        {message ? <div className="basis-full text-sm text-slate-600 dark:text-slate-300">{message}</div> : null}
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Пользователь</th>
                <th className="px-4 py-3">VPN</th>
                <th className="px-4 py-3">Заказ/Оплата</th>
                <th className="px-4 py-3">Трафик</th>
                <th className="px-4 py-3">Срок</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(listQuery.data?.items || []).map((item) => (
                <tr className="border-t border-slate-200 dark:border-slate-800" key={item.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{item.email || item.telegramId || "-"}</div>
                    <div className="text-xs text-slate-500">{item.telegramId ? `telegram: ${item.telegramId}` : "email access"}</div>
                    <div className="text-xs text-slate-500">source: {item.source || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold break-all">{item.uuid}</div>
                    <div className="text-xs text-slate-500">plan: {item.plan}</div>
                    <button className="btn-secondary mt-2" onClick={() => copyAccessLink(item.accessLink)}>
                      Копировать ключ
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold break-all">{item.orderId || "-"}</div>
                    <div className="text-xs text-slate-500">
                      {item.orderStatus || "-"} · {item.paymentProvider || item.paymentMethod || "-"}
                    </div>
                    <div className="text-xs text-slate-500 break-all">{item.paymentRef || "-"}</div>
                    <div className="text-xs text-slate-500">{item.productTitle || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{bytesToHuman(item.trafficUsedBytes)}</div>
                    <div className="text-xs text-slate-500">{item.trafficUsedBytes} bytes</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`font-semibold ${isActiveRow(item) ? "text-emerald-600" : "text-rose-600"}`}>
                      {isActiveRow(item) ? "Активен" : "Неактивен"}
                    </div>
                    <div className="text-xs text-slate-500">{fmtDate(item.expiresAt)}</div>
                    <div className="text-xs text-slate-500">server: {item.serverId || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-secondary"
                        onClick={() => revokeMutation.mutate(item.id)}
                        disabled={revokeMutation.isPending}
                      >
                        Revoke
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => regenerateMutation.mutate(item.id)}
                        disabled={regenerateMutation.isPending}
                      >
                        Regenerate
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => syncTrafficMutation.mutate(item.id)}
                        disabled={syncTrafficMutation.isPending}
                      >
                        Sync traffic
                      </button>
                      <button className="btn-secondary" onClick={() => askAndSetExpiry(item)} disabled={setExpiryMutation.isPending}>
                        Set expiry
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-3 flex items-center justify-between">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          Страница {listQuery.data?.page || page} из {listQuery.data?.totalPages || 1} · записей: {listQuery.data?.total || 0}
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Назад
          </button>
          <button
            className="btn-secondary"
            disabled={page >= Number(listQuery.data?.totalPages || 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперед
          </button>
        </div>
      </section>
    </div>
  );
}

