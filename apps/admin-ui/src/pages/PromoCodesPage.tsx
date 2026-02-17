import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

function formatRub(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(value || 0);
}

export default function PromoCodesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["promocodes-stats"],
    queryFn: async () => (await api.get("/promocodes/stats")).data,
  });

  const [code, setCode] = useState("");
  const [kind, setKind] = useState("REFERRAL");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [campaign, setCampaign] = useState("");
  const [discount, setDiscount] = useState(10);
  const [usageLimit, setUsageLimit] = useState<number | "">("");

  const create = useMutation({
    mutationFn: () =>
      api.post("/promocodes", {
        code,
        kind,
        ownerLabel: ownerLabel || undefined,
        campaign: campaign || undefined,
        discountPercent: discount,
        usageLimit: usageLimit === "" ? undefined : usageLimit,
      }),
    onSuccess: () => {
      setCode("");
      setOwnerLabel("");
      setCampaign("");
      setDiscount(10);
      setUsageLimit("");
      qc.invalidateQueries({ queryKey: ["promocodes-stats"] });
    },
  });

  const removePromo = useMutation({
    mutationFn: (id: string) => api.delete(`/promocodes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promocodes-stats"] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    create.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Link className="btn-secondary" to="/partners">
          Добавить партнера
        </Link>
      </div>

      <form onSubmit={onSubmit} className="card p-4 grid gap-2 md:grid-cols-6">
        <input className="input" placeholder="Промокод" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="REFERRAL">Реферальный</option>
          <option value="ADS">Реклама</option>
          <option value="GENERAL">Общий</option>
        </select>
        <input className="input" placeholder="Кому принадлежит" value={ownerLabel} onChange={(e) => setOwnerLabel(e.target.value)} />
        <input className="input" placeholder="Канал/кампания" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
        <input className="input" type="number" min={0} max={95} placeholder="Скидка %" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
        <input className="input" type="number" min={1} placeholder="Лимит использований" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value ? Number(e.target.value) : "")} />
        <button className="btn-primary md:col-span-6">Добавить промокод</button>
      </form>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Код</th>
                <th className="px-4 py-3">Тип</th>
                <th className="px-4 py-3">Владелец</th>
                <th className="px-4 py-3">Кампания</th>
                <th className="px-4 py-3">Скидка</th>
                <th className="px-4 py-3">Оплаченных заказов</th>
                <th className="px-4 py-3">Выручка (RUB)</th>
                <th className="px-4 py-3">Скидки (RUB)</th>
                <th className="px-4 py-3">Использовано</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((item: any) => (
                <tr className="border-t border-slate-200 dark:border-slate-800" key={item.id}>
                  <td className="px-4 py-3 font-semibold">{item.code}</td>
                  <td className="px-4 py-3">{item.kind}</td>
                  <td className="px-4 py-3">{item.ownerLabel || "-"}</td>
                  <td className="px-4 py-3">{item.campaign || "-"}</td>
                  <td className="px-4 py-3">{item.discountPercent}%</td>
                  <td className="px-4 py-3">{item.ordersPaid}</td>
                  <td className="px-4 py-3">{formatRub(item.revenueRub)}</td>
                  <td className="px-4 py-3">{formatRub(item.discountRub)}</td>
                  <td className="px-4 py-3">{item.usedCount}{item.usageLimit ? ` / ${item.usageLimit}` : ""}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="btn-secondary text-rose-600"
                      onClick={() => {
                        const ok = window.confirm(`Удалить промокод ${item.code}?`);
                        if (!ok) return;
                        removePromo.mutate(item.id);
                      }}
                      disabled={removePromo.isPending}
                    >
                      Удалить
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
