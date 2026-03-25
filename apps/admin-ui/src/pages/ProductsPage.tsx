import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { AlignCenter, AlignLeft, AlignRight, type LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/format";

type BadgeType = "none" | "best" | "new" | "hit" | "sale" | "popular" | "limited" | "gift" | "pro";
type ProductDeliveryType = "activation" | "credentials" | "vpn" | "support";
type VpnBundlePlan = "vpn_month" | "vpn_halfyear" | "vpn_year";
type TextAlignValue = "left" | "center" | "right";
type CardTextBlock = "title" | "description" | "price" | "duration" | "features" | "meta";
type CardTextAlignConfig = Record<CardTextBlock, TextAlignValue>;

type Product = {
  id: string;
  slug: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  modalDescription?: string;
  modalDescriptionEn?: string;
  price: number | string;
  currency: string;
  category: string;
  tags: string[];
  isActive: boolean;
  deliveryType?: ProductDeliveryType;
  deliveryMethod?: 1 | 2 | 3 | 4 | "1" | "2" | "3" | "4";
};

type ManualCredential = {
  id: string;
  login: string;
  password: string;
  status: "available" | "assigned";
  orderId: string | null;
  email: string | null;
  assignedAt: string | null;
};

const DEFAULT_PRODUCT_CATEGORY = "Подписки ChatGPT";
const CARD_TEXT_ALIGN_BLOCKS: CardTextBlock[] = ["title", "description", "price", "duration", "features", "meta"];
const CARD_TEXT_ALIGN_DEFAULT: CardTextAlignConfig = {
  title: "left",
  description: "left",
  price: "left",
  duration: "left",
  features: "left",
  meta: "left",
};
const CARD_TEXT_ALIGN_TAG_RE = /^align:(title|description|price|duration|features|meta):(left|center|right)$/i;
const CARD_TEXT_ALIGN_OPTIONS: Array<{ value: TextAlignValue; label: string; icon: LucideIcon }> = [
  { value: "left", label: "Слева", icon: AlignLeft },
  { value: "center", label: "Центр", icon: AlignCenter },
  { value: "right", label: "Справа", icon: AlignRight },
];
const CARD_TEXT_ALIGN_FIELDS: Array<{ key: CardTextBlock; label: string; hint: string }> = [
  { key: "title", label: "Название", hint: "Заголовок товара" },
  { key: "description", label: "Описание", hint: "Верхние строки под заголовком" },
  { key: "price", label: "Цена", hint: "Число и валюта" },
  { key: "duration", label: "Срок", hint: "Строка вида «Срок: ...»" },
  { key: "features", label: "Преимущества", hint: "Список пунктов внизу карточки" },
  { key: "meta", label: "Meta", hint: "Нижний блок «Авто / Безопасно / 24/7»" },
];

const LEGACY_MEDIA_LINE_RE = /^media\s*:\s*(image|video)\s*:\s*(.+)$/i;
const LEGACY_MEDIA_CAPTION_RE = /^media-caption\s*:\s*(.+)$/i;
const DURATION_LINE_RE = /^(?:[✓✔]\s*)?(?:срок|duration)\s*:/i;

function parseDescriptionWithMedia(value: string): {
  cleanDescription: string;
} {
  const lines = String(value || "").replace(/\r/g, "").split("\n");
  const cleanLines: string[] = [];

  lines.forEach((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      cleanLines.push("");
      return;
    }

    const mediaMatch = trimmed.match(LEGACY_MEDIA_LINE_RE);
    if (mediaMatch) {
      return;
    }

    const captionMatch = trimmed.match(LEGACY_MEDIA_CAPTION_RE);
    if (captionMatch) {
      return;
    }

    cleanLines.push(line);
  });

  const cleanDescription = cleanLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanDescription };
}

function composeDescriptionWithMedia(baseDescription: string): string {
  return parseDescriptionWithMedia(baseDescription).cleanDescription;
}

function normalizeMultilineText(value: string): string {
  return String(value || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeModalDescriptionText(value: string): string {
  return normalizeMultilineText(value);
}

function hasModalMediaDirectives(value: string): boolean {
  const lines = String(value || "").replace(/\r/g, "").split("\n");
  return lines.some((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return false;
    return LEGACY_MEDIA_LINE_RE.test(trimmed) || LEGACY_MEDIA_CAPTION_RE.test(trimmed);
  });
}

function parseDurationLabel(value: string): string {
  const lines = String(value || "").replace(/\r/g, "").split("\n");
  const durationLine = lines.map((line) => String(line || "").trim()).find((line) => DURATION_LINE_RE.test(line));
  if (!durationLine) return "";
  return durationLine.replace(/^(?:[✓✔]\s*)?(?:срок|duration)\s*:\s*/i, "").trim();
}

function withDurationLine(description: string, durationLabel: string, lang: "ru" | "en"): string {
  const cleanedDuration = String(durationLabel || "").trim();
  const lines = String(description || "").replace(/\r/g, "").split("\n");
  const withoutDuration = lines.filter((line) => !DURATION_LINE_RE.test(String(line || "").trim())).join("\n").trim();
  if (!cleanedDuration) return withoutDuration;
  const prefix = lang === "en" ? "Duration: " : "Срок: ";
  return withoutDuration ? `${withoutDuration}\n${prefix}${cleanedDuration}` : `${prefix}${cleanedDuration}`;
}

function getBadgeFromTags(tags: string[] = []): BadgeType {
  const list = Array.isArray(tags) ? tags : [];
  const found = list
    .map((tag) => String(tag || "").toLowerCase())
    .find((tag) => tag.startsWith("badge:"));
  if (!found) return "none";
  const value = found.split(":")[1] || "none";
  const allowed: BadgeType[] = ["none", "best", "new", "hit", "sale", "popular", "limited", "gift", "pro"];
  return allowed.includes(value as BadgeType) ? (value as BadgeType) : "none";
}

function buildDefaultCardTextAlign(): CardTextAlignConfig {
  return { ...CARD_TEXT_ALIGN_DEFAULT };
}

function normalizeTextAlignValue(value: string): TextAlignValue {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "center") return "center";
  if (normalized === "right") return "right";
  return "left";
}

function parseCardTextAlignFromTags(tags: string[] = []): CardTextAlignConfig {
  const result = buildDefaultCardTextAlign();
  const list = Array.isArray(tags) ? tags : [];
  list.forEach((tag) => {
    const match = String(tag || "").trim().toLowerCase().match(CARD_TEXT_ALIGN_TAG_RE);
    if (!match) return;
    const block = match[1] as CardTextBlock;
    result[block] = normalizeTextAlignValue(match[2]);
  });
  return result;
}

function withCardTextAlignTags(tags: string[] = [], alignConfig: CardTextAlignConfig): string[] {
  const list = Array.isArray(tags) ? tags : [];
  const cleaned = list.filter((tag) => !CARD_TEXT_ALIGN_TAG_RE.test(String(tag || "").trim().toLowerCase()));
  const resolved = alignConfig || buildDefaultCardTextAlign();
  const next = [...cleaned];
  CARD_TEXT_ALIGN_BLOCKS.forEach((block) => {
    const value = normalizeTextAlignValue(resolved[block]);
    next.push(`align:${block}:${value}`);
  });
  return next;
}

function withBadgeTag(tags: string[] = [], badge: BadgeType): string[] {
  const list = Array.isArray(tags) ? tags : [];
  const cleaned = list.filter((tag) => !String(tag || "").toLowerCase().startsWith("badge:"));
  if (badge === "none") return cleaned;
  return [...cleaned, `badge:${badge}`];
}

function resolveDeliveryType(item: Product): ProductDeliveryType {
  const fromMethod = String(item.deliveryMethod || "").trim();
  if (fromMethod === "4") return "support";
  if (fromMethod === "2") return "credentials";
  if (fromMethod === "3") return "vpn";
  if (fromMethod === "1") return "activation";

  const fromItem = String(item.deliveryType || "").trim().toLowerCase();
  if (fromItem === "support") return "support";
  if (fromItem === "credentials") return "credentials";
  if (fromItem === "vpn") return "vpn";
  const hasVpnTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:vpn");
  if (hasVpnTag) return "vpn";
  const hasSupportTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:support");
  if (hasSupportTag) return "support";
  const hasCredentialsTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:credentials");
  return hasCredentialsTag ? "credentials" : "activation";
}

function deliveryMethodNumber(deliveryType: ProductDeliveryType): 1 | 2 | 3 | 4 {
  if (deliveryType === "support") return 4;
  if (deliveryType === "vpn") return 3;
  return deliveryType === "credentials" ? 2 : 1;
}

function deliveryMethodLabel(deliveryType: ProductDeliveryType): string {
  if (deliveryType === "support") return "Метод 4: Ручная выдача через поддержку";
  if (deliveryType === "credentials") return "Метод 2: Логин и пароль";
  if (deliveryType === "vpn") return "Метод 3: VPN (VLESS)";
  return "Метод 1: Активация по ключу";
}

const VPN_BUNDLE_FLAG_TAG = "bundle:vpn";
const VPN_PLAN_TAG_PREFIX = "vpn:plan:";
const VPN_DAYS_TAG_PREFIX = "vpn:days:";
const VPN_USERS_TAG_PREFIX = "vpn:users:";
const DEFAULT_VPN_USERS_LIMIT = 1;
const VPN_BUNDLE_PLAN_DAYS: Record<VpnBundlePlan, number> = {
  vpn_month: 30,
  vpn_halfyear: 180,
  vpn_year: 365,
};

function normalizePlanCandidate(value: string): VpnBundlePlan {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "vpn_halfyear") return "vpn_halfyear";
  if (normalized === "vpn_year") return "vpn_year";
  return "vpn_month";
}

function normalizeVpnUsersLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_VPN_USERS_LIMIT;
  return Math.max(1, Math.min(16, Math.floor(parsed)));
}

function parseVpnUsersLimit(tags: string[] = []) {
  const list = Array.isArray(tags) ? tags : [];
  const normalized = list.map((tag) => String(tag || "").trim().toLowerCase());
  const usersTag = normalized.find(
    (tag) =>
      tag.startsWith(VPN_USERS_TAG_PREFIX) ||
      tag.startsWith("vpn_users:") ||
      tag.startsWith("vpn-users:") ||
      tag.startsWith("users:")
  );
  if (!usersTag) return DEFAULT_VPN_USERS_LIMIT;
  return normalizeVpnUsersLimit(usersTag.split(":").pop() || "");
}

function parseVpnBundleConfig(tags: string[] = []): { enabled: boolean; plan: VpnBundlePlan; usersLimit: number } {
  const list = Array.isArray(tags) ? tags : [];
  const normalized = list.map((tag) => String(tag || "").trim().toLowerCase());
  const enabled = normalized.includes(VPN_BUNDLE_FLAG_TAG);
  const usersLimit = parseVpnUsersLimit(list);
  const planTag = normalized.find((tag) => tag.startsWith(VPN_PLAN_TAG_PREFIX));
  if (planTag) {
    return { enabled, plan: normalizePlanCandidate(planTag.slice(VPN_PLAN_TAG_PREFIX.length)), usersLimit };
  }

  const daysTag = normalized.find((tag) => tag.startsWith(VPN_DAYS_TAG_PREFIX));
  const days = Number(daysTag?.slice(VPN_DAYS_TAG_PREFIX.length) || "");
  if (days >= 365) return { enabled, plan: "vpn_year", usersLimit };
  if (days >= 180) return { enabled, plan: "vpn_halfyear", usersLimit };
  return { enabled, plan: "vpn_month", usersLimit };
}

function withVpnBundleTags(tags: string[] = [], enabled: boolean, plan: VpnBundlePlan, usersLimit: number): string[] {
  const list = Array.isArray(tags) ? tags : [];
  const cleaned = list.filter((tag) => {
    const normalized = String(tag || "").trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === VPN_BUNDLE_FLAG_TAG) return false;
    if (normalized.startsWith(VPN_PLAN_TAG_PREFIX)) return false;
    if (normalized.startsWith(VPN_DAYS_TAG_PREFIX)) return false;
    if (
      normalized.startsWith(VPN_USERS_TAG_PREFIX) ||
      normalized.startsWith("vpn_users:") ||
      normalized.startsWith("vpn-users:") ||
      normalized.startsWith("users:")
    ) {
      return false;
    }
    return true;
  });
  if (!enabled) return cleaned;
  const normalizedUsersLimit = normalizeVpnUsersLimit(usersLimit);
  return [
    ...cleaned,
    VPN_BUNDLE_FLAG_TAG,
    `${VPN_PLAN_TAG_PREFIX}${plan}`,
    `${VPN_DAYS_TAG_PREFIX}${VPN_BUNDLE_PLAN_DAYS[plan]}`,
    `${VPN_USERS_TAG_PREFIX}${normalizedUsersLimit}`,
  ];
}

function withDirectVpnTags(tags: string[] = [], plan: VpnBundlePlan, usersLimit: number): string[] {
  const list = Array.isArray(tags) ? tags : [];
  const cleaned = list.filter((tag) => {
    const normalized = String(tag || "").trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === VPN_BUNDLE_FLAG_TAG) return false;
    if (normalized.startsWith(VPN_PLAN_TAG_PREFIX)) return false;
    if (normalized.startsWith(VPN_DAYS_TAG_PREFIX)) return false;
    if (
      normalized.startsWith(VPN_USERS_TAG_PREFIX) ||
      normalized.startsWith("vpn_users:") ||
      normalized.startsWith("vpn-users:") ||
      normalized.startsWith("users:")
    ) {
      return false;
    }
    return true;
  });
  const normalizedUsersLimit = normalizeVpnUsersLimit(usersLimit);
  return [
    ...cleaned,
    `${VPN_PLAN_TAG_PREFIX}${plan}`,
    `${VPN_DAYS_TAG_PREFIX}${VPN_BUNDLE_PLAN_DAYS[plan]}`,
    `${VPN_USERS_TAG_PREFIX}${normalizedUsersLimit}`,
  ];
}

