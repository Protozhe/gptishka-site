import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import axios from "axios";
import { api } from "../lib/api";
import { money } from "../lib/format";

type ProductDeliveryType = "activation" | "credentials" | "manual_login" | "vpn" | "support" | "support_claude";
type ProductVisualBackgroundType = "solid" | "gradient" | "image";
type ActivationVariantKey = "withLogin" | "withoutLogin";
type ActivationVariantConfig = {
  enabled: boolean;
  price: number | string;
  deliveryType: ProductDeliveryType;
  activationSiteUrl?: string;
};

type ProductVisualConfig = {
  cardTitle?: string;
  cardDescription?: string;
  imageUrl?: string;
  imageAlt?: string;
  hoverImageUrl?: string;
  hoverImageAlt?: string;
  backgroundType?: ProductVisualBackgroundType;
  backgroundColor?: string;
  backgroundGradient?: string;
  buttonText?: string;
  buttonStyle?: string;
  isVisible?: boolean;
};

type ProductShowcasePlacement = {
  id: string;
  sectionId: string;
  sortOrder: number;
  isActive: boolean;
  isPinned: boolean;
  section?: {
    title?: string;
    slug?: string;
  };
};

type ServicePageProductPlacement = {
  id: string;
  servicePageId: string;
  productId: string;
  sortOrder: number;
  isActive: boolean;
  isPinned: boolean;
  servicePage?: {
    id: string;
    title?: string;
    path?: string;
    serviceKey?: string;
  };
};

type ServicePage = {
  id: string;
  slug: string;
  path: string;
  serviceKey: string;
  title: string;
  titleEn?: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroDescription?: string;
  heroVideoUrl?: string;
  heroImageUrl?: string;
  heroLogoUrl?: string;
  theme?: string;
  accentColor?: string;
  accentGradient?: string;
  darkOverlay?: string;
  colorOverlay?: string;
  constructorTitle?: string;
  constructorDescription?: string;
  infoSections?: unknown[];
  faqItems?: unknown[];
  paymentCaptionLava?: string;
  paymentCaptionEnot?: string;
  isActive: boolean;
  isIndexed: boolean;
  sortOrder: number;
  placements?: ServicePageProductPlacement[];
};

type Product = {
  id: string;
  slug: string;
  title: string;
  titleEn: string;
  iconPngUrl?: string;
  description: string;
  descriptionEn: string;
  modalDescription?: string;
  modalDescriptionEn?: string;
  price: number | string;
  activationVariants?: Record<ActivationVariantKey, ActivationVariantConfig> | null;
  currency: string;
  category: string;
  tags: string[];
  isActive: boolean;
  deliveryType?: ProductDeliveryType;
  deliveryMethod?: 1 | 2 | 3 | 4 | 5 | "1" | "2" | "3" | "4" | "5";
  visualConfig?: ProductVisualConfig | null;
  showcasePlacements?: ProductShowcasePlacement[];
  servicePagePlacements?: ServicePageProductPlacement[];
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
const DEFAULT_SERVICE_PAGE_DRAFT: Partial<ServicePage> = {
  title: "",
  slug: "",
  path: "",
  serviceKey: "",
  theme: "custom",
  accentColor: "#35f28f",
  accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
  darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))",
  colorOverlay: "linear-gradient(135deg,rgba(0,255,120,.28),rgba(0,130,80,.18),rgba(0,0,0,.20))",
  heroEyebrow: "Тарифные планы",
  heroTitle: "",
  heroDescription: "",
  heroVideoUrl: "",
  heroImageUrl: "",
  heroLogoUrl: "",
  constructorTitle: "",
  constructorDescription: "",
  paymentCaptionLava: "СБП 0% и карты 3.2%",
  paymentCaptionEnot: "Карты 3.2% и СБП 0%",
  isActive: true,
  isIndexed: true,
  sortOrder: 100,
};

const SERVICE_PAGE_THEME_PRESETS: Record<
  string,
  Pick<ServicePage, "theme" | "accentColor" | "accentGradient" | "darkOverlay" | "colorOverlay">
> = {
  emerald: {
    theme: "emerald",
    accentColor: "#35f28f",
    accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))",
    colorOverlay: "linear-gradient(135deg,rgba(0,255,120,.34),rgba(0,130,80,.22),rgba(0,0,0,.22))",
  },
  orange: {
    theme: "orange",
    accentColor: "#ff8a3d",
    accentGradient: "linear-gradient(135deg,#ffb36a,#ff7a2f,#d94a17)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.56))",
    colorOverlay: "linear-gradient(135deg,rgba(255,138,61,.34),rgba(255,91,34,.24),rgba(0,0,0,.22))",
  },
  black: {
    theme: "black",
    accentColor: "#f5f7fb",
    accentGradient: "linear-gradient(135deg,#f5f7fb,#8b95a7,#111827)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.24),rgba(0,0,0,.68))",
    colorOverlay: "linear-gradient(135deg,rgba(255,255,255,.16),rgba(80,90,110,.18),rgba(0,0,0,.34))",
  },
  "dark-blue": {
    theme: "dark-blue",
    accentColor: "#4aa8ff",
    accentGradient: "linear-gradient(135deg,#66c7ff,#2479ff,#102a7a)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62))",
    colorOverlay: "linear-gradient(135deg,rgba(74,168,255,.30),rgba(28,70,180,.24),rgba(0,0,0,.28))",
  },
  custom: {
    theme: "custom",
    accentColor: "#35f28f",
    accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))",
    colorOverlay: "linear-gradient(135deg,rgba(0,255,120,.28),rgba(0,130,80,.18),rgba(0,0,0,.20))",
  },
};

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

