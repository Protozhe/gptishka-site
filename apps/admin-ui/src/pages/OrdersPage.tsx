import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtDate, money } from "../lib/format";

export default function OrdersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const params = useMemo(() => ({ page: 1, limit: 100, q, status: status || undefined }), [q, status]);

  const orders = useQuery({
    queryKey: ["orders", params],
    queryFn: async () => (await api.get("/orders", { params })).data,
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  const refund = useMutation({
    mutationFn: (id: string) => api.post(`/orders/${id}/refund`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  const checkActivation = useMutation({
    mutationFn: (id: string) => api.get(`/orders/${id}/activation-proof`, { params: { forceCheck: 1 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  return (
    <div className="space-y-4">
      <section className="card p-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-sm" value={q} placeholder="Поиск по email / payment id" onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="PENDING">PENDING</option>
          <option value="PAID">PAID</option>
          <option value="FAILED">FAILED</option>
          <option value="REFUNDED">REFUNDED</option>
        </select>
        <a className="btn-secondary" href={`${(import.meta.env.VITE_ADMIN_API_URL || "/api/admin")}/orders/export/csv`}>
          Экспорт CSV
        </a>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Заказ</th>
                <th className="px-4 py-3">Покупатель</th>
                <th className="px-4 py-3">Сумма</th>
                <th className="px-4 py-3">Промокод</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Активация</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(orders.data?.items || []).map((o: any) => (
                <tr className="border-t border-slate-200 dark:border-slate-800" key={o.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{o.id.slice(0, 10)}...</div>
                    <div className="text-xs text-slate-500">{fmtDate(o.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">{o.email}</td>
                  <td className="px-4 py-3">{money(Number(o.totalAmount), o.currency)}</td>
                  <td className="px-4 py-3">{o.promoCodeSnapshot || "-"}</td>
                  <td className="px-4 py-3">{o.status}</td>
                  <td className="px-4 py-3">
                    {o.activation ? (
                      <div className="text-xs leading-5">
                        <div className="font-semibold">{o.activation.status}</div>
                        <div className="text-slate-500">{o.activation.verificationState || "unknown"}</div>
                        {o.activation.lastProviderCheckedAt ? (
                          <div className="text-slate-400">{fmtDate(o.activation.lastProviderCheckedAt)}</div>
                        ) : null}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" onClick={() => checkActivation.mutate(o.id)}>
                        Проверить активацию
                      </button>
                      <button className="btn-secondary" onClick={() => patch.mutate({ id: o.id, status: "PAID" })}>Отметить оплаченным</button>
                      <button className="btn-secondary" onClick={() => patch.mutate({ id: o.id, status: "FAILED" })}>Отметить как ошибка</button>
                      <button className="btn-secondary" onClick={() => refund.mutate(o.id)}>Возврат</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
