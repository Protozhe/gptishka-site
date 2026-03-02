import { useMemo, useState } from "react";
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
    if (status === 401) return "РЎРµСЃСЃРёСЏ РёСЃС‚РµРєР»Р°. Р’РѕР№РґРёС‚Рµ РІ Р°РґРјРёРЅРєСѓ Р·Р°РЅРѕРІРѕ.";
    if (status === 403) return "РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РґР»СЏ РїСЂРѕРІРµСЂРєРё Р°РєС‚РёРІР°С†РёРё.";
  }

  if (error instanceof Error && error.message) return error.message;
  return "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ Р°РєС‚РёРІР°С†РёСЋ. РџСЂРѕРІРµСЂСЊС‚Рµ РїРѕРґРєР»СЋС‡РµРЅРёРµ Рє API.";
}

export default function OrdersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [tokenDialog, setTokenDialog] = useState<null | { orderId: string; token: string; storedAt: string | null; expiresAt: string | null }>(null);

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
    mutationFn: async (id: string) => (await api.get(`/orders/${id}/activation-proof`, { params: { forceCheck: 1 } })).data,
    onMutate: (id: string) => {
      setCheckMessage(`РџСЂРѕРІРµСЂСЏРµРј Р°РєС‚РёРІР°С†РёСЋ РґР»СЏ Р·Р°РєР°Р·Р° ${id.slice(0, 10)}...`);
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      const certaintyCode = String(data?.certainty?.code || "");
      const certaintyLabel =
        certaintyCode === "ACTIVATED_CONFIRMED_PROVIDER"
          ? "РђРєС‚РёРІР°С†РёСЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅР° РїСЂРѕРІР°Р№РґРµСЂРѕРј"
          : certaintyCode === "ACTIVATION_FAILED"
          ? "РџСЂРѕРІР°Р№РґРµСЂ РІРµСЂРЅСѓР» РѕС€РёР±РєСѓ Р°РєС‚РёРІР°С†РёРё"
          : certaintyCode === "ACTIVATION_IN_PROGRESS"
          ? "РђРєС‚РёРІР°С†РёСЏ РІ РѕР±СЂР°Р±РѕС‚РєРµ"
          : certaintyCode === "ACTIVATION_UNCONFIRMED"
          ? "РђРєС‚РёРІР°С†РёСЏ РЅРµ Р·Р°РїСѓС‰РµРЅР° РёР»Рё РЅРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅР°"
          : "РџСЂРѕРІРµСЂРєР° Р°РєС‚РёРІР°С†РёРё Р·Р°РІРµСЂС€РµРЅР°";
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
      setCheckMessage(`Р—Р°РіСЂСѓР¶Р°РµРј С‚РѕРєРµРЅ РєР»РёРµРЅС‚Р° РґР»СЏ Р·Р°РєР°Р·Р° ${id.slice(0, 10)}...`);
    },
    onSuccess: (data: any) => {
      const token = String(data?.token || "");
      setTokenDialog({
        orderId: String(data?.orderId || ""),
        token,
        storedAt: data?.storedAt ? String(data.storedAt) : null,
        expiresAt: data?.expiresAt ? String(data.expiresAt) : null,
      });
      setCheckMessage("РўРѕРєРµРЅ РєР»РёРµРЅС‚Р° Р·Р°РіСЂСѓР¶РµРЅ");
    },
    onError: (error: unknown) => {
      setCheckMessage(getCheckErrorMessage(error));
    },
  });

  async function copyTokenFromDialog() {
    if (!tokenDialog?.token) return;
    try {
      await navigator.clipboard.writeText(tokenDialog.token);
      setCheckMessage("РўРѕРєРµРЅ СЃРєРѕРїРёСЂРѕРІР°РЅ РІ Р±СѓС„РµСЂ РѕР±РјРµРЅР°");
    } catch {
      setCheckMessage("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ С‚РѕРєРµРЅ");
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-sm" value={q} placeholder="РџРѕРёСЃРє РїРѕ email / payment id" onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Р’СЃРµ СЃС‚Р°С‚СѓСЃС‹</option>
          <option value="PENDING">PENDING</option>
          <option value="PAID">PAID</option>
          <option value="FAILED">FAILED</option>
          <option value="REFUNDED">REFUNDED</option>
        </select>
        <a className="btn-secondary" href={`${(import.meta.env.VITE_ADMIN_API_URL || "/api/admin")}/orders/export/csv`}>
          Р­РєСЃРїРѕСЂС‚ CSV
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
                <th className="px-4 py-3">Р—Р°РєР°Р·</th>
                <th className="px-4 py-3">РџРѕРєСѓРїР°С‚РµР»СЊ</th>
                <th className="px-4 py-3">РЎСѓРјРјР°</th>
                <th className="px-4 py-3">РџСЂРѕРјРѕРєРѕРґ</th>
                <th className="px-4 py-3">РЎС‚Р°С‚СѓСЃ</th>
                <th className="px-4 py-3">РђРєС‚РёРІР°С†РёСЏ</th>
                <th className="px-4 py-3">Р”РµР№СЃС‚РІРёСЏ</th>
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
                        <div className="text-slate-500">
                          token: {o.activation.tokenBound ? "bound" : o.activation.tokenSeen ? "entered" : "missing"}
                        </div>
                        <div className="text-slate-500">stored token: {o.activation.tokenStored ? "yes" : "no"}</div>
                        <div className="text-slate-500">validations: {Number(o.activation.tokenValidationAttempts || 0)}</div>
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
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" onClick={() => checkActivation.mutate(o.id)} disabled={checkActivation.isPending}>
                        {checkActivation.isPending && checkActivation.variables === o.id ? "РџСЂРѕРІРµСЂСЏРµРј..." : "РџСЂРѕРІРµСЂРёС‚СЊ Р°РєС‚РёРІР°С†РёСЋ"}
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => readActivationToken.mutate(o.id)}
                        disabled={readActivationToken.isPending}
                      >
                        {readActivationToken.isPending && readActivationToken.variables === o.id ? "Загружаем..." : "Токен клиента"}
                      </button>
                      <button className="btn-secondary" onClick={() => patch.mutate({ id: o.id, status: "PAID" })}>
                        РћС‚РјРµС‚РёС‚СЊ РѕРїР»Р°С‡РµРЅРЅС‹Рј
                      </button>
                      <button className="btn-secondary" onClick={() => patch.mutate({ id: o.id, status: "FAILED" })}>
                        РћС‚РјРµС‚РёС‚СЊ РєР°Рє РѕС€РёР±РєР°
                      </button>
                      <button className="btn-secondary" onClick={() => refund.mutate(o.id)}>
                        Р’РѕР·РІСЂР°С‚
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {tokenDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Токен клиента · {tokenDialog.orderId.slice(0, 10)}...</div>
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