function resolveDeliveryType(item: Product): ProductDeliveryType {
  const fromMethod = String(item.deliveryMethod || "").trim();
  if (fromMethod === "5") return "support_claude";
  if (fromMethod === "4") return "support";
  if (fromMethod === "2") return "credentials";
  if (fromMethod === "3") return "vpn";
  if (fromMethod === "1") return "activation";

  const fromItem = String(item.deliveryType || "").trim().toLowerCase();
  if (fromItem === "manual_login" || fromItem === "manual-login" || fromItem === "with_login" || fromItem === "with-login") return "manual_login";
  if (fromItem === "support_claude") return "support_claude";
  if (fromItem === "support") return "support";
  if (fromItem === "credentials") return "credentials";
  if (fromItem === "vpn") return "vpn";
  const hasVpnTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:vpn");
  if (hasVpnTag) return "vpn";
  const hasSupportClaudeTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:support_claude");
  if (hasSupportClaudeTag) return "support_claude";
  const hasSupportTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:support");
  if (hasSupportTag) return "support";
  const hasCredentialsTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:credentials");
  const hasManualLoginTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:manual_login" || tag === "delivery:manual-login");
  if (hasManualLoginTag) return "manual_login";
  return hasCredentialsTag ? "credentials" : "activation";
}

function deliveryMethodNumber(deliveryType: ProductDeliveryType): 1 | 2 | 3 | 4 | 5 {
  if (deliveryType === "support_claude") return 5;
  if (deliveryType === "support") return 4;
  if (deliveryType === "vpn") return 3;
  return deliveryType === "credentials" || deliveryType === "manual_login" ? 2 : 1;
}

function deliveryMethodLabel(deliveryType: ProductDeliveryType): string {
  if (deliveryType === "support_claude") return "Метод 5: Claude Pro активация по токену";
  if (deliveryType === "support") return "Метод 4: Grok-активация по JWT-токену";
  if (deliveryType === "manual_login") return "Метод 2A: Ручная заявка со входом";
  if (deliveryType === "credentials") return "Метод 2: Логин и пароль";
  if (deliveryType === "vpn") return "Метод 3: VPN (VLESS)";
  return "Метод 1: Активация по ключу";
}

const VPN_BUNDLE_FLAG_TAG = "bundle:vpn";
const VPN_PLAN_TAG_PREFIX = "vpn:plan:";
const VPN_DAYS_TAG_PREFIX = "vpn:days:";
const VPN_USERS_TAG_PREFIX = "vpn:users:";
const DEFAULT_VPN_USERS_LIMIT = 7;
const DEFAULT_VPN_DURATION_DAYS = 30;
const MIN_VPN_DURATION_DAYS = 1;
const MAX_VPN_DURATION_DAYS = 3650;

function normalizeVpnDurationDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_VPN_DURATION_DAYS;
  return Math.max(MIN_VPN_DURATION_DAYS, Math.min(MAX_VPN_DURATION_DAYS, Math.floor(parsed)));
}

function buildVpnPlanTag(days: number) {
  return `days_${normalizeVpnDurationDays(days)}`;
}

