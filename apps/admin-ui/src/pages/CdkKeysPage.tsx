import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type CdkStatus = "unused" | "used";

type ProductItem = {
  id: string;
  slug: string;
  title: string;
};

type ProductListResponse = {
  items: ProductItem[];
};

type CdkRow = {
  id: string;
  code: string;
  productKey: string;
  status: CdkStatus;
  email?: string | null;
  orderId?: string | null;
  assignedAt?: string | null;
  createdAt: string;
};

type CdkListResponse = {
  items: CdkRow[];
};

const TEXT = {
  title: "CDK ключи по товарам",
  subtitle: "У каждого товара свой отдельный пул ключей. Выдача при оплате идет строго по товару заказа.",
  searchPlaceholder: "Поиск по коду / email / orderId",
  loading: "Загружаем...",
  empty: "Ключей пока нет",
  fillKeys: "Введите хотя бы один CDK ключ",
  importFailed: "Не удалось загрузить ключи",
  returnFailed: "Не удалось вернуть ключ",
  deleteFailed: "Не удалось удалить ключ",
  importBtn: "Загрузить ключи",
  added: "Добавлено",
  skipped: "Пропущено",
  unused: "Неиспользованные",
  used: "Использованные",
  status: "Статус",
  user: "Email клиента",
  order: "ID сделки",
  assigned: "Дата/время выдачи",
  created: "Добавлен",
  actions: "Действия",
  returnToUnused: "Вернуть",
  remove: "Удалить",
  unusedItem: "Неиспользован",
  usedItem: "Использован",
  textareaPlaceholder:
    "Вставьте CDK ключи (по одному в строке)\nПример: 69742FA2-47A4-48C5-A7CC-71F334688FE7",
  noProducts: "Товары не найдены. Сначала создайте товары в разделе «Товары».",
};