function buildTags(title: string, badge: BadgeType): string[] {
  const tags = title
    .toLowerCase()
    .split(/[^a-z0-9а-яё]+/i)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);

  const base = tags.length ? tags : ["subscription"];
  return withBadgeTag(base, badge);
}

function vpnBundlePlanLabel(plan: VpnBundlePlan): string {
  if (plan === "vpn_halfyear") return "VPN 6 месяцев (180 дней)";
  if (plan === "vpn_year") return "VPN 12 месяцев (365 дней)";
  return "VPN 1 месяц (30 дней)";
}

function badgeLabel(badge: BadgeType): string {
  if (badge === "best") return "Лучший выбор";
  if (badge === "new") return "Новинка";
  if (badge === "hit") return "Хит";
  if (badge === "sale") return "Акция";
  if (badge === "popular") return "Популярно";
  if (badge === "limited") return "Ограничено";
  if (badge === "gift") return "Бонус";
  if (badge === "pro") return "Pro";
  return "Без плашки";
}

function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = String((error.response?.data as any)?.message || "").trim();
    if (apiMessage) return apiMessage;
    const status = error.response?.status;
    if (status === 403) return "Недостаточно прав для изменения товаров. Нужна роль ADMIN, OWNER или MANAGER.";
    if (status === 422) return "Проверьте обязательные поля формы.";
    if (status === 401) return "Сессия истекла. Войдите в админку заново.";
  }

  return fallback;
}

