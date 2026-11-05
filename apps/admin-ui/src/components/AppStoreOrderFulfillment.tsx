import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api } from "../lib/api";

const regions: Record<string, string> = { ru: "Россия", us: "США", tr: "Турция", in: "Индия", ae: "ОАЭ" };
const units: Record<string, string> = { ru: "₽", us: "$", tr: "₺", in: "₹", ae: "AED" };

export function AppStoreOrderFulfillment({ orderId, card }: {
  orderId: string; card: { region: string; denomination: number; state: string };
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const issue = useMutation({
    mutationFn: () => api.post("/orders/" + orderId + "/app-store-code", { code }),
    onSuccess: () => {
      setCode("");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["cdk"] });
    },
  });
  const delivered = card.state === "delivered" || issue.isSuccess;
  const error = axios.isAxiosError(issue.error)
    ? String(issue.error.response?.data?.message || issue.error.response?.data?.error || "Не удалось выдать код")
    : "Не удалось выдать код. Попробуйте ещё раз.";
  return (
    <section className="orders-app-store rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-label="Выдача App Store">
      <strong>{delivered ? "Код App Store выдан" : "App Store — ожидает выдачи"}</strong>
      <p className="my-2 text-sm">{regions[card.region]} · {card.denomination.toLocaleString("ru-RU")} {units[card.region]}</p>
      {delivered ? <p className="text-sm" role="status">Код доступен на странице клиента.</p> : (
        <form onSubmit={(event) => { event.preventDefault(); issue.mutate(); }} className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-sm">Код Apple Gift Card
            <input className="input mt-1 w-full font-mono" value={code} onChange={(event) => setCode(event.target.value)}
              autoComplete="off" spellCheck={false} maxLength={80} placeholder="16 букв и цифр" required disabled={issue.isPending} />
          </label>
          <button className="btn-primary" type="submit" disabled={issue.isPending || code.replace(/[\s-]/g, "").length !== 16}>
            {issue.isPending ? "Выдаём…" : "Выдать клиенту"}
          </button>
          {issue.isError ? <p role="alert" className="w-full text-sm text-rose-600">{error}</p> : null}
        </form>
      )}
    </section>
  );
}
