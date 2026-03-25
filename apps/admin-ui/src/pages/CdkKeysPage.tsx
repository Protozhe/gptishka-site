import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type ProductDeliveryType = "activation" | "credentials" | "vpn" | "support";
type CdkStatus = "unused" | "used";
type CredentialStatus = "available" | "assigned";

type ProductItem = {
  id: string;
  slug: string;
  title: string;
  tags?: string[];
  deliveryType?: ProductDeliveryType;
  deliveryMethod?: 1 | 2 | 3 | 4 | "1" | "2" | "3" | "4";
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

type CredentialRow = {
  id: string;
  login: string;
  password: string;
  status: CredentialStatus;
  orderId: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
};

type CredentialListResponse = {
  items: CredentialRow[];
  stats?: {
    total: number;
    available: number;
    assigned: number;
  };
};

const TEXT = {
  title: "CDK ключи по товарам",
  subtitle:
    "Для метода 1 храните CDK-ключи, для метода 2 храните пары логин/пароль. Метод 3 (VPN) и метод 4 (поддержка) не требуют CDK.",
  searchPlaceholder: "Поиск по коду / логину / email / orderId",
  loading: "Загружаем...",
  empty: "Записей пока нет",
  fillKeys: "Введите хотя бы один CDK ключ",
  fillCredentials: "Введите хотя бы одну пару login:password",
  importFailed: "Не удалось загрузить данные",
  returnFailed: "Не удалось вернуть ключ",
  deleteFailed: "Не удалось удалить запись",
  importBtn: "Загрузить",
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
  unusedCredentials: "Свободные",
  usedCredentials: "Выданные",
  availableItem: "Свободен",
  assignedItem: "Выдан",
  login: "Логин",
  password: "Пароль",
  modeActivation: "Метод 1: CDK-активация",
  modeCredentials: "Метод 2: Логин/пароль",
  modeVpn: "Метод 3: Выдача VPN",
  modeSupport: "Метод 4: Ручная выдача через поддержку",
  vpnAutoInfo: "CDK ключи для этого товара не используются. VPN-доступ выдается автоматически после оплаты.",
  supportAutoInfo: "CDK ключи для этого товара не используются. После оплаты клиенту показывается ссылка на поддержку для ручной выдачи.",
  show: "Развернуть",
  hide: "Свернуть",
  textareaPlaceholder:
    "Вставьте CDK ключи (по одному в строке)\nПример: 69742FA2-47A4-48C5-A7CC-71F334688FE7",
  credentialsPlaceholder: "Вставьте пары login:password (по одной в строке)\nПример: user@mail.ru:Pass123",
  noProducts: "Товары не найдены. Сначала создайте товары в разделе «Товары».",
};

function resolveDeliveryType(product: ProductItem): ProductDeliveryType {
  const fromMethod = String(product.deliveryMethod || "").trim();
  if (fromMethod === "4") return "support";
  if (fromMethod === "3") return "vpn";
  if (fromMethod === "2") return "credentials";
  if (fromMethod === "1") return "activation";

  const fromType = String(product.deliveryType || "")
    .trim()
    .toLowerCase();
  if (fromType === "support") return "support";
  if (fromType === "credentials") return "credentials";
  if (fromType === "vpn") return "vpn";
  if (fromType === "activation") return "activation";

  const tags = (Array.isArray(product.tags) ? product.tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
  const hasSupportTag = tags.some((tag) => tag === "delivery:support");
  const hasCredentialsTag = tags.some((tag) => tag === "delivery:credentials");
  const hasVpnTag = tags.some((tag) => tag === "delivery:vpn");

  if (hasSupportTag) return "support";
  if (hasCredentialsTag) return "credentials";
  if (hasVpnTag) return "vpn";
  return "activation";
}

function CurtainBlock({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
        onClick={onToggle}
      >
        <span>
          {title} ({count})
        </span>
        <span className="text-xs font-medium text-slate-500">{open ? TEXT.hide : TEXT.show}</span>
      </button>
      {open ? <div>{children}</div> : null}
    </section>
  );
}

function ActivationTable({
  items,
  loading,
  onReturn,
  returningId,
  onDelete,
  deletingId,
}: {
  items: CdkRow[];
  loading: boolean;
  onReturn?: (id: string) => void;
  returningId?: string;
  onDelete?: (id: string) => void;
  deletingId?: string;
}) {
  return (
    <div className="max-h-[360px] overflow-auto">
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
  );
}

function CredentialsTable({
  items,
  loading,
  onDelete,
  deletingId,
}: {
  items: CredentialRow[];
  loading: boolean;
  onDelete?: (id: string) => void;
  deletingId?: string;
}) {
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-left dark:bg-slate-800">
          <tr>
            <th className="px-4 py-3">{TEXT.login}</th>
            <th className="px-4 py-3">{TEXT.password}</th>
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
              <td className="px-4 py-3 font-mono">{item.login}</td>
              <td className="px-4 py-3 font-mono">{item.password}</td>
              <td className="px-4 py-3">{item.status === "available" ? TEXT.availableItem : TEXT.assignedItem}</td>
              <td className="px-4 py-3">{item.email || "-"}</td>
              <td className="px-4 py-3">{item.orderId || "-"}</td>
              <td className="px-4 py-3">{item.assignedAt ? new Date(item.assignedAt).toLocaleString("ru-RU") : "-"}</td>
              <td className="px-4 py-3">{new Date(item.createdAt).toLocaleString("ru-RU")}</td>
              <td className="px-4 py-3">
                {item.status === "available" && onDelete ? (
                  <button className="btn-secondary" type="button" onClick={() => onDelete(item.id)} disabled={deletingId === item.id}>
                    {deletingId === item.id ? `${TEXT.remove}...` : TEXT.remove}
                  </button>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </td>
            </tr>
          ))}
          {!loading && !items.length ? (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={8}>
                {TEXT.empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ActivationProductColumn({ product, search }: { product: ProductItem; search: string }) {
  const qc = useQueryClient();
  const productKey = normalizeProductKey(product.slug);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [returningId, setReturningId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [showUnused, setShowUnused] = useState(true);
  const [showUsed, setShowUsed] = useState(false);

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
      ).data as { inserted: number; skipped: number; conflicts?: number; conflictsByProductKey?: Record<string, number> },
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
          <p className="text-xs text-emerald-700 dark:text-emerald-400">{TEXT.modeActivation}</p>
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
              {typeof importMutation.data.conflicts === "number" && importMutation.data.conflicts > 0
                ? `, Конфликты: ${importMutation.data.conflicts}`
                : ""}
            </span>
          ) : null}
        </div>
      </form>

      {error ? <div className="text-sm text-rose-600">{error}</div> : null}

      <div className="grid gap-3">
        <CurtainBlock
          title={TEXT.unused}
          count={unusedItems.length}
          open={showUnused}
          onToggle={() => setShowUnused((value) => !value)}
        >
          <ActivationTable
            items={unusedItems}
            loading={loading}
            onDelete={onDeleteUnused}
            deletingId={deletingId}
          />
        </CurtainBlock>

        <CurtainBlock
          title={TEXT.used}
          count={usedItems.length}
          open={showUsed}
          onToggle={() => setShowUsed((value) => !value)}
        >
          <ActivationTable
            items={usedItems}
            loading={loading}
            onReturn={onReturnToUnused}
            returningId={returningId}
          />
        </CurtainBlock>
      </div>
    </section>
  );
}

function CredentialsProductColumn({ product, search }: { product: ProductItem; search: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [showUnused, setShowUnused] = useState(true);
  const [showUsed, setShowUsed] = useState(false);

  const availableQuery = useQuery<CredentialListResponse>({
    queryKey: ["product-credentials-cdk", product.id, "available", search],
    queryFn: async () =>
      (
        await api.get(`/products/${product.id}/credentials`, {
          params: {
            status: "available",
            q: search || undefined,
          },
        })
      ).data,
  });

  const assignedQuery = useQuery<CredentialListResponse>({
    queryKey: ["product-credentials-cdk", product.id, "assigned", search],
    queryFn: async () =>
      (
        await api.get(`/products/${product.id}/credentials`, {
          params: {
            status: "assigned",
            q: search || undefined,
          },
        })
      ).data,
  });

  const importMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/products/${product.id}/credentials/import`, {
          text,
        })
      ).data as { inserted: number; skipped: number },
    onSuccess: () => {
      setText("");
      setError("");
      qc.invalidateQueries({ queryKey: ["product-credentials-cdk", product.id] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || TEXT.importFailed);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/products/${product.id}/credentials/${id}`),
    onSuccess: () => {
      setDeletingId("");
      setError("");
      qc.invalidateQueries({ queryKey: ["product-credentials-cdk", product.id] });
    },
    onError: (err: any) => {
      setDeletingId("");
      setError(err?.response?.data?.message || TEXT.deleteFailed);
    },
  });

  const onImport = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError(TEXT.fillCredentials);
      return;
    }
    setError("");
    importMutation.mutate();
  };

  const onDeleteAvailable = (id: string) => {
    if (!window.confirm("Удалить запись? Это действие нельзя отменить.")) return;
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  const availableItems = availableQuery.data?.items || [];
  const assignedItems = assignedQuery.data?.items || [];
  const loading = availableQuery.isLoading || assignedQuery.isLoading;

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{product.title}</h3>
          <p className="text-xs text-slate-500">productId: {product.id}</p>
          <p className="text-xs text-indigo-700 dark:text-indigo-400">{TEXT.modeCredentials}</p>
        </div>
        <div className="text-xs text-slate-600">
          {TEXT.unusedCredentials}: <b>{availableItems.length}</b> | {TEXT.usedCredentials}: <b>{assignedItems.length}</b>
        </div>
      </div>

      <form onSubmit={onImport} className="space-y-2">
        <textarea
          className="input min-h-[120px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={TEXT.credentialsPlaceholder}
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
        <CurtainBlock
          title={TEXT.unusedCredentials}
          count={availableItems.length}
          open={showUnused}
          onToggle={() => setShowUnused((value) => !value)}
        >
          <CredentialsTable
            items={availableItems}
            loading={loading}
            onDelete={onDeleteAvailable}
            deletingId={deletingId}
          />
        </CurtainBlock>

        <CurtainBlock
          title={TEXT.usedCredentials}
          count={assignedItems.length}
          open={showUsed}
          onToggle={() => setShowUsed((value) => !value)}
        >
          <CredentialsTable items={assignedItems} loading={loading} />
        </CurtainBlock>
      </div>
    </section>
  );
}

