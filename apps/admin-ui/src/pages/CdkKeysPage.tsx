import { Fragment, FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type ProductDeliveryType = "activation" | "credentials" | "vpn" | "support" | "support_claude";
type CdkStatus = "unused" | "used" | "archived";
type CredentialStatus = "available" | "assigned";

type ProductItem = {
  id: string;
  slug: string;
  title: string;
  tags?: string[];
  deliveryType?: ProductDeliveryType;
  deliveryMethod?: 1 | 2 | 3 | 4 | 5 | "1" | "2" | "3" | "4" | "5";
  activationVariants?: {
    withoutLogin?: {
      activationSiteUrl?: string;
    } | null;
  } | null;
};

type ProductListResponse = {
  items: ProductItem[];
};

type CdkRow = {
  id: string;
  code: string;
  productKey: string;
  activationSiteUrl?: string;
  status: CdkStatus;
  email?: string | null;
  orderId?: string | null;
  assignedAt?: string | null;
  createdAt: string;
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
  activationSiteUrl?: string;
  conflicts?: number;
  conflictsByProductKey?: Record<string, number>;
  conflictDetails?: Array<{
    code: string;
    productKey: string;
    activationSiteUrl?: string;
    status: string;
    orderId?: string | null;
    email?: string | null;
  }>;
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
  title: "CDK / SDK ключи по товарам",
  subtitle:
    "Метод 1: CDK-ключи. Метод 2: пары логин/пароль. Метод 3 (VPN): ключи не нужны. Метод 4: отдельный SDK-пул для Grok. Метод 5: отдельный SDK-пул для Claude.",
  searchPlaceholder: "Поиск по коду / логину / email / orderId",
  loading: "Загружаем...",
  empty: "Записей пока нет",
  fillKeys: "Введите хотя бы один CDK ключ",
  fillActivationSite: "Укажите сайт активации для этой партии CDK ключей",
  fillSdkKeys: "Введите хотя бы один SDK ключ",
  fillCredentials: "Введите хотя бы одну пару login:password",
  importFailed: "Не удалось загрузить данные",
  returnFailed: "Не удалось вернуть ключ",
  deleteFailed: "Не удалось удалить запись",
  importBtn: "Загрузить",
  added: "Добавлено",
  skipped: "Пропущено",
  unused: "Неиспользованные",
  used: "Использованные",
  archived: "Архив",
  status: "Статус",
  user: "Email клиента",
  order: "ID сделки",
  assigned: "Дата/время выдачи",
  created: "Добавлен",
  actions: "Действия",
  returnToUnused: "Вернуть",
  restoreFromArchive: "Восстановить",
  archive: "В архив",
  remove: "Удалить",
  removeForever: "Удалить навсегда",
  products: "Товары",
  legacyPools: "Старые / неактивные пулы",
  legacyPoolsHint: "Эти пулы есть в базе ключей, но не привязаны к текущему списку товаров на этой странице.",
  openKeys: "Открыть ключи",
  selected: "Открыт",
  method: "Метод",
  unusedItem: "Неиспользован",
  usedItem: "Использован",
  archivedItem: "В архиве",
  unusedCredentials: "Свободные",
  usedCredentials: "Выданные",
  availableItem: "Свободен",
  assignedItem: "Выдан",
  login: "Логин",
  password: "Пароль",
  modeActivation: "Метод 1: CDK-активация",
  modeCredentials: "Метод 2: Логин/пароль",
  modeVpn: "Метод 3: Выдача VPN",
  modeSupport: "Метод 4: SDK-ключи для Grok токена",
  modeSupportClaude: "Метод 5: SDK-ключи для Claude токена",
  vpnAutoInfo: "CDK ключи для этого товара не используются. VPN-доступ выдается автоматически после оплаты.",
  show: "Развернуть",
  hide: "Свернуть",
  textareaPlaceholder:
    "Вставьте CDK ключи (по одному в строке)\nПример: 69742FA2-47A4-48C5-A7CC-71F334688FE7",
  activationSitePlaceholder: "https://vip.sxzfd.com/",
  sdkTextareaPlaceholder:
    "Вставьте SDK ключи для метода 4/5 (по одному в строке)\nПример: 69742FA2-47A4-48C5-A7CC-71F334688FE7",
  credentialsPlaceholder: "Вставьте пары login:password (по одной в строке)\nПример: user@mail.ru:Pass123",
  noProducts: "Товары не найдены. Сначала создайте товары в разделе «Товары».",
};

function CdkImportSummary({ result }: { result: CdkImportResult }) {
  const details = Array.isArray(result.conflictDetails) ? result.conflictDetails : [];

  return (
    <div className="space-y-2 text-xs">
      <div className={result.inserted > 0 ? "text-emerald-600" : "text-amber-700 dark:text-amber-300"}>
        {TEXT.added}: {result.inserted}, {TEXT.skipped}: {result.skipped}
        {typeof result.conflicts === "number" && result.conflicts > 0 ? `, Конфликты: ${result.conflicts}` : ""}
        {result.activationSiteUrl ? `, сайт: ${result.activationSiteUrl}` : ""}
      </div>
      {details.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="font-semibold">Эти ключи уже есть в других пулах:</div>
          <div className="mt-1 space-y-1">
            {details.map((item) => (
              <div className="break-all" key={`${item.code}-${item.productKey}`}>
                <span className="font-mono">{item.code}</span> {"->"} <span className="font-mono">{item.productKey}</span>, статус: {item.status}
                {item.activationSiteUrl ? `, сайт: ${item.activationSiteUrl}` : ""}
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

function resolveDeliveryType(product: ProductItem): ProductDeliveryType {
  const fromMethod = String(product.deliveryMethod || "").trim();
  if (fromMethod === "5") return "support_claude";
  if (fromMethod === "4") return "support";
  if (fromMethod === "3") return "vpn";
  if (fromMethod === "2") return "credentials";
  if (fromMethod === "1") return "activation";

  const fromType = String(product.deliveryType || "")
    .trim()
    .toLowerCase();
  if (fromType === "support_claude") return "support_claude";
  if (fromType === "support") return "support";
  if (fromType === "credentials") return "credentials";
  if (fromType === "vpn") return "vpn";
  if (fromType === "activation") return "activation";

  const tags = (Array.isArray(product.tags) ? product.tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
  const hasSupportClaudeTag = tags.some((tag) => tag === "delivery:support_claude");
  const hasSupportTag = tags.some((tag) => tag === "delivery:support");
  const hasCredentialsTag = tags.some((tag) => tag === "delivery:credentials");
  const hasVpnTag = tags.some((tag) => tag === "delivery:vpn");

  if (hasSupportClaudeTag) return "support_claude";
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
  onRestore,
  restoringId,
  onPermanentDelete,
  permanentDeletingId,
  keyColumnLabel = "CDK",
}: {
  items: CdkRow[];
  loading: boolean;
  onReturn?: (id: string) => void;
  returningId?: string;
  onDelete?: (id: string) => void;
  deletingId?: string;
  onRestore?: (id: string) => void;
  restoringId?: string;
  onPermanentDelete?: (id: string) => void;
  permanentDeletingId?: string;
  keyColumnLabel?: string;
}) {
  return (
    <div className="max-h-[480px] overflow-auto px-3 py-3">
      <div className="space-y-3">
        {items.map((item) => {
          const statusLabel =
            item.status === "unused" ? TEXT.unusedItem : item.status === "archived" ? TEXT.archivedItem : TEXT.usedItem;

          return (
            <article
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              key={item.id}
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">{keyColumnLabel}</div>
                  <div className="break-all font-semibold">{item.code}</div>
                </div>
                <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800">
                  {statusLabel}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-slate-500">{TEXT.user}: </span>
                  <span>{item.email || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-500">{TEXT.order}: </span>
                  <span className="break-all">{item.orderId || "-"}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Сайт активации: </span>
                  <span className="break-all font-mono text-xs">{item.activationSiteUrl || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-500">{TEXT.assigned}: </span>
                  <span>{item.assignedAt ? new Date(item.assignedAt).toLocaleString("ru-RU") : "-"}</span>
                </div>
                <div>
                  <span className="text-slate-500">{TEXT.created}: </span>
                  <span>{new Date(item.createdAt).toLocaleString("ru-RU")}</span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {item.status === "used" && onReturn ? (
                  <button className="btn-secondary" type="button" onClick={() => onReturn(item.id)} disabled={returningId === item.id}>
                    {returningId === item.id ? `${TEXT.returnToUnused}...` : TEXT.returnToUnused}
                  </button>
                ) : null}
                {item.status === "unused" && onDelete ? (
                  <button className="btn-secondary" type="button" onClick={() => onDelete(item.id)} disabled={deletingId === item.id}>
                    {deletingId === item.id ? `${TEXT.archive}...` : TEXT.archive}
                  </button>
                ) : null}
                {item.status === "archived" && onRestore ? (
                  <button className="btn-secondary" type="button" onClick={() => onRestore(item.id)} disabled={restoringId === item.id}>
                    {restoringId === item.id ? `${TEXT.restoreFromArchive}...` : TEXT.restoreFromArchive}
                  </button>
                ) : null}
                {item.status === "archived" && onPermanentDelete ? (
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => onPermanentDelete(item.id)}
                    disabled={permanentDeletingId === item.id}
                  >
                    {permanentDeletingId === item.id ? `${TEXT.removeForever}...` : TEXT.removeForever}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}

        {!loading && !items.length ? <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{TEXT.empty}</div> : null}
      </div>
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
    <div className="max-h-[480px] overflow-auto px-3 py-3">
      <div className="space-y-3">
        {items.map((item) => (
          <article
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            key={item.id}
          >
            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{TEXT.login}</div>
                <div className="break-all font-mono text-sm font-semibold">{item.login}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{TEXT.password}</div>
                <div className="break-all font-mono text-sm font-semibold">{item.password}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <span className="text-slate-500">{TEXT.status}: </span>
                <span>{item.status === "available" ? TEXT.availableItem : TEXT.assignedItem}</span>
              </div>
              <div>
                <span className="text-slate-500">{TEXT.user}: </span>
                <span>{item.email || "-"}</span>
              </div>
              <div>
                <span className="text-slate-500">{TEXT.order}: </span>
                <span className="break-all">{item.orderId || "-"}</span>
              </div>
              <div>
                <span className="text-slate-500">{TEXT.assigned}: </span>
                <span>{item.assignedAt ? new Date(item.assignedAt).toLocaleString("ru-RU") : "-"}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500">{TEXT.created}: </span>
                <span>{new Date(item.createdAt).toLocaleString("ru-RU")}</span>
              </div>
            </div>

            <div className="mt-3">
              {item.status === "available" && onDelete ? (
                <button className="btn-secondary" type="button" onClick={() => onDelete(item.id)} disabled={deletingId === item.id}>
                  {deletingId === item.id ? `${TEXT.remove}...` : TEXT.remove}
                </button>
              ) : (
                <span className="text-sm text-slate-400">-</span>
              )}
            </div>
          </article>
        ))}

        {!loading && !items.length ? <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{TEXT.empty}</div> : null}
      </div>
    </div>
  );
}

function KeyProductColumn({
  product,
  search,
  mode = "activation",
  productKeyOverride,
}: {
  product: ProductItem;
  search: string;
  mode?: "activation" | "support" | "support_claude";
  productKeyOverride?: string;
}) {
  const qc = useQueryClient();
  const isSupportMode = mode === "support" || mode === "support_claude";
  const isClaudeMode = mode === "support_claude";
  const baseProductKey = normalizeProductKey(product.slug);
  const productKey = productKeyOverride || resolveKeyPoolProductKey(baseProductKey, mode);
  const keyColumnLabel = isSupportMode ? "SDK" : "CDK";
  const modeLabel = isSupportMode ? (isClaudeMode ? TEXT.modeSupportClaude : TEXT.modeSupport) : TEXT.modeActivation;
  const placeholder = isSupportMode ? TEXT.sdkTextareaPlaceholder : TEXT.textareaPlaceholder;
  const fillErrorMessage = isSupportMode ? TEXT.fillSdkKeys : TEXT.fillKeys;
  const defaultActivationSiteUrl = String(product.activationVariants?.withoutLogin?.activationSiteUrl || "").trim();
  const [text, setText] = useState("");
  const [activationSiteUrl, setActivationSiteUrl] = useState(defaultActivationSiteUrl);
  const [error, setError] = useState("");
  const [returningId, setReturningId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [restoringId, setRestoringId] = useState("");
  const [permanentDeletingId, setPermanentDeletingId] = useState("");
  const [showUnused, setShowUnused] = useState(true);
  const [showUsed, setShowUsed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

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

  const archivedQuery = useQuery<CdkListResponse>({
    queryKey: ["cdks", productKey, "archived", search],
    queryFn: async () =>
      (
        await api.get("/cdks", {
          params: {
            status: "archived",
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
          activationSiteUrl: isSupportMode ? "" : activationSiteUrl,
          text,
        })
      ).data as CdkImportResult,
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

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => (await api.post(`/cdks/${encodeURIComponent(id)}/restore`)).data,
    onSuccess: () => {
      setRestoringId("");
      setError("");
      qc.invalidateQueries({ queryKey: ["cdks", productKey] });
    },
    onError: (err: any) => {
      setRestoringId("");
      setError(err?.response?.data?.message || TEXT.returnFailed);
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/cdks/${encodeURIComponent(id)}/permanent`),
    onSuccess: () => {
      setPermanentDeletingId("");
      setError("");
      qc.invalidateQueries({ queryKey: ["cdks", productKey] });
    },
    onError: (err: any) => {
      setPermanentDeletingId("");
      setError(err?.response?.data?.message || TEXT.deleteFailed);
    },
  });

  const onImport = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError(fillErrorMessage);
      return;
    }
    if (!isSupportMode && !activationSiteUrl.trim()) {
      setError(TEXT.fillActivationSite);
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
    if (!window.confirm("Отправить ключ в архив? Из архива его можно восстановить.")) return;
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  const onRestoreArchived = (id: string) => {
    setRestoringId(id);
    restoreMutation.mutate(id);
  };

  const onPermanentDeleteArchived = (id: string) => {
    if (!window.confirm("Удалить архивный ключ навсегда? Это действие нельзя отменить.")) return;
    setPermanentDeletingId(id);
    permanentDeleteMutation.mutate(id);
  };

  const unusedItems = unusedQuery.data?.items || [];
  const usedItems = usedQuery.data?.items || [];
  const archivedItems = archivedQuery.data?.items || [];
  const loading = unusedQuery.isLoading || usedQuery.isLoading || archivedQuery.isLoading;

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{product.title}</h3>
          <p className="text-xs text-slate-500">
            poolKey: {productKey}
            {isSupportMode ? ` (base: ${baseProductKey})` : ""}
          </p>
          <p className={isSupportMode ? "text-xs text-indigo-700 dark:text-indigo-300" : "text-xs text-emerald-700 dark:text-emerald-400"}>
            {modeLabel}
          </p>
        </div>
        <div className="text-xs text-slate-600">
          {TEXT.unused}: <b>{unusedItems.length}</b> | {TEXT.used}: <b>{usedItems.length}</b> | {TEXT.archived}: <b>{archivedItems.length}</b>
        </div>
      </div>

      <form onSubmit={onImport} className="space-y-2">
        {!isSupportMode ? (
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Сайт активации для этой партии CDK
            </span>
            <input
              className="input"
              value={activationSiteUrl}
              onChange={(e) => setActivationSiteUrl(e.target.value)}
              placeholder={TEXT.activationSitePlaceholder}
            />
            <span className="text-[11px] text-slate-500">
              Эти ключи будут выдаваться только заказам этого товара и только если в товаре выбран этот же сайт.
            </span>
          </label>
        ) : null}
        <textarea
          className="input min-h-[120px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={importMutation.isPending}>
            {importMutation.isPending ? TEXT.loading : TEXT.importBtn}
          </button>
        </div>
        {importMutation.data ? <CdkImportSummary result={importMutation.data} /> : null}
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
            keyColumnLabel={keyColumnLabel}
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
            keyColumnLabel={keyColumnLabel}
          />
        </CurtainBlock>

        <CurtainBlock
          title={TEXT.archived}
          count={archivedItems.length}
          open={showArchived}
          onToggle={() => setShowArchived((value) => !value)}
        >
          <ActivationTable
            items={archivedItems}
            loading={loading}
            onRestore={onRestoreArchived}
            restoringId={restoringId}
            onPermanentDelete={onPermanentDeleteArchived}
            permanentDeletingId={permanentDeletingId}
            keyColumnLabel={keyColumnLabel}
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

function ProductColumn({ product, search }: { product: ProductItem; search: string }) {
  const deliveryType = resolveDeliveryType(product);
  if (deliveryType === "credentials") {
    return <CredentialsProductColumn product={product} search={search} />;
  }
  if (deliveryType === "vpn") {
    return <VpnProductColumn product={product} />;
  }
  if (deliveryType === "support") {
    return <KeyProductColumn product={product} search={search} mode="support" />;
  }
  if (deliveryType === "support_claude") {
    return <KeyProductColumn product={product} search={search} mode="support_claude" />;
  }

  return <KeyProductColumn product={product} search={search} mode="activation" />;
}

function productModeLabel(product: ProductItem) {
  const deliveryType = resolveDeliveryType(product);
  if (deliveryType === "credentials") return TEXT.modeCredentials;
  if (deliveryType === "vpn") return TEXT.modeVpn;
  if (deliveryType === "support") return TEXT.modeSupport;
  if (deliveryType === "support_claude") return TEXT.modeSupportClaude;
  return TEXT.modeActivation;
}

function productPoolHint(product: ProductItem) {
  const deliveryType = resolveDeliveryType(product);
  const baseProductKey = normalizeProductKey(product.slug);
  if (deliveryType === "credentials") return `productId: ${product.id}`;
  if (deliveryType === "vpn") return `productKey: ${baseProductKey}`;
  if (deliveryType === "support") return `poolKey: ${resolveKeyPoolProductKey(baseProductKey, "support")}`;
  if (deliveryType === "support_claude") return `poolKey: ${resolveKeyPoolProductKey(baseProductKey, "support_claude")}`;
  return `poolKey: ${baseProductKey}`;
}

function cleanProductTitle(title: string) {
  return String(title || "")
    .replace(/\s+впн\s+в\s+подарок/gi, "")
    .replace(/\s+vpn\s+в\s+подарок/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ProductsTable({
  products,
  activeProductId,
  onSelect,
  renderDetails,
  title = TEXT.products,
  hint = "Нажмите на товар, чтобы открыть коробку с ключами.",
}: {
  products: ProductItem[];
  activeProductId?: string;
  onSelect: (id: string) => void;
  renderDetails: (product: ProductItem) => React.ReactNode;
  title?: string;
  hint?: string;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/60">
            <tr>
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3">{TEXT.method}</th>
              <th className="px-4 py-3">Пул</th>
              <th className="px-4 py-3 text-right">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {products.map((product) => {
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
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{productModeLabel(product)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{productPoolHint(product)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className={isActive ? "btn-primary" : "btn-secondary"}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(product.id);
                        }}
                      >
                        {isActive ? TEXT.selected : TEXT.openKeys}
                      </button>
                    </td>
                  </tr>
                  {isActive ? (
                    <tr className="bg-slate-50/80 dark:bg-slate-950/40">
                      <td className="px-4 py-4" colSpan={4}>
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

export default function CdkKeysPage() {
  const [q, setQ] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedLegacyPoolId, setSelectedLegacyPoolId] = useState("");

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

  const poolStatsQuery = useQuery<CdkListResponse>({
    queryKey: ["cdks", "all-pool-stats"],
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
        activationVariants: item.activationVariants,
      }));
  }, [productsQuery.data]);

  const activeProduct = useMemo(() => {
    if (!products.length || !selectedProductId) return null;
    return products.find((product) => product.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  const visiblePoolKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const product of products) {
      const deliveryType = resolveDeliveryType(product);
      const base = normalizeProductKey(product.slug);
      if (deliveryType === "credentials") continue;
      if (deliveryType === "vpn") {
        keys.add(base);
        continue;
      }
      if (deliveryType === "support") {
        keys.add(resolveKeyPoolProductKey(base, "support"));
        continue;
      }
      if (deliveryType === "support_claude") {
        keys.add(resolveKeyPoolProductKey(base, "support_claude"));
        continue;
      }
      keys.add(base);
    }
    return keys;
  }, [products]);

  const legacyPools = useMemo(() => {
    const byProduct = poolStatsQuery.data?.stats?.byProduct || {};
    return Object.entries(byProduct)
      .filter(([key, value]) => !key.startsWith("tgbot-") && value.total > 0 && !visiblePoolKeys.has(key))
      .map(([key, value]) => ({
        id: key,
        slug: key,
        title: `${key} (${TEXT.unused}: ${value.unused}, ${TEXT.used}: ${value.used}, total: ${value.total})`,
        tags: ["delivery:support"],
        deliveryType: "support" as ProductDeliveryType,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }, [poolStatsQuery.data?.stats?.byProduct, visiblePoolKeys]);

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
    <div className="space-y-4">
      <section className="card p-4 space-y-2">
        <h2 className="text-lg font-semibold">{TEXT.title}</h2>
        <p className="text-sm text-slate-500">{TEXT.subtitle}</p>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={TEXT.searchPlaceholder} />
      </section>

      {productsQuery.isLoading ? <div className="card p-4 text-sm text-slate-500">{TEXT.loading}</div> : null}

      {!productsQuery.isLoading && !products.length ? <div className="card p-4 text-sm text-rose-600">{TEXT.noProducts}</div> : null}

      {products.length ? (
        <ProductsTable
          products={products}
          activeProductId={activeProduct?.id}
          onSelect={toggleSelectedProduct}
          renderDetails={(product) => <ProductColumn key={product.id} product={product} search={q} />}
        />
      ) : null}

      {poolStatsQuery.isLoading ? <div className="card p-4 text-sm text-slate-500">{TEXT.loading}</div> : null}

      {!poolStatsQuery.isLoading && legacyPools.length ? (
        <ProductsTable
          title={TEXT.legacyPools}
          hint={TEXT.legacyPoolsHint}
          products={legacyPools}
          activeProductId={activeLegacyPool?.id}
          onSelect={toggleSelectedLegacyPool}
          renderDetails={(pool) => (
            <KeyProductColumn
              key={pool.id}
              product={pool}
              search={q}
              mode="support"
              productKeyOverride={pool.slug}
            />
          )}
        />
      ) : null}
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

function resolveKeyPoolProductKey(baseProductKey: string, mode: "activation" | "support" | "support_claude") {
  if (mode === "support_claude") {
    return normalizeProductKey(`${baseProductKey}-sdk5`);
  }
  if (mode === "support") {
    return normalizeProductKey(`${baseProductKey}-sdk4`);
  }
  return baseProductKey;
}
