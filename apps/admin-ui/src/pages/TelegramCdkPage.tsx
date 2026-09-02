import { Fragment, FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  compareProductsByFamilyAndDuration,
  getProductDurationLabel,
  ProductDurationEditor,
} from "../components/ProductDurationEditor";

type ProductDeliveryType = "activation" | "credentials" | "manual_login" | "vpn" | "support" | "support_claude";
type CdkStatus = "unused" | "used" | "archived";

type ProductItem = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  descriptionEn?: string;
  tags?: string[];
  deliveryType?: ProductDeliveryType;
  deliveryMethod?: 1 | 2 | 3 | 4 | 5 | "1" | "2" | "3" | "4" | "5";
};

type CdkRow = {
  id: string;
  code: string;
  status: CdkStatus;
  email?: string | null;
  orderId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  assignedAt?: string | null;
  archivedAt?: string | null;
};

type CdkListResponse = {
  items: CdkRow[];
  stats?: {
    byProduct?: Record<
      string,
      {
        unused: number;
        used: number;
        total: number;
      }
    >;
  };
};

type CdkImportResult = {
  inserted: number;
  skipped: number;
  conflicts?: number;
  conflictsByProductKey?: Record<string, number>;
  conflictDetails?: Array<{
    code: string;
    productKey: string;
    status: string;
    orderId?: string | null;
    email?: string | null;
  }>;
};

type PoolMoveResult = {
  moved: number;
  fromProductKey: string;
  toProductKey: string;
};

type PoolMoveTarget = {
  label: string;
  productKey: string;
};

function normalizeKey(value: string) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function resolveDeliveryType(product: ProductItem): ProductDeliveryType {
  const type = String(product.deliveryType || "").trim().toLowerCase();
  if (type === "manual_login" || type === "manual-login") return "manual_login";
  if (type === "support_claude") return "support_claude";
  if (type === "support") return "support";
  if (type === "credentials") return "credentials";
  if (type === "vpn") return "vpn";
  if (type === "activation") return "activation";

  const method = String(product.deliveryMethod || "").trim();
  if (method === "5") return "support_claude";
  if (method === "4") return "support";
  if (method === "3") return "vpn";
  if (method === "2") return "credentials";
  if (method === "1") return "activation";

  const tags = (Array.isArray(product.tags) ? product.tags : []).map((tag) => String(tag || "").trim().toLowerCase());
  if (tags.some((tag) => tag === "delivery:manual_login" || tag === "delivery:manual-login")) return "manual_login";
  if (tags.some((tag) => tag === "delivery:support_claude")) return "support_claude";
  if (tags.some((tag) => tag === "delivery:support")) return "support";
  if (tags.some((tag) => tag === "delivery:credentials")) return "credentials";
  if (tags.some((tag) => tag === "delivery:vpn")) return "vpn";

  return "activation";
}

function isChatGptLikeProduct(product: ProductItem) {
  const slug = String(product.slug || "").trim().toLowerCase();
  const title = String(product.title || "").trim().toLowerCase();
  return slug.includes("chatgpt") || title.includes("chatgpt");
}

function isExcludedFromTelegramCdk(product: ProductItem) {
  const slug = String(product.slug || "").trim().toLowerCase();
  const blockedSlugs = [
    "chatgpt-plus-vpn",
    "chatgpt-pro-vpn",
    "chatgpt-go-vpn",
    "chatgpt-plus-2",
    "account-chatgpt-plus",
  ];
  return blockedSlugs.includes(slug);
}