function normalizeCategoryValue(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function categoryKey(value: string): string {
  return normalizeCategoryValue(value).toLocaleLowerCase("ru");
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState(DEFAULT_PRODUCT_CATEGORY);
  const [newCategoryDraft, setNewCategoryDraft] = useState("");
  const [categoryNotice, setCategoryNotice] = useState<string | null>(null);
  const [manualCategories, setManualCategories] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [durationLabelRu, setDurationLabelRu] = useState("");
  const [durationLabelEn, setDurationLabelEn] = useState("");
  const [modalDescription, setModalDescription] = useState("");
  const [modalDescriptionEn, setModalDescriptionEn] = useState("");
  const [badge, setBadge] = useState<BadgeType>("none");
  const [deliveryType, setDeliveryType] = useState<ProductDeliveryType>("activation");
  const [vpnBundleEnabled, setVpnBundleEnabled] = useState(false);
  const [vpnBundlePlan, setVpnBundlePlan] = useState<VpnBundlePlan>("vpn_month");
  const [vpnUsersLimit, setVpnUsersLimit] = useState<number>(DEFAULT_VPN_USERS_LIMIT);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [cardTextAlign, setCardTextAlign] = useState<CardTextAlignConfig>(buildDefaultCardTextAlign());
  const [credentialsImportText, setCredentialsImportText] = useState("");
  const [credentialsMessage, setCredentialsMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dangerActionMessage, setDangerActionMessage] = useState<string | null>(null);
  const [isDangerActionPending, setIsDangerActionPending] = useState(false);

  const params = useMemo(
    () => ({
      page: 1,
      limit: 50,
      q,
      isArchived: false,
      ...(showInactive ? {} : { isActive: true }),
    }),
    [q, showInactive]
  );

  const products = useQuery({
    queryKey: ["products", params],
    queryFn: async () => (await api.get("/products", { params })).data,
  });

  const categoriesSource = useQuery({
    queryKey: ["products-categories"],
    queryFn: async () =>
      (
        await api.get("/products", {
          params: { page: 1, limit: 100, sortBy: "title", sortDir: "asc", isArchived: false },
        })
      ).data,
    staleTime: 60_000,
  });

  const categorySuggestions = useMemo(() => {
    const items = Array.isArray(categoriesSource.data?.items) ? (categoriesSource.data.items as Product[]) : [];
    const set = new Set<string>();
    items.forEach((item) => {
      const value = normalizeCategoryValue(item?.category || "");
      if (value) set.add(value);
    });
    manualCategories.forEach((value) => {
      const normalized = normalizeCategoryValue(value);
      if (normalized) set.add(normalized);
    });
    const current = normalizeCategoryValue(category);
    if (current) set.add(current);
    if (!set.size) set.add(DEFAULT_PRODUCT_CATEGORY);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [categoriesSource.data?.items, manualCategories, category]);

  const categoryRows = useMemo(() => {
    const items = Array.isArray(categoriesSource.data?.items) ? (categoriesSource.data.items as Product[]) : [];
    const map = new Map<string, { name: string; total: number; active: number; disabled: number }>();

    const ensure = (categoryName: string) => {
      const normalizedName = normalizeCategoryValue(categoryName);
      if (!normalizedName) return null;
      const key = categoryKey(normalizedName);
      if (!map.has(key)) {
        map.set(key, { name: normalizedName, total: 0, active: 0, disabled: 0 });
      }
      return map.get(key)!;
    };

    items.forEach((item) => {
      const bucket = ensure(String(item?.category || ""));
      if (!bucket) return;
      bucket.total += 1;
      if (item.isActive) bucket.active += 1;
      else bucket.disabled += 1;
    });

    categorySuggestions.forEach((name) => {
      ensure(name);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [categoriesSource.data?.items, categorySuggestions]);

  const credentials = useQuery({
    queryKey: ["product-credentials", editingId],
    enabled: Boolean(editingId && deliveryType === "credentials"),
    queryFn: async () =>
      (await api.get(`/products/${editingId}/credentials`, { params: { status: undefined } })).data as {
        items: ManualCredential[];
        stats: { total: number; available: number; assigned: number };
      },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/products/${id}/status`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.patch(`/products/${id}/status`, { isArchived: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const bulk = useMutation({
    mutationFn: (payload: { productIds: string[]; mode: "percent"; value: number }) => api.patch("/products/bulk/price", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const createProduct = useMutation({
    mutationFn: (payload: any) => api.post("/products", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-categories"] });
    },
  });

  const updateProduct = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => api.put(`/products/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-categories"] });
    },
  });

  const autoTranslate = useMutation({
    mutationFn: async (payload: { title: string; description: string }) =>
      (await api.post("/products/translate/ru-en", payload)).data as { titleEn: string; descriptionEn: string; provider: string },
  });

  const importCredentials = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) =>
      (await api.post(`/products/${id}/credentials/import`, { text })).data as {
        inserted: number;
        skipped: number;
        stats: { total: number; available: number; assigned: number };
      },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-credentials", editingId] });
    },
  });

  const deleteCredential = useMutation({
    mutationFn: async ({ productId, credentialId }: { productId: string; credentialId: string }) =>
      api.delete(`/products/${productId}/credentials/${credentialId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-credentials", editingId] });
    },
  });

  async function fetchAllProducts(params: Record<string, string | number | boolean | undefined>) {
    const limit = 100;
    let page = 1;
    let totalPages = 1;
    const result: Product[] = [];

    while (page <= totalPages) {
      const response = await api.get("/products", {
        params: {
          page,
          limit,
          sortBy: "createdAt",
          sortDir: "desc",
          ...params,
        },
      });

      const payload = response.data as { items?: Product[]; total?: number };
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const total = Number(payload?.total || 0);

      result.push(...items);
      totalPages = Math.max(1, Math.ceil(total / limit));
      if (!items.length) break;
      page += 1;
    }

    return result;
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setTitleEn("");
    setPrice("");
    setCategory(DEFAULT_PRODUCT_CATEGORY);
    setNewCategoryDraft("");
    setCategoryNotice(null);
    setDescription("");
    setDescriptionEn("");
    setDurationLabelRu("");
    setDurationLabelEn("");
    setModalDescription("");
    setModalDescriptionEn("");
    setBadge("none");
    setDeliveryType("activation");
    setVpnBundleEnabled(false);
    setVpnBundlePlan("vpn_month");
    setVpnUsersLimit(DEFAULT_VPN_USERS_LIMIT);
    setEditingTags([]);
    setCardTextAlign(buildDefaultCardTextAlign());
    setCredentialsImportText("");
    setCredentialsMessage(null);
    setFormError(null);
    setDangerActionMessage(null);
  }

  async function onBulkMinus10(e: FormEvent) {
    e.preventDefault();
    const ids = products.data?.items?.map((item: Product) => item.id) || [];
    if (!ids.length) return;
    await bulk.mutateAsync({ productIds: ids, mode: "percent", value: -10 });
  }

  async function onToggle(item: Product) {
    await toggle.mutateAsync({ id: item.id, isActive: !item.isActive });
  }

  function onEdit(item: Product) {
    const parsedRu = parseDescriptionWithMedia(item.description || "");
    const parsedEn = parseDescriptionWithMedia(item.descriptionEn || "");
    const parsedDurationRu = parseDurationLabel(item.description || "");
    const parsedDurationEn = parseDurationLabel(item.descriptionEn || "");
    const modalRuSource = String(item.modalDescription || item.description || "");
    const modalEnSource = String(item.modalDescriptionEn || item.descriptionEn || modalRuSource || "");

    setEditingId(item.id);
    setTitle(item.title || "");
    setTitleEn(item.titleEn || "");
    setPrice(String(item.price ?? ""));
    setCategory(normalizeCategoryValue(item.category || "") || DEFAULT_PRODUCT_CATEGORY);
    setNewCategoryDraft("");
    setCategoryNotice(null);
    setDescription(withDurationLine(parsedRu.cleanDescription || "", "", "ru"));
    setDescriptionEn(withDurationLine(parsedEn.cleanDescription || "", "", "en"));
    setDurationLabelRu(parsedDurationRu);
    setDurationLabelEn(parsedDurationEn || parsedDurationRu);
    setModalDescription(normalizeModalDescriptionText(modalRuSource));
    setModalDescriptionEn(normalizeModalDescriptionText(modalEnSource));
    setBadge(getBadgeFromTags(item.tags || []));
    setDeliveryType(resolveDeliveryType(item));
    const bundleConfig = parseVpnBundleConfig(item.tags || []);
    setVpnBundleEnabled(bundleConfig.enabled);
    setVpnBundlePlan(bundleConfig.plan);
    setVpnUsersLimit(bundleConfig.usersLimit);
    setEditingTags(Array.isArray(item.tags) ? item.tags : []);
    setCardTextAlign(parseCardTextAlignFromTags(item.tags || []));
    setCredentialsImportText("");
    setCredentialsMessage(null);
    setFormError(null);
  }

  function onCardTextAlignChange(block: CardTextBlock, value: TextAlignValue) {
    setCardTextAlign((prev) => ({
      ...prev,
      [block]: normalizeTextAlignValue(value),
    }));
  }

  async function onSubmitProductForm(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCategoryNotice(null);

    const cleanTitle = title.trim();
    let cleanTitleEn = titleEn.trim();
    const cleanCategory = normalizeCategoryValue(category);
    let cleanDescription = parseDescriptionWithMedia(description).cleanDescription.trim();
    let cleanDescriptionEn = parseDescriptionWithMedia(descriptionEn).cleanDescription.trim();
    let cleanDurationRu = String(durationLabelRu || "").trim() || parseDurationLabel(cleanDescription);
    let cleanDurationEn = String(durationLabelEn || "").trim() || parseDurationLabel(cleanDescriptionEn);
    cleanDescription = withDurationLine(cleanDescription, "", "ru");
    cleanDescriptionEn = withDurationLine(cleanDescriptionEn, "", "en");
    const cleanModalDescription = normalizeModalDescriptionText(modalDescription);
    let cleanModalDescriptionEn = normalizeModalDescriptionText(modalDescriptionEn);
    const normalizedPrice = Number(String(price).replace(",", "."));

    if (cleanTitle.length < 3) {
      setFormError("Название должно быть не короче 3 символов.");
      return;
    }

    if (cleanDescription.length < 10) {
      setFormError("Описание должно быть не короче 10 символов.");
      return;
    }

    if (cleanTitleEn.length < 3 || cleanDescriptionEn.length < 10) {
      try {
        const translated = await autoTranslate.mutateAsync({
          title: cleanTitle,
          description: cleanDescription,
        });
        cleanTitleEn = String(translated?.titleEn || "").trim();
        cleanDescriptionEn = withDurationLine(
          parseDescriptionWithMedia(String(translated?.descriptionEn || "")).cleanDescription.trim(),
          "",
          "en"
        );
        setTitleEn(cleanTitleEn);
        setDescriptionEn(cleanDescriptionEn);
      } catch {
        setFormError("Не удалось выполнить автоперевод RU -> EN. Заполните English поля вручную или повторите позже.");
        return;
      }
    }

    if (cleanTitleEn.length < 3) {
      setFormError("English title must be at least 3 characters.");
      return;
    }

    if (cleanDescriptionEn.length < 10) {
      setFormError("English description must be at least 10 characters.");
      return;
    }

    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      setFormError("Укажите корректную цену больше 0.");
      return;
    }

    if (cleanCategory.length < 2) {
      setFormError("Категория должна быть не короче 2 символов.");
      return;
    }
    if (cleanCategory.length > 100) {
      setFormError("Категория должна быть не длиннее 100 символов.");
      return;
    }

    if (cleanDurationRu && !cleanDurationEn) {
      try {
        const translatedDuration = await autoTranslate.mutateAsync({
          title: cleanTitle,
          description: `Срок: ${cleanDurationRu}`,
        });
        const translatedDurationEn = parseDurationLabel(String(translatedDuration?.descriptionEn || ""));
        cleanDurationEn = translatedDurationEn || cleanDurationRu;
      } catch {
        cleanDurationEn = cleanDurationRu;
      }
      setDurationLabelEn(cleanDurationEn);
    }

    if (!cleanDurationEn && cleanDurationRu) {
      cleanDurationEn = cleanDurationRu;
    }

    const finalDescriptionRu = withDurationLine(composeDescriptionWithMedia(cleanDescription), cleanDurationRu, "ru");
    const finalDescriptionEn = withDurationLine(composeDescriptionWithMedia(cleanDescriptionEn), cleanDurationEn, "en");

    if (cleanModalDescription && !cleanModalDescriptionEn) {
      if (hasModalMediaDirectives(cleanModalDescription)) {
        cleanModalDescriptionEn = cleanModalDescription;
      } else {
        try {
          const translatedModal = await autoTranslate.mutateAsync({
            title: cleanTitle,
            description: cleanModalDescription,
          });
          cleanModalDescriptionEn = normalizeModalDescriptionText(String(translatedModal?.descriptionEn || ""));
        } catch {
          cleanModalDescriptionEn = cleanModalDescription;
        }
      }
      setModalDescriptionEn(cleanModalDescriptionEn);
    }

    const normalizedVpnUsersLimit = normalizeVpnUsersLimit(vpnUsersLimit);

    if (editingId) {
      const tagsWithAlign = withCardTextAlignTags(withBadgeTag(editingTags, badge), cardTextAlign);
      const preparedTags =
        deliveryType === "vpn"
          ? withDirectVpnTags(tagsWithAlign, vpnBundlePlan, normalizedVpnUsersLimit)
          : withVpnBundleTags(tagsWithAlign, vpnBundleEnabled, vpnBundlePlan, normalizedVpnUsersLimit);
      await updateProduct.mutateAsync({
        id: editingId,
        payload: {
          title: cleanTitle,
          titleEn: cleanTitleEn,
          category: cleanCategory,
          description: finalDescriptionRu,
          descriptionEn: finalDescriptionEn,
          modalDescription: cleanModalDescription,
          modalDescriptionEn: cleanModalDescriptionEn,
          price: normalizedPrice,
          tags: preparedTags,
          deliveryType,
          deliveryMethod: deliveryMethodNumber(deliveryType),
        },
      });
      resetForm();
      return;
    }

    const createdBaseTags = buildTags(cleanTitle, badge);
    const createdTagsWithAlign = withCardTextAlignTags(createdBaseTags, cardTextAlign);
    const preparedTags =
      deliveryType === "vpn"
        ? withDirectVpnTags(createdTagsWithAlign, vpnBundlePlan, normalizedVpnUsersLimit)
        : withVpnBundleTags(createdTagsWithAlign, vpnBundleEnabled, vpnBundlePlan, normalizedVpnUsersLimit);
    await createProduct.mutateAsync({
      title: cleanTitle,
      titleEn: cleanTitleEn,
      description: finalDescriptionRu,
      descriptionEn: finalDescriptionEn,
      modalDescription: cleanModalDescription,
      modalDescriptionEn: cleanModalDescriptionEn,
      price: normalizedPrice,
      oldPrice: null,
      currency: "RUB",
      category: cleanCategory,
      tags: preparedTags,
      stock: null,
      isActive: true,
      deliveryType,
      deliveryMethod: deliveryMethodNumber(deliveryType),
    });

    resetForm();
  }

  function onPickCategory(value: string) {
    const normalized = normalizeCategoryValue(value);
    if (!normalized) return;
    setCategory(normalized);
    setCategoryNotice(null);
  }

  function onAddCategory() {
    const normalized = normalizeCategoryValue(newCategoryDraft);
    if (normalized.length < 2) {
      setCategoryNotice("Введите название категории (минимум 2 символа).");
      return;
    }
    if (normalized.length > 100) {
      setCategoryNotice("Категория должна быть не длиннее 100 символов.");
      return;
    }

    const existing = categorySuggestions.find((item) => categoryKey(item) === categoryKey(normalized));
    if (existing) {
      setCategory(existing);
      setNewCategoryDraft("");
      setCategoryNotice("Категория уже существует и выбрана.");
      return;
    }

    setManualCategories((prev) => [...prev, normalized]);
    setCategory(normalized);
    setNewCategoryDraft("");
    setCategoryNotice("Категория добавлена. Сохраните товар, чтобы она появилась в каталоге.");
  }

  async function onDeleteDisabledProducts(categoryFilter?: string) {
    setDangerActionMessage(null);
    const categoryName = normalizeCategoryValue(categoryFilter || "");
    const warning = categoryName
      ? `Удалить отключенные товары в категории «${categoryName}»?`
      : "Удалить ВСЕ отключенные товары?";

    if (!window.confirm(`${warning}\n\nТовары с историей заказов могут не удалиться и будут пропущены.`)) {
      return;
    }

    setIsDangerActionPending(true);
    try {
      const disabledItems = await fetchAllProducts({
        isActive: false,
        isArchived: false,
        ...(categoryName ? { category: categoryName } : {}),
      });

      if (!disabledItems.length) {
        setDangerActionMessage(categoryName ? `В категории «${categoryName}» нет отключенных товаров.` : "Отключенные товары не найдены.");
        return;
      }

      let deleted = 0;
      let archived = 0;
      let skipped = 0;

      for (const item of disabledItems) {
        try {
          await api.delete(`/products/${item.id}`);
          deleted += 1;
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            try {
              await api.patch(`/products/${item.id}/status`, { isArchived: true, isActive: false });
              archived += 1;
              continue;
            } catch {
              // ignore and count as skipped below
            }
          }
          skipped += 1;
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["products-categories"] }),
      ]);

      setDangerActionMessage(`Удалено: ${deleted}. В архив: ${archived}. Пропущено: ${skipped}.`);
    } catch (error) {
      setDangerActionMessage(getRequestErrorMessage(error, "Не удалось удалить отключенные товары."));
    } finally {
      setIsDangerActionPending(false);
    }
  }

  async function onDeleteSingleDisabledProduct(item: Product) {
    setDangerActionMessage(null);
    if (item.isActive) {
      setDangerActionMessage("Можно удалить только отключенный товар.");
      return;
    }
    if (!window.confirm(`Удалить отключенный товар «${item.title}»?`)) return;

    setIsDangerActionPending(true);
    try {
      await api.delete(`/products/${item.id}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["products-categories"] }),
      ]);
      setDangerActionMessage(`Товар «${item.title}» удален.`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        try {
          await api.patch(`/products/${item.id}/status`, { isArchived: true, isActive: false });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["products"] }),
            queryClient.invalidateQueries({ queryKey: ["products-categories"] }),
          ]);
          setDangerActionMessage(`Товар «${item.title}» связан с заказами и отправлен в архив.`);
          return;
        } catch {
          // If archival also fails, fall back to generic error below.
        }
      }
      setDangerActionMessage(getRequestErrorMessage(error, "Не удалось удалить товар. Возможно, есть связанные заказы."));
    } finally {
      setIsDangerActionPending(false);
    }
  }

  async function onDeleteCategory(categoryName: string) {
    setDangerActionMessage(null);
    const sourceCategory = normalizeCategoryValue(categoryName);
    if (!sourceCategory) return;

    const sourceKey = categoryKey(sourceCategory);
    const defaultKey = categoryKey(DEFAULT_PRODUCT_CATEGORY);
    if (sourceKey === defaultKey) {
      setDangerActionMessage("Базовую категорию «Подписки ChatGPT» удалить нельзя.");
      return;
    }

    const categoryInfo = categoryRows.find((row) => categoryKey(row.name) === sourceKey);
    const confirmDelete = window.confirm(
      `Удалить категорию «${sourceCategory}»?\n` +
        `Товаров: ${categoryInfo?.total ?? 0} (активных: ${categoryInfo?.active ?? 0}, отключенных: ${categoryInfo?.disabled ?? 0}).\n\n` +
        "После подтверждения товары будут перенесены в другую категорию или удалены по вашему выбору."
    );
    if (!confirmDelete) return;

    setIsDangerActionPending(true);
    try {
      const sourceItems = await fetchAllProducts({ category: sourceCategory, isArchived: false });
      if (!sourceItems.length) {
        setManualCategories((prev) => prev.filter((value) => categoryKey(value) !== sourceKey));
        if (categoryKey(category) === sourceKey) setCategory(DEFAULT_PRODUCT_CATEGORY);
        setDangerActionMessage(`Категория «${sourceCategory}» уже пустая и удалена из списка.`);
        return;
      }

      const targetPrompt = window.prompt(
        `Удаление категории «${sourceCategory}».\nВведите категорию, куда перенести оставшиеся товары:`,
        DEFAULT_PRODUCT_CATEGORY
      );

      if (targetPrompt === null) return;

      const targetCategory = normalizeCategoryValue(targetPrompt);
      if (targetCategory.length < 2) {
        setDangerActionMessage("Категория назначения должна быть не короче 2 символов.");
        return;
      }
      if (categoryKey(targetCategory) === sourceKey) {
        setDangerActionMessage("Категория назначения должна отличаться от удаляемой.");
        return;
      }

      const shouldDeleteDisabled = window.confirm(
        `Удалять отключенные товары из «${sourceCategory}»?\n\nOK: удалять (и переносить только те, что не удалились)\nОтмена: перенести все товары в «${targetCategory}»`
      );

      let moved = 0;
      let deleted = 0;
      let skipped = 0;

      for (const item of sourceItems) {
        const canDelete = !item.isActive && shouldDeleteDisabled;
        if (canDelete) {
          try {
            await api.delete(`/products/${item.id}`);
            deleted += 1;
            continue;
          } catch {
            // Fallback: keep category cleanup by moving undeletable records.
          }
        }

        try {
          await api.put(`/products/${item.id}`, { category: targetCategory });
          moved += 1;
        } catch {
          skipped += 1;
        }
      }

      if (!categorySuggestions.some((value) => categoryKey(value) === categoryKey(targetCategory))) {
        setManualCategories((prev) => [...prev, targetCategory]);
      }
      if (categoryKey(category) === sourceKey) setCategory(targetCategory);
      setManualCategories((prev) => prev.filter((value) => categoryKey(value) !== sourceKey));

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["products-categories"] }),
      ]);

      setDangerActionMessage(
        `Категория «${sourceCategory}» очищена. Перенесено: ${moved}. Удалено: ${deleted}. Пропущено: ${skipped}.`
      );
    } catch (error) {
      setDangerActionMessage(getRequestErrorMessage(error, "Не удалось удалить категорию."));
    } finally {
      setIsDangerActionPending(false);
    }
  }

  async function onAutoTranslateClick() {
    setFormError(null);
    const cleanTitle = title.trim();
    const cleanDescriptionRaw = parseDescriptionWithMedia(description).cleanDescription.trim();
    const cleanDescription = withDurationLine(cleanDescriptionRaw, "", "ru");
    const cleanDurationRu = String(durationLabelRu || "").trim() || parseDurationLabel(cleanDescriptionRaw);

    if (cleanTitle.length < 3) {
      setFormError("Сначала заполните название на русском (минимум 3 символа).");
      return;
    }
    if (cleanDescription.length < 10) {
      setFormError("Сначала заполните описание на русском (минимум 10 символов).");
      return;
    }

    try {
      const translated = await autoTranslate.mutateAsync({
        title: cleanTitle,
        description: cleanDescription,
      });
      setTitleEn(String(translated?.titleEn || "").trim());
      setDescriptionEn(
        withDurationLine(parseDescriptionWithMedia(String(translated?.descriptionEn || "")).cleanDescription.trim(), "", "en")
      );
      if (cleanDurationRu) {
        if (!String(durationLabelRu || "").trim()) setDurationLabelRu(cleanDurationRu);
        try {
          const translatedDuration = await autoTranslate.mutateAsync({
            title: cleanTitle,
            description: `Срок: ${cleanDurationRu}`,
          });
          const translatedDurationEn = parseDurationLabel(String(translatedDuration?.descriptionEn || ""));
          setDurationLabelEn(translatedDurationEn || cleanDurationRu);
        } catch {
          setDurationLabelEn(cleanDurationRu);
        }
      }
      const cleanModalDescription = normalizeModalDescriptionText(modalDescription);
      if (cleanModalDescription) {
        if (hasModalMediaDirectives(cleanModalDescription)) {
          setModalDescriptionEn(cleanModalDescription);
        } else {
          try {
            const translatedModal = await autoTranslate.mutateAsync({
              title: cleanTitle,
              description: cleanModalDescription,
            });
            setModalDescriptionEn(normalizeModalDescriptionText(String(translatedModal?.descriptionEn || "")));
          } catch {
            setModalDescriptionEn(cleanModalDescription);
          }
        }
      }
    } catch {
      setFormError("Не удалось выполнить автоперевод RU -> EN. Повторите позже.");
    }
  }

  async function onImportCredentialsClick() {
    setCredentialsMessage(null);
    if (!editingId) {
      setCredentialsMessage("Сначала выберите товар через «Редактировать».");
      return;
    }
    if (deliveryType !== "credentials") {
      setCredentialsMessage("Импорт доступен только для типа «Логин/пароль».");
      return;
    }
    const text = String(credentialsImportText || "").trim();
    if (!text) {
      setCredentialsMessage("Добавьте строки формата login:password.");
      return;
    }

    try {
      const result = await importCredentials.mutateAsync({ id: editingId, text });
      setCredentialsImportText("");
      setCredentialsMessage(`Импорт завершен: добавлено ${result.inserted}, пропущено ${result.skipped}.`);
    } catch (error) {
      setCredentialsMessage(getRequestErrorMessage(error, "Не удалось импортировать логины и пароли."));
    }
  }

  async function onDeleteCredential(productId: string, credentialId: string) {
    setCredentialsMessage(null);
    try {
      await deleteCredential.mutateAsync({ productId, credentialId });
      setCredentialsMessage("Запись удалена.");
    } catch (error) {
      setCredentialsMessage(getRequestErrorMessage(error, "Не удалось удалить запись."));
    }
  }

  const isSaving = createProduct.isPending || updateProduct.isPending;
  const saveError = createProduct.error || updateProduct.error;
  const saveErrorMessage = saveError
    ? getRequestErrorMessage(saveError, "Не удалось сохранить товар. Проверьте данные и соединение с API.")
    : null;

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <form className="grid gap-2 md:grid-cols-4" onSubmit={onSubmitProductForm}>
          <textarea
            className="input min-h-12 resize-y md:col-span-2"
            placeholder="Название товара (RU). Shift+Enter — перенос строки."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="input min-h-12 resize-y md:col-span-2"
            placeholder="Product title (EN). Shift+Enter for line break."
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
          />
          <input className="input" placeholder="Цена (RUB)" value={price} onChange={(e) => setPrice(e.target.value)} />
          <select className="input" value={badge} onChange={(e) => setBadge(e.target.value as BadgeType)}>
            <option value="none">Без плашки</option>
            <option value="best">Лучший выбор</option>
            <option value="new">Новинка</option>
            <option value="hit">Хит</option>
            <option value="sale">Акция</option>
            <option value="popular">Популярно</option>
            <option value="limited">Ограничено</option>
            <option value="gift">Бонус</option>
            <option value="pro">Pro</option>
          </select>
          <select className="input" value={deliveryType} onChange={(e) => setDeliveryType(e.target.value as ProductDeliveryType)}>
            <option value="activation">Метод 1: Активация по ключу</option>
            <option value="credentials">Метод 2: Выдача логин/пароль</option>
            <option value="vpn">Метод 3: Выдача VPN</option>
            <option value="support">Метод 4: Ручная выдача через поддержку</option>
          </select>
          <button className="btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "Сохраняем..." : editingId ? "Сохранить изменения" : "Добавить товар"}
          </button>

          <div className="md:col-span-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-700 dark:border-cyan-700/40 dark:bg-cyan-900/30 dark:text-cyan-200">
                Выравнивание текста карточки
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-300">Отдельно для каждого товара и каждого блока</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {CARD_TEXT_ALIGN_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950"
                >
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{field.label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{field.hint}</div>
                  </div>
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
                    {CARD_TEXT_ALIGN_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const active = cardTextAlign[field.key] === option.value;
                      return (
                        <button
                          key={`${field.key}:${option.value}`}
                          type="button"
                          className={`inline-flex items-center gap-1 border-r px-2 py-1 text-[11px] font-semibold transition last:border-r-0 ${
                            active
                              ? "border-cyan-500 bg-cyan-600 text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                          }`}
                          onClick={() => onCardTextAlignChange(field.key, option.value)}
                          title={`${field.label}: ${option.label}`}
                        >
                          <Icon size={14} />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-700 dark:border-indigo-700/40 dark:bg-indigo-900/30 dark:text-indigo-200">
                Категории
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-300">
                Текущая: <strong>{normalizeCategoryValue(category) || "—"}</strong>
              </span>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="input"
                placeholder="Категория товара (например: Подписки ChatGPT)"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="product-categories"
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onPickCategory(category)}
                disabled={!normalizeCategoryValue(category)}
              >
                Выбрать
              </button>
            </div>

            <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="input"
                placeholder="Новая категория"
                value={newCategoryDraft}
                onChange={(e) => setNewCategoryDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAddCategory();
                  }
                }}
              />
              <button type="button" className="btn-secondary" onClick={onAddCategory}>
                Добавить категорию
              </button>
            </div>

            <datalist id="product-categories">
              {categorySuggestions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>

            <div className="mt-3 flex flex-wrap gap-2">
              {categoryRows.map((row) => {
                const active = categoryKey(row.name) === categoryKey(category);
                const removable = categoryKey(row.name) !== categoryKey(DEFAULT_PRODUCT_CATEGORY);
                return (
                  <span
                    key={row.name}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${
                      active
                        ? "border-indigo-400 bg-indigo-100 text-indigo-800 dark:border-indigo-500/50 dark:bg-indigo-900/40 dark:text-indigo-100"
                        : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    }`}
                  >
                    <button type="button" onClick={() => onPickCategory(row.name)} className="px-1">
                      {row.name} ({row.total})
                    </button>
                    {removable && (
                      <button
                        type="button"
                        onClick={() => onDeleteCategory(row.name)}
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/30"
                        title={`Удалить категорию «${row.name}»`}
                        disabled={isDangerActionPending}
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
            </div>

            {categoryNotice && <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{categoryNotice}</div>}
            {dangerActionMessage && <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{dangerActionMessage}</div>}
          </div>

          <div className="md:col-span-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="font-semibold">Текущий режим выдачи: {deliveryMethodLabel(deliveryType)}</div>
            <div>
              Метод 1: после оплаты клиент проходит активацию ключом на странице активации.
            </div>
            <div>
              Метод 2: после оплаты клиент получает логин/пароль из вашего пула. Если пул пустой, показывается сообщение обратиться в поддержку.
            </div>
            <div>
              Метод 3: после оплаты автоматически создается/продлевается VPN-доступ (VLESS Reality) через 3x-ui API.
            </div>
            <div>
              Метод 4: после оплаты клиент получает инструкцию написать в поддержку, выдача выполняется вручную в чате.
            </div>
            {deliveryType === "vpn" && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-950">
                <div className="font-semibold">Настройки VPN-товара</div>
                <div className="mt-2 grid gap-2 md:max-w-sm">
                  <select className="input" value={vpnBundlePlan} onChange={(e) => setVpnBundlePlan(normalizePlanCandidate(e.target.value))}>
                    <option value="vpn_month">{vpnBundlePlanLabel("vpn_month")}</option>
                    <option value="vpn_halfyear">{vpnBundlePlanLabel("vpn_halfyear")}</option>
                    <option value="vpn_year">{vpnBundlePlanLabel("vpn_year")}</option>
                  </select>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={16}
                    step={1}
                    value={vpnUsersLimit}
                    onChange={(e) => setVpnUsersLimit(normalizeVpnUsersLimit(e.target.value))}
                    placeholder="Лимит устройств (1-16)"
                  />
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Для этого товара будет выдаваться VPN: срок по плану и максимум {normalizeVpnUsersLimit(vpnUsersLimit)} устройство(а) на один доступ.
                  </div>
                </div>
              </div>
            )}
            {deliveryType !== "vpn" && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-950">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vpnBundleEnabled}
                    onChange={(e) => setVpnBundleEnabled(e.target.checked)}
                  />
                  <span className="font-semibold">Выдать VPN в пакете (bundle)</span>
                </label>
                {vpnBundleEnabled && (
                  <div className="mt-2 grid gap-2 md:max-w-sm">
                    <select className="input" value={vpnBundlePlan} onChange={(e) => setVpnBundlePlan(normalizePlanCandidate(e.target.value))}>
                      <option value="vpn_month">{vpnBundlePlanLabel("vpn_month")}</option>
                      <option value="vpn_halfyear">{vpnBundlePlanLabel("vpn_halfyear")}</option>
                      <option value="vpn_year">{vpnBundlePlanLabel("vpn_year")}</option>
                    </select>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={16}
                      step={1}
                      value={vpnUsersLimit}
                      onChange={(e) => setVpnUsersLimit(normalizeVpnUsersLimit(e.target.value))}
                      placeholder="Лимит устройств (1-16)"
                    />
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      При оплате этого товара клиент получит основную выдачу + VPN с источником <code>bundle</code> и лимитом {normalizeVpnUsersLimit(vpnUsersLimit)} устройство(а).
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <textarea
            className="input md:col-span-2 min-h-24"
            placeholder="Описание товара (RU)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <textarea
            className="input md:col-span-2 min-h-24"
            placeholder="Product description (EN)"
            value={descriptionEn}
            onChange={(e) => setDescriptionEn(e.target.value)}
          />
          <input
            className="input md:col-span-2"
            placeholder="Срок для карточки (RU), например: 1 год"
            value={durationLabelRu}
            onChange={(e) => setDurationLabelRu(e.target.value)}
          />
          <input
            className="input md:col-span-2"
            placeholder="Duration for card (EN), e.g. 1 year"
            value={durationLabelEn}
            onChange={(e) => setDurationLabelEn(e.target.value)}
          />
          <div className="md:col-span-4 text-xs text-slate-600 dark:text-slate-300">
            Поле добавляет отдельную строку на карточке: <strong>✓ Срок: ...</strong> (для EN: <strong>✓ Duration: ...</strong>).
          </div>

          <div className="md:col-span-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 text-sm font-semibold">Описание для модального окна оплаты</div>
            <div className="grid gap-2 md:grid-cols-2">
              <textarea
                className="input min-h-24"
                placeholder="Текст в модальном окне (RU)"
                value={modalDescription}
                onChange={(e) => setModalDescription(e.target.value)}
              />
              <textarea
                className="input min-h-24"
                placeholder="Text for checkout modal (EN)"
                value={modalDescriptionEn}
                onChange={(e) => setModalDescriptionEn(e.target.value)}
              />
            </div>
            <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Этот текст показывается между блоком названия/цены и полями Email/Промокод в модальном окне оплаты.
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Поддерживаются служебные строки: <code>media:image:https://...</code>, <code>media:video:https://...</code>, <code>media-caption:...</code>.
            </div>
          </div>

          {editingId && deliveryType === "credentials" && (
            <div className="md:col-span-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 text-sm font-semibold">Логин/пароль для автоматической выдачи</div>
              <textarea
                className="input min-h-24 w-full font-mono text-xs"
                placeholder={"Формат: login:password\\nПо одной паре в строке"}
                value={credentialsImportText}
                onChange={(e) => setCredentialsImportText(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onImportCredentialsClick}
                  disabled={importCredentials.isPending}
                >
                  {importCredentials.isPending ? "Импортируем..." : "Импортировать пары"}
                </button>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {credentials.data?.stats
                    ? `Всего: ${credentials.data.stats.total}, свободно: ${credentials.data.stats.available}, выдано: ${credentials.data.stats.assigned}`
                    : "Загрузка пула..."}
                </span>
              </div>
              {credentialsMessage && <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{credentialsMessage}</div>}
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-100 text-left dark:bg-slate-800">
                    <tr>
                      <th className="px-2 py-2">Логин</th>
                      <th className="px-2 py-2">Пароль</th>
                      <th className="px-2 py-2">Статус</th>
                      <th className="px-2 py-2">Заказ</th>
                      <th className="px-2 py-2">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(credentials.data?.items || []).map((cred) => (
                      <tr key={cred.id} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="px-2 py-2 font-mono">{cred.login}</td>
                        <td className="px-2 py-2 font-mono">{cred.password}</td>
                        <td className="px-2 py-2">{cred.status === "available" ? "Свободен" : "Выдан"}</td>
                        <td className="px-2 py-2">{cred.orderId || "-"}</td>
                        <td className="px-2 py-2">
                          {cred.status === "available" ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => onDeleteCredential(editingId, cred.id)}
                              disabled={deleteCredential.isPending}
                            >
                              Удалить
                            </button>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button className="btn-secondary md:col-span-4" type="button" onClick={onAutoTranslateClick} disabled={autoTranslate.isPending || isSaving}>
            {autoTranslate.isPending ? "Переводим RU -> EN..." : "Автоперевод RU -> EN"}
          </button>

          {editingId && (
            <button className="btn-secondary md:col-span-4" type="button" onClick={resetForm}>
              Отмена редактирования
            </button>
          )}

          {formError && <div className="md:col-span-4 text-sm text-rose-600">{formError}</div>}
          {saveErrorMessage && <div className="md:col-span-4 text-sm text-rose-600">{saveErrorMessage}</div>}
        </form>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input max-w-sm" placeholder="Поиск товаров" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-secondary" onClick={onBulkMinus10} disabled={bulk.isPending}>
            {bulk.isPending ? "Применяем..." : "Массово -10%"}
          </button>
          <button className="btn-secondary" type="button" onClick={() => onDeleteDisabledProducts()} disabled={isDangerActionPending}>
            {isDangerActionPending ? "Удаляем..." : "Удалить отключенные"}
          </button>
          <button className="btn-secondary" type="button" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Скрыть отключенные" : "Показать отключенные"}
          </button>
        </div>
        {(toggle.error || archive.error || bulk.error) && (
          <div className="mt-3 text-sm text-rose-600">Не удалось выполнить действие. Проверьте доступы и соединение с API.</div>
        )}
        {dangerActionMessage && <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">{dangerActionMessage}</div>}
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3">Категория</th>
                <th className="px-4 py-3">Цена</th>
                <th className="px-4 py-3">Выдача</th>
                <th className="px-4 py-3">Плашка</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(products.data?.items) ? products.data.items : []).map((item: Product) => {
                const itemBadge = getBadgeFromTags(item.tags || []);
                const itemDeliveryType = resolveDeliveryType(item);
                const itemVpnBundle = parseVpnBundleConfig(item.tags || []);
                return (
                  <tr className="border-t border-slate-200 dark:border-slate-800" key={item.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.slug}</div>
                    </td>
                    <td className="px-4 py-3">{item.category}</td>
                    <td className="px-4 py-3">{money(Number(item.price), item.currency)}</td>
                    <td className="px-4 py-3">
                      <div>{deliveryMethodLabel(itemDeliveryType)}</div>
                      {itemDeliveryType === "vpn" && (
                        <div className="text-xs text-indigo-700 dark:text-indigo-300">
                          План: {vpnBundlePlanLabel(itemVpnBundle.plan)}, лимит устройств: {itemVpnBundle.usersLimit}
                        </div>
                      )}
                      {itemDeliveryType !== "vpn" && itemVpnBundle.enabled && (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400">
                          + VPN bundle: {vpnBundlePlanLabel(itemVpnBundle.plan)}, лимит устройств: {itemVpnBundle.usersLimit}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{badgeLabel(itemBadge)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                        {item.isActive ? "Активен" : "Отключен"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button className="btn-secondary" onClick={() => onEdit(item)} disabled={isSaving || toggle.isPending || archive.isPending}>
                          Редактировать
                        </button>
                        <button className="btn-secondary" onClick={() => onToggle(item)} disabled={toggle.isPending || archive.isPending}>
                          {toggle.isPending ? "Сохраняем..." : item.isActive ? "Отключить" : "Включить"}
                        </button>
                        <button className="btn-secondary" onClick={() => archive.mutate(item.id)} disabled={toggle.isPending || archive.isPending}>
                          {archive.isPending ? "Архивируем..." : "В архив"}
                        </button>
                        {!item.isActive && (
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => onDeleteSingleDisabledProduct(item)}
                            disabled={isDangerActionPending}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