function ProductColumn({ product, search }: { product: ProductItem; search: string }) {
  const qc = useQueryClient();
  const productKey = normalizeProductKey(product.slug);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [returningId, setReturningId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const unusedQuery = useQuery<CdkListResponse>({
    queryKey: ["cdks", productKey, "unused", search],
    queryFn: async () =>
      (
        await api.get("/cdks", {
          params: {
            status: "unused",
            productKey,
            q: search || undefined,
            page: 1,
            limit: 200,
          },
        })
      ).data,
  });

  const usedQuery = useQuery<CdkListResponse>({
    queryKey: ["cdks", productKey, "used", search],
    queryFn: async () =>
      (
        await api.get("/cdks", {
          params: {
            status: "used",
            productKey,
            q: search || undefined,
            page: 1,
            limit: 200,
          },
        })
      ).data,
  });

  const importMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/cdks/import", {
          productKey,
          text,
        })
      ).data as { inserted: number; skipped: number },
    onSuccess: () => {
      setText("");
      setError("");
      qc.invalidateQueries({ queryKey: ["cdks", productKey] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || TEXT.importFailed);
    },
  });

  const returnMutation = useMutation({
    mutationFn: async (id: string) => (await api.post(`/cdks/${encodeURIComponent(id)}/return-unused`)).data,
    onSuccess: () => {
      setReturningId("");
      setError("");
      qc.invalidateQueries({ queryKey: ["cdks", productKey] });
    },
    onError: (err: any) => {
      setReturningId("");
      setError(err?.response?.data?.message || TEXT.returnFailed);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/cdks/${encodeURIComponent(id)}`),
    onSuccess: () => {
      setDeletingId("");
      setError("");
      qc.invalidateQueries({ queryKey: ["cdks", productKey] });
    },
    onError: (err: any) => {
      setDeletingId("");
      setError(err?.response?.data?.message || TEXT.deleteFailed);
    },
  });

  const onImport = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError(TEXT.fillKeys);
      return;
    }
    setError("");
    importMutation.mutate();
  };

  const onReturnToUnused = (id: string) => {
    setReturningId(id);
    returnMutation.mutate(id);
  };

  const onDeleteUnused = (id: string) => {
    if (!window.confirm("Удалить ключ? Это действие нельзя отменить.")) return;
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  const unusedItems = unusedQuery.data?.items || [];
  const usedItems = usedQuery.data?.items || [];
  const loading = unusedQuery.isLoading || usedQuery.isLoading;

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{product.title}</h3>
          <p className="text-xs text-slate-500">productKey: {productKey}</p>
        </div>
        <div className="text-xs text-slate-600">
          {TEXT.unused}: <b>{unusedItems.length}</b> | {TEXT.used}: <b>{usedItems.length}</b>
        </div>
      </div>

      <form onSubmit={onImport} className="space-y-2">
        <textarea
          className="input min-h-[120px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={TEXT.textareaPlaceholder}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={importMutation.isPending}>
            {importMutation.isPending ? TEXT.loading : TEXT.importBtn}
          </button>
          {importMutation.data ? (
            <span className="text-xs text-emerald-600">
              {TEXT.added}: {importMutation.data.inserted}, {TEXT.skipped}: {importMutation.data.skipped}
            </span>
          ) : null}
        </div>
      </form>

      {error ? <div className="text-sm text-rose-600">{error}</div> : null}

      <div className="grid gap-3">
        <TableBlock
          title={`${TEXT.unused} (${unusedItems.length})`}
          items={unusedItems}
          loading={loading}
          onDelete={onDeleteUnused}
          deletingId={deletingId}
        />
        <TableBlock
          title={`${TEXT.used} (${usedItems.length})`}
          items={usedItems}
          loading={loading}
          onReturn={onReturnToUnused}
          returningId={returningId}
        />
      </div>
    </section>
  );
}

function TableBlock({
  title,
  items,
  loading,
  onReturn,
  returningId,
  onDelete,
  deletingId,
}: {
  title: string;
  items: CdkRow[];
  loading: boolean;
  onReturn?: (id: string) => void;
  returningId?: string;
  onDelete?: (id: string) => void;
  deletingId?: string;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold dark:border-slate-800">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3">CDK</th>
              <th className="px-4 py-3">{TEXT.status}</th>
              <th className="px-4 py-3">{TEXT.user}</th>
              <th className="px-4 py-3">{TEXT.order}</th>
              <th className="px-4 py-3">{TEXT.assigned}</th>
              <th className="px-4 py-3">{TEXT.created}</th>
              <th className="px-4 py-3">{TEXT.actions}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t border-slate-200 dark:border-slate-800" key={item.id}>
                <td className="px-4 py-3 font-semibold">{item.code}</td>
                <td className="px-4 py-3">{item.status === "unused" ? TEXT.unusedItem : TEXT.usedItem}</td>
                <td className="px-4 py-3">{item.email || "-"}</td>
                <td className="px-4 py-3">{item.orderId || "-"}</td>
                <td className="px-4 py-3">{item.assignedAt ? new Date(item.assignedAt).toLocaleString("ru-RU") : "-"}</td>
                <td className="px-4 py-3">{new Date(item.createdAt).toLocaleString("ru-RU")}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {item.status === "used" && onReturn ? (
                      <button className="btn-secondary" type="button" onClick={() => onReturn(item.id)} disabled={returningId === item.id}>
                        {returningId === item.id ? `${TEXT.returnToUnused}...` : TEXT.returnToUnused}
                      </button>
                    ) : null}
                    {item.status === "unused" && onDelete ? (
                      <button className="btn-secondary" type="button" onClick={() => onDelete(item.id)} disabled={deletingId === item.id}>
                        {deletingId === item.id ? `${TEXT.remove}...` : TEXT.remove}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !items.length ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={7}>
                  {TEXT.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function CdkKeysPage() {
  const [q, setQ] = useState("");

  const productsQuery = useQuery<ProductListResponse>({
    queryKey: ["products", "cdk-page"],
    queryFn: async () =>
      (
        await api.get("/products", {
          params: {
            page: 1,
            limit: 100,
            isArchived: false,
            sortBy: "createdAt",
            sortDir: "asc",
          },
        })
      ).data,
  });

  const products = useMemo(() => {
    const rows = productsQuery.data?.items || [];
    return rows
      .filter((item) => String(item.slug || "").trim())
      .map((item) => ({
        id: item.id,
        slug: normalizeProductKey(item.slug),
        title: item.title,
      }));
  }, [productsQuery.data]);

  return (
    <div className="space-y-4">
      <section className="card p-4 space-y-2">
        <h2 className="text-lg font-semibold">{TEXT.title}</h2>
        <p className="text-sm text-slate-500">{TEXT.subtitle}</p>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={TEXT.searchPlaceholder} />
      </section>

      {productsQuery.isLoading ? <div className="card p-4 text-sm text-slate-500">{TEXT.loading}</div> : null}

      {!productsQuery.isLoading && !products.length ? <div className="card p-4 text-sm text-rose-600">{TEXT.noProducts}</div> : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {products.map((product) => (
          <ProductColumn key={product.id} product={product} search={q} />
        ))}
      </div>
    </div>
  );
}

function normalizeProductKey(value: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return normalized || "chatgpt";
}