function productPoolBaseKey(product: Pick<ProductItem, "slug" | "tags">) {
  const explicitPool = (Array.isArray(product.tags) ? product.tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .find((tag) => tag.startsWith("activation-pool:"))
    ?.slice("activation-pool:".length);
  return normalizeKey(explicitPool || product.slug);
}

function poolKey(product: ProductItem, type: ProductDeliveryType) {
  const base = productPoolBaseKey(product);
  if (type === "support_claude") return normalizeKey(`tgbot-${base}-sdk5`);
  return normalizeKey(`tgbot-${base}-sdk4`);
}

function formatCdkDate(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function keyListPrimaryDate(item: CdkRow, listType: CdkStatus) {
  if (listType === "used") {
    return {
      label: "Выдан",
      value: item.assignedAt || item.updatedAt || null,
    };
  }

  return {
    label: "Загружен",
    value: item.createdAt || null,
  };
}

function ImportSummary({ result }: { result: CdkImportResult }) {
  const details = Array.isArray(result.conflictDetails) ? result.conflictDetails : [];

  return (
    <div className="space-y-2 text-xs">
      <div className={result.inserted > 0 ? "text-emerald-600" : "text-amber-700 dark:text-amber-300"}>
        Добавлено: {result.inserted}, Пропущено: {result.skipped}
        {typeof result.conflicts === "number" && result.conflicts > 0 ? `, Конфликты: ${result.conflicts}` : ""}
      </div>
      {details.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="font-semibold">Эти ключи уже есть в других пулах:</div>
          <div className="mt-1 space-y-1">
            {details.map((item) => (
              <div className="break-all" key={`${item.code}-${item.productKey}`}>
                <span className="font-mono">{item.code}</span> {"->"} <span className="font-mono">{item.productKey}</span>, статус: {item.status}
                {item.orderId ? `, заказ: ${item.orderId}` : ""}
                {item.email ? `, email: ${item.email}` : ""}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function cleanProductTitle(title: string) {
  return String(title || "")
    .replace(/\s+впн\s+в\s+подарок/gi, "")
    .replace(/\s+vpn\s+в\s+подарок/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function methodLabelForTelegramProduct(product: ProductItem) {
  const type = resolveDeliveryType(product);
  if (type === "support_claude") return "Метод 5 (Claude)";
  if (type === "support") return "Метод 4 (Grok/Support)";
  if (isChatGptLikeProduct(product)) return "Метод 1 (ChatGPT)";
  return "Telegram CDK";
}

const TELEGRAM_CDK_UI_VERSION = "telegram-cdk-v2-pool-split-20260617";

function TelegramProductsTable({
  products,
  activeProductId,
  onSelect,
  renderDetails,
  showDurationEditor = true,
  title = "Товары Telegram",
  hint = "Нажмите на товар, чтобы открыть свободные, выданные и архивные ключи.",
}: {
  products: ProductItem[];
  activeProductId?: string;
  onSelect: (id: string) => void;
  renderDetails: (product: ProductItem) => React.ReactNode;
  showDurationEditor?: boolean;
  title?: string;
  hint?: string;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{hint} Порядок: товар → срок.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/60">
            <tr>
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3">Срок</th>
              <th className="px-4 py-3">Метод</th>
              <th className="px-4 py-3">Telegram pool</th>
              <th className="px-4 py-3 text-right">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {products.map((product) => {
              const type = resolveDeliveryType(product);
              const key = poolKey(product, type);
              const isActive = product.id === activeProductId;
              const title = cleanProductTitle(product.title) || product.title;

              return (
                <Fragment key={product.id}>
                  <tr
                    className={
                      isActive
                        ? "bg-cyan-50/80 dark:bg-cyan-950/30"
                        : "cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
                    }
                    onClick={() => onSelect(product.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold">{title}</div>
                      <div className="text-xs text-slate-500">{product.slug}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getProductDurationLabel(product) || <span className="text-slate-400">Не указан</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{methodLabelForTelegramProduct(product)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{key}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className={isActive ? "btn-primary" : "btn-secondary"}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(product.id);
                        }}
                      >
                        {isActive ? "Открыт" : "Открыть ключи"}
                      </button>
                    </td>
                  </tr>
                  {isActive ? (
                    <tr className="bg-slate-50/80 dark:bg-slate-950/40">
                      <td className="px-4 py-4" colSpan={5}>
                        {showDurationEditor ? <ProductDurationEditor product={product} /> : null}
                        {renderDetails(product)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KeyList({
  title,
  items,
  listType,
  open,
  onToggle,
  archiveAction,
  returnAction,
  deleteAction,
  deletingId,
}: {
  title: string;
  items: CdkRow[];
  listType: CdkStatus;
  open: boolean;
  onToggle: () => void;
  archiveAction?: (id: string) => void;
  returnAction?: (id: string) => void;
  deleteAction?: (id: string) => void;
  deletingId?: string;
}) {
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
        onClick={onToggle}
      >
        <span>
          {title} ({items.length})
        </span>
        <span className="text-xs font-medium text-slate-500">{open ? "Свернуть" : "Развернуть"}</span>
      </button>
      {open ? (
        <div className="max-h-[300px] overflow-auto p-3 space-y-2">
          {items.map((item) => {
            const primaryDate = keyListPrimaryDate(item, listType);

            return (
              <article key={item.id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
                <div className="font-mono break-all">{item.code}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {item.orderId ? `order: ${item.orderId}` : "не выдан"} {item.email ? `• ${item.email}` : ""}
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                  <div>
                    {primaryDate.label}: {formatCdkDate(primaryDate.value)}
                  </div>
                  {listType === "used" ? <div>Загружен: {formatCdkDate(item.createdAt)}</div> : null}
                </div>
                <div className="mt-2 flex gap-2">
                  {archiveAction ? (
                    <button className="btn-secondary" type="button" onClick={() => archiveAction(item.id)}>
                      В архив
                    </button>
                  ) : null}
                  {returnAction ? (
                    <button className="btn-secondary" type="button" onClick={() => returnAction(item.id)}>
                      Вернуть
                    </button>
                  ) : null}
                  {deleteAction ? (
                    <button className="btn-secondary" type="button" onClick={() => deleteAction(item.id)} disabled={deletingId === item.id}>
                      {deletingId === item.id ? "Удаляем..." : "Удалить навсегда"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!items.length ? <div className="text-sm text-slate-500">Пусто</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function ProductKeysCard({ product, poolKeyOverride }: { product: ProductItem; poolKeyOverride?: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [deletingArchivedId, setDeletingArchivedId] = useState("");
  const [showUnused, setShowUnused] = useState(true);
  const [showUsed, setShowUsed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const type = resolveDeliveryType(product);
  const key = poolKeyOverride || poolKey(product, type);
  const methodLabel = type === "support_claude"
    ? "Метод 5 (Claude)"
    : isChatGptLikeProduct(product)
    ? "Метод 1 (ChatGPT)"
    : "Метод 4 (Grok/Support)";

  const refetch = () => qc.invalidateQueries({ queryKey: ["tg-cdks", key] });

  const unused = useQuery<CdkListResponse>({
    queryKey: ["tg-cdks", key, "unused"],
    queryFn: async () => (await api.get("/cdks", { params: { productKey: key, status: "unused", page: 1, limit: 200 } })).data,
  });
  const used = useQuery<CdkListResponse>({
    queryKey: ["tg-cdks", key, "used"],
    queryFn: async () => (await api.get("/cdks", { params: { productKey: key, status: "used", page: 1, limit: 200 } })).data,
  });
  const archived = useQuery<CdkListResponse>({
    queryKey: ["tg-cdks", key, "archived"],
    queryFn: async () => (await api.get("/cdks", { params: { productKey: key, status: "archived", page: 1, limit: 200 } })).data,
  });

  const importer = useMutation({
    mutationFn: async () => (await api.post("/cdks/import", { productKey: key, text })).data as CdkImportResult,
    onSuccess: () => {
      setText("");
      setError("");
      refetch();
    },
    onError: () => setError("Не удалось загрузить ключи"),
  });

  const archiveUnused = useMutation({
    mutationFn: async (id: string) => api.delete(`/cdks/${id}`),
    onSuccess: () => refetch(),
  });
  const returnUsed = useMutation({
    mutationFn: async (id: string) => api.post(`/cdks/${id}/return-unused`),
    onSuccess: () => refetch(),
  });
  const deleteArchived = useMutation({
    mutationFn: async (id: string) => api.delete(`/cdks/${encodeURIComponent(id)}/permanent`),
    onSuccess: () => {
      setDeletingArchivedId("");
      setError("");
      refetch();
    },
    onError: (err: any) => {
      setDeletingArchivedId("");
      setError(err?.response?.data?.message || "Не удалось удалить архивный ключ");
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return setError("Вставьте хотя бы один ключ");
    importer.mutate();
  };

  return (
    <section className="card p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{product.title}</h3>
        <div className="text-xs text-slate-500">
          {methodLabel} • telegram-pool: <span className="font-mono">{key}</span>
        </div>
      </div>

      <form className="space-y-2" onSubmit={onSubmit}>
        <textarea
          className="input min-h-[120px] w-full"
          placeholder="SDK ключи по одному в строке"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error ? <div className="text-sm text-rose-500">{error}</div> : null}
        <button className="btn-primary" type="submit" disabled={importer.isPending}>
          {importer.isPending ? "Загрузка..." : "Загрузить ключи"}
        </button>
        {importer.data ? <ImportSummary result={importer.data} /> : null}
      </form>

      <div className="grid gap-3 xl:grid-cols-3">
        <KeyList
          title="Свободные"
          items={unused.data?.items || []}
          listType="unused"
          open={showUnused}
          onToggle={() => setShowUnused((value) => !value)}
          archiveAction={(id) => archiveUnused.mutate(id)}
        />
        <KeyList
          title="Выданные"
          items={used.data?.items || []}
          listType="used"
          open={showUsed}
          onToggle={() => setShowUsed((value) => !value)}
          returnAction={(id) => returnUsed.mutate(id)}
        />
        <KeyList
          title="Архив"
          items={archived.data?.items || []}
          listType="archived"
          open={showArchived}
          onToggle={() => setShowArchived((value) => !value)}
          deleteAction={(id) => {
            if (!window.confirm("Удалить архивный ключ навсегда? Это действие нельзя отменить.")) return;
            setDeletingArchivedId(id);
            deleteArchived.mutate(id);
          }}
          deletingId={deletingArchivedId}
        />
      </div>
    </section>
  );
}

function LegacyPoolMovePanel({
  fromProductKey,
  targets,
  onMoved,
}: {
  fromProductKey: string;
  targets: PoolMoveTarget[];
  onMoved?: () => void;
}) {
  const qc = useQueryClient();
  const [targetKey, setTargetKey] = useState("");
  const [error, setError] = useState("");

  const movePool = useMutation({
    mutationFn: async () =>
      (
        await api.post("/cdks/pools/move", {
          fromProductKey,
          toProductKey: targetKey,
        })
      ).data as PoolMoveResult,
    onSuccess: () => {
      setError("");
      setTargetKey("");
      qc.invalidateQueries({ queryKey: ["tg-cdks"] });
      onMoved?.();
    },
    onError: (err: any) => setError(err?.response?.data?.message || "Не удалось перенести пул"),
  });

  const filteredTargets = targets.filter((target) => target.productKey !== fromProductKey);

  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="text-sm font-semibold text-amber-950 dark:text-amber-100">Вернуть пул в активный Telegram CDK</div>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
        Переносит все ключи этого пула в выбранный товар. Статусы сохраняются: свободные, выданные и архивные не смешиваются.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <select className="input" value={targetKey} onChange={(event) => setTargetKey(event.target.value)}>
          <option value="">Выберите товар / Telegram pool</option>
          {filteredTargets.map((target) => (
            <option value={target.productKey} key={target.productKey}>
              {target.label} → {target.productKey}
            </option>
          ))}
        </select>
        <button
          className="btn-primary"
          type="button"
          disabled={!targetKey || movePool.isPending}
          onClick={() => {
            if (!targetKey) return;
            if (!window.confirm(`Перенести все ключи из ${fromProductKey} в ${targetKey}?`)) return;
            movePool.mutate();
          }}
        >
          {movePool.isPending ? "Переносим..." : "Перенести пул"}
        </button>
      </div>
      {movePool.data ? (
        <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
          Перенесено ключей: {movePool.data.moved}. Пул: {movePool.data.fromProductKey} → {movePool.data.toProductKey}
        </div>
      ) : null}
      {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
    </section>
  );
}

export default function TelegramCdkPage() {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedLegacyPoolId, setSelectedLegacyPoolId] = useState("");

  const products = useQuery<{ items: ProductItem[] }>({
    queryKey: ["tg-products"],
    queryFn: async () =>
      (
        await api.get("/products", {
          params: { page: 1, limit: 100, isArchived: false, sortBy: "title", sortDir: "asc" },
        })
      ).data,
  });

  const poolStats = useQuery<CdkListResponse>({
    queryKey: ["tg-cdks", "all-pool-stats"],
    queryFn: async () =>
      (
        await api.get("/cdks", {
          params: {
            page: 1,
            limit: 1,
          },
        })
      ).data,
  });

  const botProducts = useMemo(() => {
    const rows = products.data?.items || [];
    const filtered = rows
      .filter((p) => {
        if (isExcludedFromTelegramCdk(p)) return false;
        const t = resolveDeliveryType(p);
        return t === "support" || t === "support_claude" || (t === "activation" && isChatGptLikeProduct(p));
      })
      .sort(compareProductsByFamilyAndDuration);
    return filtered;
  }, [products.data?.items]);

  const activeProduct = useMemo(() => {
    if (!botProducts.length || !selectedProductId) return null;
    return botProducts.find((product) => product.id === selectedProductId) || null;
  }, [botProducts, selectedProductId]);

  const visibleTelegramPoolKeys = useMemo(() => {
    return new Set(botProducts.map((product) => poolKey(product, resolveDeliveryType(product))));
  }, [botProducts]);

  const telegramMoveTargets = useMemo<PoolMoveTarget[]>(() => {
    const siteProducts = products.data?.items || [];
    const siteTargets = siteProducts
      .map((product) => {
        const type = resolveDeliveryType(product);
        const base = productPoolBaseKey(product);
        if (!base || type === "credentials" || type === "manual_login") return null;
        if (type === "support_claude") {
          return {
            label: `CDK / SDK: ${cleanProductTitle(product.title) || product.title}`,
            productKey: normalizeKey(`${base}-sdk5`),
          };
        }
        if (type === "support") {
          return {
            label: `CDK / SDK: ${cleanProductTitle(product.title) || product.title}`,
            productKey: normalizeKey(`${base}-sdk4`),
          };
        }
        return {
          label: `CDK: ${cleanProductTitle(product.title) || product.title}`,
          productKey: base,
        };
      })
      .filter((target): target is PoolMoveTarget => Boolean(target));

    const telegramTargets = botProducts.map((product) => ({
      label: `Telegram: ${cleanProductTitle(product.title) || product.title}`,
      productKey: poolKey(product, resolveDeliveryType(product)),
    }));

    const seen = new Set<string>();
    return [...telegramTargets, ...siteTargets].filter((target) => {
      if (seen.has(target.productKey)) return false;
      seen.add(target.productKey);
      return true;
    });
  }, [botProducts, products.data?.items]);

  const legacyPools = useMemo(() => {
    const byProduct = poolStats.data?.stats?.byProduct || {};
    return Object.entries(byProduct)
      .filter(([key, value]) => key.startsWith("tgbot-") && value.total > 0 && !visibleTelegramPoolKeys.has(key))
      .map(([key, value]) => ({
        id: key,
        slug: key,
        title: `${key} (Свободные: ${value.unused}, Выданные/архив: ${value.used}, total: ${value.total})`,
        deliveryType: "support" as ProductDeliveryType,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }, [poolStats.data?.stats?.byProduct, visibleTelegramPoolKeys]);

  const activeLegacyPool = useMemo(() => {
    if (!legacyPools.length || !selectedLegacyPoolId) return null;
    return legacyPools.find((pool) => pool.id === selectedLegacyPoolId) || null;
  }, [legacyPools, selectedLegacyPoolId]);

  const toggleSelectedProduct = (id: string) => {
    setSelectedProductId((current) => (current === id ? "" : id));
  };

  const toggleSelectedLegacyPool = (id: string) => {
    setSelectedLegacyPoolId((current) => (current === id ? "" : id));
  };

  return (
    <div className="space-y-4" data-telegram-cdk-ui-version={TELEGRAM_CDK_UI_VERSION}>
      <section className="card p-4">
        <h2 className="text-xl font-semibold">Telegram CDK</h2>
        <p className="mt-1 text-sm text-slate-500">
          Это отдельные ключи для Telegram-ботов. Ключи сайта сюда не подтягиваются.
        </p>
      </section>

      {products.isLoading ? <div className="card p-4 text-sm text-slate-500">Загрузка...</div> : null}
      {!products.isLoading && !botProducts.length ? (
        <div className="card p-4 text-sm text-slate-500">Не найдено товаров с методом 1/4/5.</div>
      ) : null}

      {botProducts.length ? (
        <TelegramProductsTable
          products={botProducts}
          activeProductId={activeProduct?.id}
          onSelect={toggleSelectedProduct}
          renderDetails={(product) => <ProductKeysCard key={product.id} product={product} />}
        />
      ) : null}

      {poolStats.isLoading ? <div className="card p-4 text-sm text-slate-500">Загрузка...</div> : null}

      {!poolStats.isLoading && legacyPools.length ? (
        <TelegramProductsTable
          title="Старые / неактивные Telegram-пулы"
          hint="Эти Telegram-пулы есть в базе ключей, но не привязаны к текущим товарам Telegram."
          products={legacyPools}
          showDurationEditor={false}
          activeProductId={activeLegacyPool?.id}
          onSelect={toggleSelectedLegacyPool}
          renderDetails={(pool) => (
            <>
              <LegacyPoolMovePanel
                fromProductKey={pool.slug}
                targets={telegramMoveTargets}
                onMoved={() => setSelectedLegacyPoolId("")}
              />
              <ProductKeysCard key={pool.id} product={pool} poolKeyOverride={pool.slug} />
            </>
          )}
        />
      ) : null}
    </div>
  );
}