function formatVpnDurationLabel(days: number) {
  const value = normalizeVpnDurationDays(days);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} дня`;
  return `${value} дней`;
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

function parseVpnBundleConfig(tags: string[] = []): { enabled: boolean; durationDays: number; usersLimit: number } {
  const list = Array.isArray(tags) ? tags : [];
  const normalized = list.map((tag) => String(tag || "").trim().toLowerCase());
  const enabled = normalized.includes(VPN_BUNDLE_FLAG_TAG);
  const usersLimit = parseVpnUsersLimit(list);
  const daysTag = normalized.find((tag) => tag.startsWith(VPN_DAYS_TAG_PREFIX));
  const days = normalizeVpnDurationDays(daysTag?.slice(VPN_DAYS_TAG_PREFIX.length) || "");
  return { enabled, durationDays: days, usersLimit };
}

function withVpnBundleTags(tags: string[] = [], enabled: boolean, durationDays: number, usersLimit: number): string[] {
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
  const normalizedDurationDays = normalizeVpnDurationDays(durationDays);
  return [
    ...cleaned,
    VPN_BUNDLE_FLAG_TAG,
    `${VPN_PLAN_TAG_PREFIX}${buildVpnPlanTag(normalizedDurationDays)}`,
    `${VPN_DAYS_TAG_PREFIX}${normalizedDurationDays}`,
    `${VPN_USERS_TAG_PREFIX}${normalizedUsersLimit}`,
  ];
}

function withDirectVpnTags(tags: string[] = [], durationDays: number, usersLimit: number): string[] {
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
  const normalizedDurationDays = normalizeVpnDurationDays(durationDays);
  return [
    ...cleaned,
    `${VPN_PLAN_TAG_PREFIX}${buildVpnPlanTag(normalizedDurationDays)}`,
    `${VPN_DAYS_TAG_PREFIX}${normalizedDurationDays}`,
    `${VPN_USERS_TAG_PREFIX}${normalizedUsersLimit}`,
  ];
}

function buildTags(title: string): string[] {
  const tags = title
    .toLowerCase()
    .split(/[^a-z0-9а-яё]+/i)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);

  return tags.length ? tags : ["subscription"];
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

function buildDefaultVisualConfig(productTitle = "", productDescription = ""): ProductVisualConfig {
  return {
    cardTitle: productTitle,
    cardDescription: productDescription,
    imageUrl: "",
    imageAlt: productTitle,
    hoverImageUrl: "",
    hoverImageAlt: productTitle,
    backgroundType: "solid",
    backgroundColor: "#111111",
    backgroundGradient: "",
    buttonText: "Выбрать тариф",
    buttonStyle: "primary",
    isVisible: true,
  };
}

function mergeVisualConfig(product: Pick<Product, "title" | "description" | "visualConfig">): ProductVisualConfig {
  return {
    ...buildDefaultVisualConfig(product.title || "", product.description || ""),
    ...(product.visualConfig || {}),
  };
}

function ProductVisualPreview({
  visual,
  fallbackTitle,
  fallbackDescription,
  price,
  currency,
}: {
  visual: ProductVisualConfig;
  fallbackTitle: string;
  fallbackDescription: string;
  price: string;
  currency: string;
}) {
  const title = visual.cardTitle || fallbackTitle || "Название товара";
  const description = visual.cardDescription || fallbackDescription || "Короткое описание товара";
  const background =
    visual.backgroundType === "gradient" && visual.backgroundGradient
      ? visual.backgroundGradient
      : visual.backgroundColor || "#111111";
  const imageBackground =
    visual.backgroundType === "image" && visual.imageUrl
      ? `linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.54)), url(${visual.imageUrl}) center/cover`
      : background;

  return (
    <article className="overflow-hidden rounded-[28px] bg-[#111] p-3 text-white shadow-xl">
      <div className="group relative aspect-square overflow-hidden rounded-[24px]" style={{ background: imageBackground }}>
        {visual.imageUrl && (
          <img
            src={visual.imageUrl}
            alt={visual.imageAlt || title}
            className={`h-full w-full object-cover transition-opacity duration-200 ${visual.hoverImageUrl ? "group-hover:opacity-0" : ""}`}
            loading="lazy"
          />
        )}
        {visual.hoverImageUrl && (
          <img
            src={visual.hoverImageUrl}
            alt={visual.hoverImageAlt || title}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${visual.imageUrl ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
            loading="lazy"
          />
        )}
      </div>
      <div className="grid gap-2 p-2">
        <h3 className="text-lg font-extrabold leading-tight">{title}</h3>
        <p className="line-clamp-2 text-sm text-slate-300">{description}</p>
        <div className="text-base font-bold">{Number(price) > 0 ? `от ${money(Number(price), currency)}` : "цена на витрине"}</div>
        <button type="button" className="h-12 rounded-xl bg-emerald-600 text-sm font-bold text-white">
          {visual.buttonText || "Выбрать тариф"}
        </button>
      </div>
    </article>
  );
}

function normalizeCategoryValue(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function categoryKey(value: string): string {
  return normalizeCategoryValue(value).toLocaleLowerCase("ru");
}

function buildDefaultServicePageDraft(overrides: Partial<ServicePage> = {}): Partial<ServicePage> {
  return {
    ...DEFAULT_SERVICE_PAGE_DRAFT,
    ...overrides,
    infoSections: Array.isArray(overrides.infoSections) ? overrides.infoSections : [],
    faqItems: Array.isArray(overrides.faqItems) ? overrides.faqItems : [],
  };
}

function servicePageToDraft(page?: ServicePage | null): Partial<ServicePage> {
  if (!page) return buildDefaultServicePageDraft();
  return buildDefaultServicePageDraft({
    id: page.id,
    slug: page.slug || "",
    path: page.path || "",
    serviceKey: page.serviceKey || "",
    title: page.title || "",
    titleEn: page.titleEn || "",
    heroEyebrow: page.heroEyebrow || "Тарифные планы",
    heroTitle: page.heroTitle || page.title || "",
    heroDescription: page.heroDescription || "",
    heroVideoUrl: page.heroVideoUrl || "",
    heroImageUrl: page.heroImageUrl || "",
    heroLogoUrl: page.heroLogoUrl || "",
    theme: page.theme || "custom",
    accentColor: page.accentColor || "",
    accentGradient: page.accentGradient || "",
    darkOverlay: page.darkOverlay || "",
    colorOverlay: page.colorOverlay || "",
    constructorTitle: page.constructorTitle || page.title || "",
    constructorDescription: page.constructorDescription || "",
    infoSections: Array.isArray(page.infoSections) ? page.infoSections : [],
    faqItems: Array.isArray(page.faqItems) ? page.faqItems : [],
    paymentCaptionLava: page.paymentCaptionLava || "СБП 0% и карты 3.2%",
    paymentCaptionEnot: page.paymentCaptionEnot || "Карты 3.2% и СБП 0%",
    isActive: page.isActive !== false,
    isIndexed: page.isIndexed !== false,
    sortOrder: Number(page.sortOrder || 100),
  });
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [activationVariantTab, setActivationVariantTab] = useState<ActivationVariantKey>("withLogin");
  const [withLoginEnabled, setWithLoginEnabled] = useState(true);
  const [withLoginPrice, setWithLoginPrice] = useState("");
  const [withLoginDeliveryType, setWithLoginDeliveryType] = useState<ProductDeliveryType>("manual_login");
  const [withoutLoginEnabled, setWithoutLoginEnabled] = useState(true);
  const [withoutLoginPrice, setWithoutLoginPrice] = useState("");
  const [withoutLoginDeliveryType, setWithoutLoginDeliveryType] = useState<ProductDeliveryType>("activation");
  const [withoutLoginActivationSiteUrl, setWithoutLoginActivationSiteUrl] = useState("");
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
  const [vpnBundleEnabled, setVpnBundleEnabled] = useState(false);
  const [vpnDurationDays, setVpnDurationDays] = useState<number>(DEFAULT_VPN_DURATION_DAYS);
  const [vpnUsersLimit, setVpnUsersLimit] = useState<number>(DEFAULT_VPN_USERS_LIMIT);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [visualConfig, setVisualConfig] = useState<ProductVisualConfig>(buildDefaultVisualConfig());
  const [visualMessage, setVisualMessage] = useState<string | null>(null);
  const [servicePageMode, setServicePageMode] = useState<"existing" | "new">("existing");
  const [selectedServicePageId, setSelectedServicePageId] = useState("");
  const [servicePageDraft, setServicePageDraft] = useState<Partial<ServicePage>>(buildDefaultServicePageDraft());
  const [servicePagePlacementEnabled, setServicePagePlacementEnabled] = useState(true);
  const [servicePagePlacementSortOrder, setServicePagePlacementSortOrder] = useState("100");
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

  const servicePages = useQuery({
    queryKey: ["service-pages"],
    queryFn: async () => (await api.get("/service-pages")).data as { items: ServicePage[] },
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

  useEffect(() => {
    if (servicePageMode !== "existing") return;
    if (!selectedServicePageId) {
      setServicePageDraft(buildDefaultServicePageDraft());
      return;
    }
    const page = (servicePages.data?.items || []).find((item) => item.id === selectedServicePageId);
    if (page) {
      setServicePageDraft(servicePageToDraft(page));
    }
  }, [selectedServicePageId, servicePageMode, servicePages.data?.items]);

  const credentials = useQuery({
    queryKey: ["product-credentials", editingId],
    enabled: Boolean(editingId && withLoginEnabled && withLoginDeliveryType === "credentials"),
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

  const saveProductVisual = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProductVisualConfig }) => api.put(`/products/${id}/visual`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const createServicePage = useMutation({
    mutationFn: async (payload: Partial<ServicePage>) => (await api.post("/service-pages", payload)).data as ServicePage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-pages"] });
    },
  });

  const updateServicePage = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<ServicePage> }) =>
      (await api.put(`/service-pages/${id}`, payload)).data as ServicePage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-pages"] });
    },
  });

  const addServicePagePlacement = useMutation({
    mutationFn: async ({
      servicePageId,
      productId,
      sortOrder,
      isActive,
    }: {
      servicePageId: string;
      productId: string;
      sortOrder: number;
      isActive: boolean;
    }) =>
      (
        await api.post(`/service-pages/${servicePageId}/products`, {
          productId,
          sortOrder,
          isActive,
          isPinned: false,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-pages"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const removeServicePagePlacement = useMutation({
    mutationFn: async (placementId: string) => api.delete(`/service-pages/placements/${placementId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-pages"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const uploadProductVisualImageMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      return api.post(`/products/${id}/visual/image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: (response) => {
      const nextVisual = response.data?.visual as ProductVisualConfig | undefined;
      if (nextVisual) {
        setVisualConfig((prev) => ({ ...prev, ...nextVisual }));
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const deleteProductVisualImageMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}/visual/image`),
    onSuccess: (response) => {
      const nextVisual = response.data?.visual as ProductVisualConfig | undefined;
      setVisualConfig((prev) => ({ ...prev, ...(nextVisual || {}), imageUrl: "", imageAlt: "" }));
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const uploadProductVisualHoverImageMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      return api.post(`/products/${id}/visual/hover-image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: (response) => {
      const nextVisual = response.data?.visual as ProductVisualConfig | undefined;
      if (nextVisual) {
        setVisualConfig((prev) => ({ ...prev, ...nextVisual }));
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const deleteProductVisualHoverImageMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}/visual/hover-image`),
    onSuccess: (response) => {
      const nextVisual = response.data?.visual as ProductVisualConfig | undefined;
      setVisualConfig((prev) => ({ ...prev, ...(nextVisual || {}), hoverImageUrl: "", hoverImageAlt: "" }));
      queryClient.invalidateQueries({ queryKey: ["products"] });
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
    setActivationVariantTab("withLogin");
    setWithLoginEnabled(true);
    setWithLoginPrice("");
    setWithLoginDeliveryType("manual_login");
    setWithoutLoginEnabled(true);
    setWithoutLoginPrice("");
    setWithoutLoginDeliveryType("activation");
    setWithoutLoginActivationSiteUrl("");
    setCategory(DEFAULT_PRODUCT_CATEGORY);
    setNewCategoryDraft("");
    setCategoryNotice(null);
    setDescription("");
    setDescriptionEn("");
    setDurationLabelRu("");
    setDurationLabelEn("");
    setModalDescription("");
    setModalDescriptionEn("");
    setVpnBundleEnabled(false);
    setVpnDurationDays(DEFAULT_VPN_DURATION_DAYS);
    setVpnUsersLimit(DEFAULT_VPN_USERS_LIMIT);
    setEditingTags([]);
    setVisualConfig(buildDefaultVisualConfig());
    setVisualMessage(null);
    setServicePageMode("existing");
    setSelectedServicePageId("");
    setServicePageDraft(buildDefaultServicePageDraft());
    setServicePagePlacementEnabled(true);
    setServicePagePlacementSortOrder("100");
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
    const legacyDeliveryType = resolveDeliveryType(item);
    const savedVariants = item.activationVariants;
    setActivationVariantTab("withLogin");
    setWithLoginEnabled(savedVariants ? savedVariants.withLogin?.enabled !== false : legacyDeliveryType === "manual_login");
    setWithLoginPrice(String(savedVariants?.withLogin?.price ?? item.price ?? ""));
    setWithLoginDeliveryType(savedVariants?.withLogin?.deliveryType || "manual_login");
    setWithoutLoginEnabled(savedVariants ? savedVariants.withoutLogin?.enabled !== false : legacyDeliveryType !== "manual_login");
    setWithoutLoginPrice(String(savedVariants?.withoutLogin?.price ?? item.price ?? ""));
    setWithoutLoginDeliveryType(savedVariants?.withoutLogin?.deliveryType || "activation");
    setWithoutLoginActivationSiteUrl(String(savedVariants?.withoutLogin?.activationSiteUrl || ""));
    setCategory(normalizeCategoryValue(item.category || "") || DEFAULT_PRODUCT_CATEGORY);
    setNewCategoryDraft("");
    setCategoryNotice(null);
    setDescription(withDurationLine(parsedRu.cleanDescription || "", "", "ru"));
    setDescriptionEn(withDurationLine(parsedEn.cleanDescription || "", "", "en"));
    setDurationLabelRu(parsedDurationRu);
    setDurationLabelEn(parsedDurationEn || parsedDurationRu);
    setModalDescription(normalizeModalDescriptionText(modalRuSource));
    setModalDescriptionEn(normalizeModalDescriptionText(modalEnSource));
    const bundleConfig = parseVpnBundleConfig(item.tags || []);
    setVpnBundleEnabled(bundleConfig.enabled);
    setVpnDurationDays(bundleConfig.durationDays);
    setVpnUsersLimit(bundleConfig.usersLimit);
    setEditingTags(Array.isArray(item.tags) ? item.tags : []);
    setVisualConfig(mergeVisualConfig(item));
    setVisualMessage(null);
    const directServicePlacement = Array.isArray(item.servicePagePlacements) ? item.servicePagePlacements[0] : null;
    const pageWithPlacement = (servicePages.data?.items || []).find((page) =>
      (page.placements || []).some((placement) => placement.productId === item.id)
    );
    const servicePlacement =
      directServicePlacement ||
      pageWithPlacement?.placements?.find((placement) => placement.productId === item.id) ||
      null;
    if (servicePlacement || pageWithPlacement) {
      const linkedPage =
        (servicePages.data?.items || []).find((page) => page.id === (servicePlacement?.servicePageId || pageWithPlacement?.id)) ||
        pageWithPlacement ||
        null;
      setServicePageMode("existing");
      setSelectedServicePageId(linkedPage?.id || servicePlacement?.servicePageId || "");
      setServicePageDraft(servicePageToDraft(linkedPage));
      setServicePagePlacementEnabled(servicePlacement?.isActive !== false);
      setServicePagePlacementSortOrder(String(servicePlacement?.sortOrder ?? 100));
    } else {
      setServicePageMode("existing");
      setSelectedServicePageId("");
      setServicePageDraft(buildDefaultServicePageDraft({ title: item.category || item.title || "", heroTitle: item.category || item.title || "" }));
      setServicePagePlacementEnabled(true);
      setServicePagePlacementSortOrder("100");
    }
    setCredentialsImportText("");
    setCredentialsMessage(null);
    setFormError(null);
  }

  function updateVisualConfig(patch: ProductVisualConfig) {
    setVisualConfig((prev) => ({
      ...prev,
      ...patch,
    }));
  }

  function updateServicePageDraft(patch: Partial<ServicePage>) {
    setServicePageDraft((prev) => ({
      ...prev,
      ...patch,
    }));
  }

  function onServicePageThemeChange(theme: string) {
    const preset = SERVICE_PAGE_THEME_PRESETS[theme] || SERVICE_PAGE_THEME_PRESETS.custom;
    updateServicePageDraft(preset);
  }

  function onStartNewServicePage() {
    setServicePageMode("new");
    setSelectedServicePageId("");
    setServicePageDraft(
      buildDefaultServicePageDraft({
        title: category || title || "",
        heroTitle: category || title || "",
        constructorTitle: category || title || "",
        heroDescription:
          title.trim()
            ? `Оформите ${title.trim()} без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя.`
            : "",
      })
    );
  }

  async function onUploadVisualImage(file: File | null) {
    setVisualMessage(null);
    if (!file) return;
    if (!editingId) {
      setVisualMessage("Сначала сохраните товар, затем загрузите изображение витрины.");
      return;
    }
    try {
      await uploadProductVisualImageMutation.mutateAsync({ id: editingId, file });
      setVisualMessage("Изображение загружено.");
    } catch (error) {
      setVisualMessage(getRequestErrorMessage(error, "Не удалось загрузить изображение."));
    }
  }

  async function onDeleteVisualImage() {
    setVisualMessage(null);
    if (!editingId) {
      updateVisualConfig({ imageUrl: "", imageAlt: "" });
      return;
    }
    try {
      await deleteProductVisualImageMutation.mutateAsync(editingId);
      setVisualMessage("Изображение удалено.");
    } catch (error) {
      setVisualMessage(getRequestErrorMessage(error, "Не удалось удалить изображение."));
    }
  }

  async function onUploadVisualHoverImage(file: File | null) {
    setVisualMessage(null);
    if (!file) return;
    if (!editingId) {
      setVisualMessage("Сначала сохраните товар, затем загрузите hover-изображение.");
      return;
    }
    try {
      await uploadProductVisualHoverImageMutation.mutateAsync({ id: editingId, file });
      setVisualMessage("Hover-изображение загружено.");
    } catch (error) {
      setVisualMessage(getRequestErrorMessage(error, "Не удалось загрузить hover-изображение."));
    }
  }

  async function onDeleteVisualHoverImage() {
    setVisualMessage(null);
    if (!editingId) {
      updateVisualConfig({ hoverImageUrl: "", hoverImageAlt: "" });
      return;
    }
    try {
      await deleteProductVisualHoverImageMutation.mutateAsync(editingId);
      setVisualMessage("Hover-изображение удалено.");
    } catch (error) {
      setVisualMessage(getRequestErrorMessage(error, "Не удалось удалить hover-изображение."));
    }
  }

  function findServicePagePlacementsForProduct(productId: string) {
    return (servicePages.data?.items || [])
      .flatMap((page) => (page.placements || []).map((placement) => ({ ...placement, servicePageId: placement.servicePageId || page.id })))
      .filter((placement) => placement.productId === productId);
  }

  async function saveServicePagePlacementForProduct(productId: string, productTitle: string) {
    const cleanProductTitle = String(productTitle || title || "").trim();
    let servicePageId = selectedServicePageId;
    const draftTitle = String(servicePageDraft.title || cleanProductTitle || category || "").trim();

    if (servicePageMode === "new") {
      const createdPage = await createServicePage.mutateAsync({
        ...servicePageDraft,
        title: draftTitle,
        heroTitle: String(servicePageDraft.heroTitle || draftTitle).trim(),
        constructorTitle: String(servicePageDraft.constructorTitle || draftTitle).trim(),
      });
      servicePageId = createdPage.id;
      setSelectedServicePageId(createdPage.id);
      setServicePageDraft(servicePageToDraft(createdPage));
    } else if (selectedServicePageId && servicePageDraft.id === selectedServicePageId) {
      await updateServicePage.mutateAsync({
        id: selectedServicePageId,
        payload: {
          ...servicePageDraft,
          title: draftTitle,
          heroTitle: String(servicePageDraft.heroTitle || draftTitle).trim(),
          constructorTitle: String(servicePageDraft.constructorTitle || draftTitle).trim(),
        },
      });
    }

    const existingPlacements = findServicePagePlacementsForProduct(productId);
    const placementSortOrder = Number(servicePagePlacementSortOrder || 100);
    const normalizedSortOrder = Number.isFinite(placementSortOrder) ? Math.max(0, Math.floor(placementSortOrder)) : 100;

    for (const placement of existingPlacements) {
      if (!servicePageId || placement.servicePageId !== servicePageId) {
        await removeServicePagePlacement.mutateAsync(placement.id);
      }
    }

    if (!servicePageId) return;

    await addServicePagePlacement.mutateAsync({
      servicePageId,
      productId,
      sortOrder: normalizedSortOrder,
      isActive: servicePagePlacementEnabled,
    });
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
    const normalizedWithLoginPrice = Number(String(withLoginPrice).replace(",", "."));
    const normalizedWithoutLoginPrice = Number(String(withoutLoginPrice).replace(",", "."));
    const enabledVariantPrices = [
      ...(withLoginEnabled ? [normalizedWithLoginPrice] : []),
      ...(withoutLoginEnabled ? [normalizedWithoutLoginPrice] : []),
    ];
    const normalizedPrice = enabledVariantPrices.length ? Math.min(...enabledVariantPrices) : 0;

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

    if (!withLoginEnabled && !withoutLoginEnabled) {
      setFormError("Включите хотя бы один вариант активации.");
      return;
    }

    if (withLoginEnabled && (!Number.isFinite(normalizedWithLoginPrice) || normalizedWithLoginPrice <= 0)) {
      setFormError("Укажите корректную цену для варианта «Со входом».");
      return;
    }

    if (withoutLoginEnabled && (!Number.isFinite(normalizedWithoutLoginPrice) || normalizedWithoutLoginPrice <= 0)) {
      setFormError("Укажите корректную цену для варианта «Без входа».");
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
    const normalizedVpnDurationDays = normalizeVpnDurationDays(vpnDurationDays);
    const preparedVisual: ProductVisualConfig = {
      cardTitle: String(visualConfig.cardTitle || "").trim(),
      cardDescription: String(visualConfig.cardDescription || "").trim(),
      imageUrl: String(visualConfig.imageUrl || "").trim(),
      imageAlt: String(visualConfig.imageAlt || "").trim(),
      hoverImageUrl: String(visualConfig.hoverImageUrl || "").trim(),
      hoverImageAlt: String(visualConfig.hoverImageAlt || "").trim(),
      backgroundType: visualConfig.backgroundType || "solid",
      backgroundColor: String(visualConfig.backgroundColor || "").trim(),
      backgroundGradient: String(visualConfig.backgroundGradient || "").trim(),
      buttonText: String(visualConfig.buttonText || "").trim(),
      buttonStyle: String(visualConfig.buttonStyle || "").trim(),
      isVisible: visualConfig.isVisible !== false,
    };
    const activationVariants = {
      withLogin: {
        enabled: withLoginEnabled,
        price: normalizedWithLoginPrice > 0 ? normalizedWithLoginPrice : normalizedPrice,
        deliveryType: withLoginDeliveryType,
        activationSiteUrl: "",
      },
      withoutLogin: {
        enabled: withoutLoginEnabled,
        price: normalizedWithoutLoginPrice > 0 ? normalizedWithoutLoginPrice : normalizedPrice,
        deliveryType: withoutLoginDeliveryType,
        activationSiteUrl: String(withoutLoginActivationSiteUrl || "").trim(),
      },
    };
    const primaryDeliveryType = withoutLoginEnabled ? withoutLoginDeliveryType : withLoginDeliveryType;

    if (editingId) {
      const preparedTags =
        primaryDeliveryType === "vpn"
          ? withDirectVpnTags(editingTags, normalizedVpnDurationDays, normalizedVpnUsersLimit)
          : withVpnBundleTags(editingTags, vpnBundleEnabled, normalizedVpnDurationDays, normalizedVpnUsersLimit);
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
          activationVariants,
          tags: preparedTags,
          deliveryType: primaryDeliveryType,
          deliveryMethod: deliveryMethodNumber(primaryDeliveryType),
        },
      });
      await saveProductVisual.mutateAsync({ id: editingId, payload: preparedVisual });
      await saveServicePagePlacementForProduct(editingId, cleanTitle);
      resetForm();
      return;
    }

    const createdBaseTags = buildTags(cleanTitle);
    const preparedTags =
      primaryDeliveryType === "vpn"
        ? withDirectVpnTags(createdBaseTags, normalizedVpnDurationDays, normalizedVpnUsersLimit)
        : withVpnBundleTags(createdBaseTags, vpnBundleEnabled, normalizedVpnDurationDays, normalizedVpnUsersLimit);
    const created = await createProduct.mutateAsync({
      title: cleanTitle,
      titleEn: cleanTitleEn,
      description: finalDescriptionRu,
      descriptionEn: finalDescriptionEn,
      modalDescription: cleanModalDescription,
      modalDescriptionEn: cleanModalDescriptionEn,
      price: normalizedPrice,
      activationVariants,
      oldPrice: null,
      currency: "RUB",
      category: cleanCategory,
      tags: preparedTags,
      stock: null,
      isActive: true,
      deliveryType: primaryDeliveryType,
      deliveryMethod: deliveryMethodNumber(primaryDeliveryType),
    });
    const createdId = String(created.data?.id || "").trim();
    if (createdId) {
      await saveProductVisual.mutateAsync({ id: createdId, payload: preparedVisual });
      await saveServicePagePlacementForProduct(createdId, cleanTitle);
    }

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
    if (!withLoginEnabled || withLoginDeliveryType !== "credentials") {
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

  const isSaving =
    createProduct.isPending ||
    updateProduct.isPending ||
    saveProductVisual.isPending ||
    createServicePage.isPending ||
    updateServicePage.isPending ||
    addServicePagePlacement.isPending ||
    removeServicePagePlacement.isPending;
  const saveError =
    createProduct.error ||
    updateProduct.error ||
    saveProductVisual.error ||
    createServicePage.error ||
    updateServicePage.error ||
    addServicePagePlacement.error ||
    removeServicePagePlacement.error;
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

          <div className="md:col-span-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-bold">Страница сервиса</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Привяжите товар к готовой странице или создайте новую страницу с нужным цветом, hero и видео-фоном.
                </div>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    servicePageMode === "existing" ? "bg-cyan-600 text-white" : "text-slate-600 dark:text-slate-300"
                  }`}
                  onClick={() => setServicePageMode("existing")}
                >
                  Выбрать
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    servicePageMode === "new" ? "bg-cyan-600 text-white" : "text-slate-600 dark:text-slate-300"
                  }`}
                  onClick={onStartNewServicePage}
                >
                  Создать
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-3 md:grid-cols-2">
                {servicePageMode === "existing" && (
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Готовая страница</span>
                    <select className="input" value={selectedServicePageId} onChange={(e) => setSelectedServicePageId(e.target.value)}>
                      <option value="">Не привязывать к странице</option>
                      {(servicePages.data?.items || []).map((page) => (
                        <option key={page.id} value={page.id}>
                          {page.title} — {page.path}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-slate-500">
                      Если выбрать существующую страницу, поля ниже редактируют её настройки. ChatGPT уже настроен — не меняйте его без необходимости.
                    </span>
                  </label>
                )}

                <input
                  className="input"
                  placeholder="Название страницы, например Midjourney"
                  value={servicePageDraft.title || ""}
                  onChange={(e) => updateServicePageDraft({ title: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="URL страницы, например /midjourney"
                  value={servicePageDraft.path || ""}
                  onChange={(e) => updateServicePageDraft({ path: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="serviceKey, например midjourney"
                  value={servicePageDraft.serviceKey || ""}
                  onChange={(e) => updateServicePageDraft({ serviceKey: e.target.value })}
                />
                <select className="input" value={servicePageDraft.theme || "custom"} onChange={(e) => onServicePageThemeChange(e.target.value)}>
                  <option value="emerald">ChatGPT / зелёный</option>
                  <option value="orange">Claude / оранжевый</option>
                  <option value="black">Grok / чёрный</option>
                  <option value="dark-blue">VPN / тёмно-синий</option>
                  <option value="custom">Свой цвет</option>
                </select>
                <input
                  className="input"
                  placeholder="#35f28f"
                  value={servicePageDraft.accentColor || ""}
                  onChange={(e) => updateServicePageDraft({ accentColor: e.target.value, theme: "custom" })}
                />
                <input
                  className="input"
                  placeholder="linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)"
                  value={servicePageDraft.accentGradient || ""}
                  onChange={(e) => updateServicePageDraft({ accentGradient: e.target.value, theme: "custom" })}
                />
                <input
                  className="input"
                  placeholder="Hero label, например Тарифные планы"
                  value={servicePageDraft.heroEyebrow || ""}
                  onChange={(e) => updateServicePageDraft({ heroEyebrow: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Hero title, например ChatGPT"
                  value={servicePageDraft.heroTitle || ""}
                  onChange={(e) => updateServicePageDraft({ heroTitle: e.target.value })}
                />
                <textarea
                  className="input min-h-20 md:col-span-2"
                  placeholder="Описание hero-блока"
                  value={servicePageDraft.heroDescription || ""}
                  onChange={(e) => updateServicePageDraft({ heroDescription: e.target.value })}
                />
                <input
                  className="input md:col-span-2"
                  placeholder="URL видео hero, например /assets/video/chatgpt-plans-bg.mp4"
                  value={servicePageDraft.heroVideoUrl || ""}
                  onChange={(e) => updateServicePageDraft({ heroVideoUrl: e.target.value })}
                />
                <input
                  className="input md:col-span-2"
                  placeholder="URL логотипа/картинки hero"
                  value={servicePageDraft.heroImageUrl || ""}
                  onChange={(e) => updateServicePageDraft({ heroImageUrl: e.target.value, heroLogoUrl: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="LAVA: СБП 0% и карты 3.2%"
                  value={servicePageDraft.paymentCaptionLava || ""}
                  onChange={(e) => updateServicePageDraft({ paymentCaptionLava: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="ENOT: Карты 3.2% и СБП 0%"
                  value={servicePageDraft.paymentCaptionEnot || ""}
                  onChange={(e) => updateServicePageDraft({ paymentCaptionEnot: e.target.value })}
                />
                <textarea
                  className="input min-h-20 md:col-span-2"
                  placeholder="Описание конструктора тарифов под карточкой"
                  value={servicePageDraft.constructorDescription || ""}
                  onChange={(e) => updateServicePageDraft({ constructorDescription: e.target.value })}
                />

                <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:col-span-2 dark:border-slate-800 dark:bg-slate-900">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={servicePagePlacementEnabled} onChange={(e) => setServicePagePlacementEnabled(e.target.checked)} />
                    Показывать этот товар на выбранной странице
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Порядок товара на странице</span>
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="100"
                      value={servicePagePlacementSortOrder}
                      onChange={(e) => setServicePagePlacementSortOrder(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Preview</div>
                <div
                  className="mt-3 overflow-hidden rounded-2xl p-4 text-white shadow-lg"
                  style={{ background: servicePageDraft.accentGradient || servicePageDraft.accentColor || "#111827" }}
                >
                  <div className="text-xs uppercase tracking-[0.18em] opacity-75">{servicePageDraft.heroEyebrow || "Тарифные планы"}</div>
                  <div className="mt-2 text-2xl font-black leading-none">
                    {servicePageDraft.heroTitle || servicePageDraft.title || title || "Название сервиса"}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed opacity-85">
                    {servicePageDraft.heroDescription || "Описание страницы будет здесь. Видео и overlay подтянутся на публичной странице."}
                  </p>
                </div>
                <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <div>
                    URL: <strong>{servicePageDraft.path || "будет создан автоматически"}</strong>
                  </div>
                  <div>
                    Тема: <strong>{servicePageDraft.theme || "custom"}</strong>
                  </div>
                  <div>
                    Товар: <strong>{servicePagePlacementEnabled ? "показывается" : "привязка сохранится выключенной"}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Визуал карточки на витрине</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Только внешний вид. Product.id, цена, tags и выдача сохраняются отдельно.
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={visualConfig.isVisible !== false}
                  onChange={(e) => updateVisualConfig({ isVisible: e.target.checked })}
                />
                Показывать карточку
              </label>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  className="input"
                  placeholder="Заголовок карточки"
                  value={visualConfig.cardTitle || ""}
                  onChange={(e) => updateVisualConfig({ cardTitle: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Текст кнопки"
                  value={visualConfig.buttonText || ""}
                  onChange={(e) => updateVisualConfig({ buttonText: e.target.value })}
                />
                <textarea
                  className="input min-h-20 md:col-span-2"
                  placeholder="Короткое описание карточки"
                  value={visualConfig.cardDescription || ""}
                  onChange={(e) => updateVisualConfig({ cardDescription: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Alt обычного изображения"
                  value={visualConfig.imageAlt || ""}
                  onChange={(e) => updateVisualConfig({ imageAlt: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="URL обычного изображения (без курсора)"
                  value={visualConfig.imageUrl || ""}
                  onChange={(e) => updateVisualConfig({ imageUrl: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Alt hover-изображения"
                  value={visualConfig.hoverImageAlt || ""}
                  onChange={(e) => updateVisualConfig({ hoverImageAlt: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="URL hover-изображения (при наведении)"
                  value={visualConfig.hoverImageUrl || ""}
                  onChange={(e) => updateVisualConfig({ hoverImageUrl: e.target.value })}
                />
                <select
                  className="input"
                  value={visualConfig.backgroundType || "solid"}
                  onChange={(e) => updateVisualConfig({ backgroundType: e.target.value as ProductVisualBackgroundType })}
                >
                  <option value="solid">Фон: цвет</option>
                  <option value="gradient">Фон: градиент</option>
                  <option value="image">Фон: изображение</option>
                </select>
                <input
                  className="input"
                  placeholder="Цвет фона, например #111111"
                  value={visualConfig.backgroundColor || ""}
                  onChange={(e) => updateVisualConfig({ backgroundColor: e.target.value })}
                />
                <input
                  className="input md:col-span-2"
                  placeholder="CSS градиент, например linear-gradient(135deg,#111,#243)"
                  value={visualConfig.backgroundGradient || ""}
                  onChange={(e) => updateVisualConfig({ backgroundGradient: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn-secondary cursor-pointer">
                    Загрузить 1 картинку
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        void onUploadVisualImage(e.target.files?.[0] || null);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button type="button" className="btn-secondary" onClick={onDeleteVisualImage}>
                    Удалить 1 картинку
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn-secondary cursor-pointer">
                    Загрузить 2 картинку hover
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        void onUploadVisualHoverImage(e.target.files?.[0] || null);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button type="button" className="btn-secondary" onClick={onDeleteVisualHoverImage}>
                    Удалить hover
                  </button>
                </div>
                {visualMessage && <div className="text-xs text-slate-600 dark:text-slate-300 md:col-span-2">{visualMessage}</div>}
              </div>

              <ProductVisualPreview
                visual={visualConfig}
                fallbackTitle={title}
                fallbackDescription={description}
                price={
                  activationVariantTab === "withLogin"
                    ? withLoginPrice
                    : withoutLoginPrice
                }
                currency="RUB"
              />
            </div>
          </div>

          <div className="md:col-span-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3">
              <div className="text-sm font-semibold">Варианты покупки и активации</div>
              <div className="text-xs text-slate-500">
                Название, категория, описание и визуал общие. Цена и способ активации задаются отдельно.
              </div>
            </div>

            <div className="mb-3 inline-flex rounded-lg border border-slate-300 p-1 dark:border-slate-700">
              <button
                type="button"
                className={`rounded-md px-4 py-2 text-sm font-semibold ${
                  activationVariantTab === "withLogin" ? "bg-cyan-600 text-white" : "text-slate-600 dark:text-slate-300"
                }`}
                onClick={() => setActivationVariantTab("withLogin")}
              >
                Со входом
              </button>
              <button
                type="button"
                className={`rounded-md px-4 py-2 text-sm font-semibold ${
                  activationVariantTab === "withoutLogin" ? "bg-cyan-600 text-white" : "text-slate-600 dark:text-slate-300"
                }`}
                onClick={() => setActivationVariantTab("withoutLogin")}
              >
                Без входа
              </button>
            </div>

            {activationVariantTab === "withLogin" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 md:col-span-2">
                  <input type="checkbox" checked={withLoginEnabled} onChange={(e) => setWithLoginEnabled(e.target.checked)} />
                  <span className="font-semibold">Вариант «Со входом» доступен клиентам</span>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Цена, RUB</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={withLoginPrice}
                    onChange={(e) => setWithLoginPrice(e.target.value)}
                    placeholder="1290"
                    disabled={!withLoginEnabled}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Метод активации</span>
                  <select
                    className="input"
                    value={withLoginDeliveryType}
                    onChange={(e) => setWithLoginDeliveryType(e.target.value as ProductDeliveryType)}
                    disabled={!withLoginEnabled}
                  >
                    <option value="manual_login">Ручная активация по данным клиента</option>
                    <option value="credentials">Автоматическая выдача готового логина и пароля</option>
                  </select>
                </label>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 md:col-span-2 dark:bg-slate-950 dark:text-slate-300">
                  Клиент заполняет контактные данные и данные своего аккаунта. При ручном методе заказ обрабатывается менеджером.
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 md:col-span-2">
                  <input type="checkbox" checked={withoutLoginEnabled} onChange={(e) => setWithoutLoginEnabled(e.target.checked)} />
                  <span className="font-semibold">Вариант «Без входа» доступен клиентам</span>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Цена, RUB</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={withoutLoginPrice}
                    onChange={(e) => setWithoutLoginPrice(e.target.value)}
                    placeholder="990"
                    disabled={!withoutLoginEnabled}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Метод активации</span>
                  <select
                    className="input"
                    value={withoutLoginDeliveryType}
                    onChange={(e) => setWithoutLoginDeliveryType(e.target.value as ProductDeliveryType)}
                    disabled={!withoutLoginEnabled}
                  >
                    <option value="activation">Метод 1: активация по CDK-ключу</option>
                    <option value="support">Метод 4: активация через поддержку</option>
                    <option value="support_claude">Метод 5: Claude по токену</option>
                    <option value="vpn">Метод 3: VPN</option>
                  </select>
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Сайт активации для CDK-ключей
                  </span>
                  <input
                    className="input"
                    value={withoutLoginActivationSiteUrl}
                    onChange={(e) => setWithoutLoginActivationSiteUrl(e.target.value)}
                    placeholder="https://vip.sxzfd.com/"
                    disabled={!withoutLoginEnabled || withoutLoginDeliveryType !== "activation"}
                  />
                  <span className="text-[11px] text-slate-500">
                    Метод 1 будет брать CDK только из этого товара и только с таким же сайтом активации.
                  </span>
                </label>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 md:col-span-2 dark:bg-slate-950 dark:text-slate-300">
                  Для ChatGPT используйте «Метод 1». После оплаты резервируется ключ из раздела «CDK ключи», а клиент завершает активацию самостоятельно.
                </div>
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

          {editingId && withLoginEnabled && withLoginDeliveryType === "credentials" && (
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

          <button className="btn-primary md:col-span-4" type="submit" disabled={isSaving}>
            {isSaving ? "Сохраняем..." : editingId ? "Сохранить изменения" : "Добавить товар"}
          </button>

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
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(products.data?.items) ? products.data.items : []).map((item: Product) => {
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
                          Срок: {formatVpnDurationLabel(itemVpnBundle.durationDays)}, лимит устройств: {itemVpnBundle.usersLimit}
                        </div>
                      )}
                      {itemDeliveryType !== "vpn" && itemVpnBundle.enabled && (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400">
                          + VPN bundle: {formatVpnDurationLabel(itemVpnBundle.durationDays)}, лимит устройств: {itemVpnBundle.usersLimit}
                        </div>
                      )}
                    </td>
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
