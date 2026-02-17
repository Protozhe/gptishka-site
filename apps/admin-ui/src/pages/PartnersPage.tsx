import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type DiscountType = "PERCENT" | "FIXED";

export default function PartnersPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [payoutPercent, setPayoutPercent] = useState("20");
  const [discountType, setDiscountType] = useState<DiscountType>("PERCENT");
  const [discountValue, setDiscountValue] = useState("10");
  const [code, setCode] = useState("");
  const [errorText, setErrorText] = useState("");

  const partners = useQuery({
    queryKey: ["partners"],
    queryFn: async () => (await api.get("/partners")).data,
  });

  const createPartner = useMutation({
    mutationFn: (payload: any) => api.post("/partners", payload),
    onSuccess: () => {
      setErrorText("");
      qc.invalidateQueries({ queryKey: ["partners"] });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.details?.[0]?.message ||
        error?.response?.data?.message ||
        "Не удалось создать партнера";
      setErrorText(String(message));
    },
  });

  const updatePartner = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => api.put(`/partners/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partners"] }),
  });

  const deletePartner = useMutation({
    mutationFn: (id: string) => api.delete(`/partners/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partners"] }),
  });

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setErrorText("");

    if (name.trim().length < 2) {
      setErrorText("Введите имя партнера (минимум 2 символа)");
      return;
    }

    const payout = Number(payoutPercent);
    if (!Number.isFinite(payout) || payout < 0 || payout > 100) {
      setErrorText("Payout должен быть от 0 до 100");
      return;
    }

    const discount = Number(discountValue);
    if (!Number.isFinite(discount) || discount < 0) {
      setErrorText("Скидка должна быть числом не меньше 0");
      return;
    }
    if (discountType === "PERCENT" && discount > 95) {
      setErrorText("Скидка в процентах должна быть не больше 95");
      return;
    }

    await createPartner.mutateAsync({
      name: name.trim(),
      payoutPercent: payout,
      discountType,
      discountValue: discount,
      code: code.trim() || undefined,
      isActive: true,
    });

    setName("");
    setCode("");
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <form className="grid gap-2 md:grid-cols-5" onSubmit={onCreate}>
          <input className="input" placeholder="Имя партнера" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Payout %" value={payoutPercent} onChange={(e) => setPayoutPercent(e.target.value)} />
          <select className="input" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
            <option value="PERCENT">Скидка %</option>
            <option value="FIXED">Фикс. скидка</option>
          </select>
          <input
            className="input"
            placeholder={discountType === "PERCENT" ? "Скидка %" : "Скидка сумма"}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
          />
          <input className="input" placeholder="Промокод (опционально)" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-primary md:col-span-5" type="submit" disabled={createPartner.isPending}>
            {createPartner.isPending ? "Создаем..." : "Создать партнера (1:1 промокод)"}
          </button>
        </form>
      </section>

      {errorText ? <div className="card p-3 text-sm text-rose-600">{errorText}</div> : null}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Партнер</th>
                <th className="px-4 py-3">Промокод</th>
                <th className="px-4 py-3">Скидка</th>
                <th className="px-4 py-3">Payout %</th>
                <th className="px-4 py-3">Оплачено сделок</th>
                <th className="px-4 py-3">Оплачено сумма</th>
                <th className="px-4 py-3">Активен</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(partners.data?.items || []).map((item: any) => (
                <tr className="border-t border-slate-200 dark:border-slate-800" key={item.id}>
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3">{item.promoCode?.code || "-"}</td>
                  <td className="px-4 py-3">
                    {item.promoCode?.discountType === "PERCENT"
                      ? `${Number(item.promoCode?.discountValue || 0)}%`
                      : Number(item.promoCode?.discountValue || 0)}
                  </td>
                  <td className="px-4 py-3">{Number(item.payoutPercent)}%</td>
                  <td className="px-4 py-3">{Number(item.paidDeals || 0)}</td>
                  <td className="px-4 py-3">{Number(item.paidRevenue || 0)} RUB</td>
                  <td className="px-4 py-3">{item.promoCode?.isActive ? "Да" : "Нет"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          updatePartner.mutate({
                            id: item.id,
                            payload: {
                              isActive: !item.promoCode?.isActive,
                            },
                          })
                        }
                      >
                        {item.promoCode?.isActive ? "Отключить" : "Включить"}
                      </button>
                      <button
                        className="btn-secondary text-rose-600"
                        onClick={() => {
                          const ok = window.confirm(`Удалить партнера ${item.name}?`);
                          if (!ok) return;
                          deletePartner.mutate(item.id);
                        }}
                        disabled={deletePartner.isPending}
                      >
                        Удалить
                      </button>
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