function VpnProductColumn({ product }: { product: ProductItem }) {
  const productKey = normalizeProductKey(product.slug);

  return (
    <section className="card p-4 space-y-3">
      <div>
        <h3 className="text-base font-semibold">{product.title}</h3>
        <p className="text-xs text-slate-500">productKey: {productKey}</p>
        <p className="text-xs text-cyan-700 dark:text-cyan-400">{TEXT.modeVpn}</p>
      </div>
      <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900 dark:border-cyan-900/40 dark:bg-cyan-900/20 dark:text-cyan-100">
        {TEXT.vpnAutoInfo}
      </div>
    </section>
  );
}

function SupportProductColumn({ product }: { product: ProductItem }) {
  const productKey = normalizeProductKey(product.slug);

  return (
    <section className="card p-4 space-y-3">
      <div>
        <h3 className="text-base font-semibold">{product.title}</h3>
        <p className="text-xs text-slate-500">productKey: {productKey}</p>
        <p className="text-xs text-indigo-700 dark:text-indigo-300">{TEXT.modeSupport}</p>
      </div>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-900/20 dark:text-indigo-100">
        {TEXT.supportAutoInfo}
      </div>
    </section>
  );
}

function ProductColumn({ product, search }: { product: ProductItem; search: string }) {
  const deliveryType = resolveDeliveryType(product);
  if (deliveryType === "credentials") {
    return <CredentialsProductColumn product={product} search={search} />;
  }
  if (deliveryType === "vpn") {
    return <VpnProductColumn product={product} />;
  }
  if (deliveryType === "support") {
    return <SupportProductColumn product={product} />;
  }

  return <ActivationProductColumn product={product} search={search} />;
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
        tags: Array.isArray(item.tags) ? item.tags : [],
        deliveryType: item.deliveryType,
        deliveryMethod: item.deliveryMethod,
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
