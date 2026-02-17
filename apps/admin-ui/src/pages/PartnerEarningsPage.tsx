import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtDate, money } from "../lib/format";

type EarningStatus = "" | "PENDING" | "APPROVED" | "PAID" | "REVERSED";

export default function PartnerEarningsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<EarningStatus>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = useMemo(
    () => ({
      page: 1,
      limit: 100,
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [status, dateFrom, dateTo]
  );

  const earnings = useQuery({
    queryKey: ["partner-earnings", params],
    queryFn: async () => (await api.get("/partner-earnings", { params })).data,
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api.post(`/partner-earnings/${id}/mark-paid`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-earnings"] }),
  });

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="grid gap-2 md:grid-cols-4">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as EarningStatus)}>
            <option value="">Все статусы</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="PAID">PAID</option>
            <option value="REVERSED">REVERSED</option>
          </select>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <div className="flex items-center rounded-xl border border-slate-200 px-3 dark:border-slate-700">
            К выплате: <strong className="ml-2">{money(Number(earnings.data?.payableAmount || 0), "RUB")}</strong>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Партнер</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Ставка</th>
                <th className="px-4 py-3">Начисление</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(earnings.data?.items || []).map((item: any) => (
                <tr className="border-t border-slate-200 dark:border-slate-800" key={item.id}>
                  <td className="px-4 py-3">{item.partner?.name || item.partnerId}</td>
                  <td className="px-4 py-3">{item.orderId.slice(0, 12)}...</td>
                  <td className="px-4 py-3">{Number(item.commissionRate)}%</td>
                  <td className="px-4 py-3">{money(Number(item.commissionAmount), "RUB")}</td>
                  <td className="px-4 py-3">{item.status}</td>
                  <td className="px-4 py-3">{fmtDate(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button className="btn-secondary" disabled={item.status === "PAID"} onClick={() => markPaid.mutate(item.id)}>
                      Отметить выплачено
                    </button>
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
