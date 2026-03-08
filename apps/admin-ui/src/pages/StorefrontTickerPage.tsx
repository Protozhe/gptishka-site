import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";

type StorefrontTickerSettings = {
  hiddenEmails: string[];
  hiddenOrderIds: string[];
  updatedAt: string;
};

type StorefrontTickerRow = {
  orderId: string;
  email: string;
  emailMasked: string;
  createdAt: string;
  hiddenByEmail: boolean;
  hiddenByOrderId: boolean;
  hidden: boolean;
};

type StorefrontTickerPreviewItem = {
  orderId: string;
  emailMasked: string;
  createdAt: string;
};

type StorefrontTickerPayload = {
  settings: StorefrontTickerSettings;
  rows: StorefrontTickerRow[];
  visiblePreview: StorefrontTickerPreviewItem[];
};

const FALLBACK_SETTINGS: StorefrontTickerSettings = {
  hiddenEmails: [],
  hiddenOrderIds: [],
  updatedAt: "",
};

function normalizeEmail(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export default function StorefrontTickerPage() {
  const queryClient = useQueryClient();
  const [emailInput, setEmailInput] = useState("");
  const [search, setSearch] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const tickerQuery = useQuery<StorefrontTickerPayload>({
    queryKey: ["storefront-ticker-settings"],
    queryFn: async () => (await api.get("/orders/storefront/ticker-settings")).data,
  });

  const saveSettings = useMutation({
    mutationFn: async (next: { hiddenEmails: string[]; hiddenOrderIds: string[] }) =>
      (await api.patch("/orders/storefront/ticker-settings", next)).data,
    onSuccess: () => {
      setLocalError(null);
      queryClient.invalidateQueries({ queryKey: ["storefront-ticker-settings"] });
    },
    onError: () => {
      setLocalError("Не удалось сохранить изменения. Проверьте доступ к API.");
    },
  });

  const settings = tickerQuery.data?.settings || FALLBACK_SETTINGS;
  const rows = tickerQuery.data?.rows || [];
  const preview = tickerQuery.data?.visiblePreview || [];

  const filteredRows = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      return (
        row.orderId.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.emailMasked.toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  function save(next: { hiddenEmails: string[]; hiddenOrderIds: string[] }) {
    saveSettings.mutate(next);
  }

  function addHiddenEmail() {
    const normalized = normalizeEmail(emailInput);
    if (!normalized || !normalized.includes("@")) {
      setLocalError("Введите корректный email, который нужно скрыть.");
      return;
    }
    if (settings.hiddenEmails.includes(normalized)) {
      setLocalError("Этот email уже скрыт.");
      return;
    }
    save({
      hiddenEmails: [...settings.hiddenEmails, normalized],
      hiddenOrderIds: settings.hiddenOrderIds,
    });
    setEmailInput("");
  }

  function removeHiddenEmail(email: string) {
    save({
      hiddenEmails: settings.hiddenEmails.filter((item) => item !== email),
      hiddenOrderIds: settings.hiddenOrderIds,
    });
  }

  function toggleEmailFromRow(row: StorefrontTickerRow) {
    const normalized = normalizeEmail(row.email);
    if (!normalized || !normalized.includes("@")) return;
    if (row.hiddenByEmail) {
      removeHiddenEmail(normalized);
      return;
    }
    save({
      hiddenEmails: [...settings.hiddenEmails, normalized],
      hiddenOrderIds: settings.hiddenOrderIds,
    });
  }

  function toggleOrderId(row: StorefrontTickerRow) {
    const exists = settings.hiddenOrderIds.includes(row.orderId);
    if (exists) {
      save({
        hiddenEmails: settings.hiddenEmails,
        hiddenOrderIds: settings.hiddenOrderIds.filter((item) => item !== row.orderId),
      });
      return;
    }
    save({
      hiddenEmails: settings.hiddenEmails,
      hiddenOrderIds: [...settings.hiddenOrderIds, row.orderId],
    });
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-500 to-blue-600 px-5 py-4 text-white">
          <h2 className="text-lg font-bold">Плашка клиентов на главной</h2>
          <p className="mt-1 text-sm text-cyan-50">
            Управляйте email, которые попадают в публичную ленту. Тестовые адреса можно скрыть без удаления заказа.
          </p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Обновлено</div>
            <div className="text-sm font-semibold">
              {settings.updatedAt ? fmtDate(settings.updatedAt) : "Еще не обновлялось"}
            </div>
          </div>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["storefront-ticker-settings"] })}
            disabled={tickerQuery.isLoading}
          >
            Обновить данные
          </button>
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Скрыть email</label>
            <input
              className="input"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="test@example.com"
            />
          </div>
          <button className="btn-primary" type="button" onClick={addHiddenEmail} disabled={saveSettings.isPending}>
            Добавить в скрытые
          </button>
        </div>

        {localError ? <div className="text-sm text-rose-600">{localError}</div> : null}

        <div className="flex flex-wrap gap-2">
          {settings.hiddenEmails.length ? (
            settings.hiddenEmails.map((email) => (
              <button
                key={email}
                type="button"
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                onClick={() => removeHiddenEmail(email)}
                disabled={saveSettings.isPending}
              >
                {email} ×
              </button>
            ))
          ) : (
            <div className="text-sm text-slate-500">Скрытых email пока нет.</div>
          )}
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Предпросмотр текущей плашки</h3>
          <div className="text-sm text-slate-500">Показываются первые {preview.length} адресов из видимых</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {preview.length ? (
            preview.map((item) => (
              <div
                key={`${item.orderId}-${item.createdAt}`}
                className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700"
                title={`Order: ${item.orderId}`}
              >
                {item.emailMasked}
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-500">После фильтрации нет видимых адресов.</div>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по email или order id"
            />
            <div className="text-sm text-slate-500">Оплаченные заказы: {rows.length}</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Заказ</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Маска</th>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr className="border-t border-slate-200 dark:border-slate-800" key={row.orderId}>
                  <td className="px-4 py-3 font-mono text-xs">{row.orderId.slice(0, 14)}...</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.emailMasked}</td>
                  <td className="px-4 py-3">{fmtDate(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    {row.hidden ? (
                      <span className="badge bg-rose-100 text-rose-700">Скрыт</span>
                    ) : (
                      <span className="badge bg-emerald-100 text-emerald-700">Показывается</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => toggleEmailFromRow(row)}
                        disabled={saveSettings.isPending}
                      >
                        {row.hiddenByEmail ? "Показать email" : "Скрыть email"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => toggleOrderId(row)}
                        disabled={saveSettings.isPending}
                      >
                        {row.hiddenByOrderId ? "Показать заказ" : "Скрыть заказ"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!tickerQuery.isLoading && !filteredRows.length ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={6}>
                    Нет заказов для отображения.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
