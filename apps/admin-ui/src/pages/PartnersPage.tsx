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
        <div className="admin-form-heading"><h3>Новый партнёр</h3><p>Имя, условия вознаграждения и персональный промокод.</p></div>
          <label className="admin-field"><span className="admin-field-label">Имя партнера</span><input className="input" placeholder="Имя партнера" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="admin-field"><span className="admin-field-label">Вознаграждение, %</span><input className="input" placeholder="Payout %" value={payoutPercent} onChange={(e) => setPayoutPercent(e.target.value)} /></label>
          <label className="admin-field"><span className="admin-field-label">Тип скидки</span><select className="input" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
            <option value="PERCENT">Скидка %</option>
            <option value="FIXED">Фикс. скидка</option>
          </select></label>
          <label className="admin-field"><span className="admin-field-label">Размер скидки</span><input
            className="input"
            placeholder={discountType === "PERCENT" ? "Скидка %" : "Скидка сумма"}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
          /></label>
          <label className="admin-field"><span className="admin-field-label">Промокод (опционально)</span><input className="input" placeholder="Промокод (опционально)" value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <button className="btn-primary md:col-span-5" type="submit" disabled={createPartner.isPending}>
            {createPartner.isPending ? "Создаем..." : "Создать партнера (1:1 промокод)"}
          </button>
        </form>
      </section>

      {errorText ? <div className="card p-3 text-sm text-rose-600">{errorText}</div> : null}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm admin-data-table">
            <caption className="admin-table-caption">Партнёры и условия</caption>
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Партнер</th>
                <th className="px-4 py-3">Промокод</th>
                <th className="px-4 py-3">Скидка</th>
                <th className="px-4 py-3">Вознаграждение, %</th>
                <th className="px-4 py-3">Оплачено сделок</th>
                <th className="px-4 py-3">Оплачено сумма</th>
                <th className="px-4 py-3">Активен</th>
                <th className="px-4 py-3" data-column-kind="actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(partners.data?.items || []).map((item: any) => (
                <tr className="border-t border-slate-200 dark:border-slate-800" key={item.id}>
                  <td className="px-4 py-3" data-label="Партнер">{item.name}</td>
                  <td className="px-4 py-3" data-label="Промокод">{item.promoCode?.code || "-"}</td>
                  <td className="px-4 py-3" data-label="Скидка">
                    {item.promoCode?.discountType === "PERCENT"
                      ? `${Number(item.promoCode?.discountValue || 0)}%`
                      : Number(item.promoCode?.discountValue || 0)}
                  </td>
                  <td className="px-4 py-3" data-label="Вознаграждение, %">{Number(item.payoutPercent)}%</td>
                  <td className="px-4 py-3" data-label="Оплачено сделок">{Number(item.paidDeals || 0)}</td>
                  <td className="px-4 py-3" data-label="Оплачено сумма">{Number(item.paidRevenue || 0)} RUB</td>
                  <td className="px-4 py-3" data-label="Активен">{item.promoCode?.isActive ? "Да" : "Нет"}</td>
                  <td className="px-4 py-3" data-label="Действия" data-column-kind="actions">
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
