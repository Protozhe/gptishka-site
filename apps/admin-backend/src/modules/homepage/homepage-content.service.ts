import fs from "fs";
import path from "path";
import { saveProductImage } from "../files/files.service";

type Lang = "ru" | "en";

type PromoSlide = {
  id: string;
  isActive: boolean;
  badge: string;
  titleLines: string[];
  description: string;
  buttonText: string;
  buttonHref: string;
  imageUrl: string;
  themeClass: string;
  sortOrder: number;
};

type Shortcut = {
  id: string;
  isActive: boolean;
  title: string;
  href: string;
  ariaLabel: string;
  imageUrl: string;
  hoverImageUrl: string;
  logoUrl: string;
  themeClass: string;
  sortOrder: number;
};

export type HomepageContent = {
  slides: Record<Lang, PromoSlide[]>;
  shortcuts: Record<Lang, Shortcut[]>;
};

const dataDir = path.join(process.cwd(), "apps", "admin-backend", "data");
const dataFile = path.join(dataDir, "homepage-content.json");

const defaultContent: HomepageContent = {
  slides: {
    ru: [
      {
        id: "supergrok",
        isActive: true,
        badge: "SUPERGROK",
        titleLines: ["SUPERGROK", "на 1 месяц"],
        description: "Grok от xAI: быстрые ответы, анализ, креативные задачи и генерация изображений в одной подписке на 1 месяц.",
        buttonText: "Открыть тарифы",
        buttonHref: "/supergrok",
        imageUrl: "",
        themeClass: "home-promo-slide--supergrok",
        sortOrder: 10,
      },
      {
        id: "vpn",
        isActive: true,
        badge: "V*N",
        titleLines: ["Быстрый V*N", "с надёжным VLESS-подключением"],
        description: "Получите VLESS-ключ сразу после оплаты. Подходит для стабильного доступа к сайтам, сервисам и приложениям без сложной настройки.",
        buttonText: "Открыть тарифы",
        buttonHref: "/store/vpn/",
        imageUrl: "/assets/img/home/vpn-promo-bg.webp?v=20260721-vpn-bg-webp1",
        themeClass: "home-promo-slide--vpn",
        sortOrder: 20,
      },
      {
        id: "topups",
        isActive: true,
        badge: "Пополнения",
        titleLines: ["Пополни баланс Steam", "на +10% ключами Манн Ко."],
        description: "Укажите Steam trade-ссылку, выберите количество ключей и оплатите удобным способом. Подходит, если торговая площадка открыта и баланс нужен срочно.",
        buttonText: "Пополнить",
        buttonHref: "/store/steam/topup/",
        imageUrl: "/assets/img/home/topups-promo-bg.webp?v=20260721-promo-webp1",
        themeClass: "home-promo-slide--topups",
        sortOrder: 30,
      },
    ],
    en: [
      {
        id: "supergrok",
        isActive: true,
        badge: "SUPERGROK",
        titleLines: ["SUPERGROK", "for 1 month"],
        description: "Grok by xAI: fast answers, analysis, creative tasks, and image generation in one 1-month subscription.",
        buttonText: "Open plans",
        buttonHref: "/en/supergrok",
        imageUrl: "",
        themeClass: "home-promo-slide--supergrok",
        sortOrder: 10,
      },
      {
        id: "vpn",
        isActive: true,
        badge: "V*N",
        titleLines: ["Fast V*N", "with a reliable VLESS connection"],
        description: "Get a VLESS key right after payment. Suitable for stable access to websites, services, and apps without complicated setup.",
        buttonText: "Open plans",
        buttonHref: "/en/store/vpn/",
        imageUrl: "/assets/img/home/vpn-promo-bg.webp?v=20260721-vpn-bg-webp1",
        themeClass: "home-promo-slide--vpn",
        sortOrder: 20,
      },
      {
        id: "topups",
        isActive: true,
        badge: "Top-ups",
        titleLines: ["Top up your Steam balance", "with +10% using Mann Co. keys"],
        description: "Enter your Steam trade URL, choose the number of keys, and pay with a convenient method. Useful when the market is unlocked and you need balance quickly.",
        buttonText: "Top up",
        buttonHref: "/en/store/steam/topup/",
        imageUrl: "/assets/img/home/topups-promo-bg.webp?v=20260721-promo-webp1",
        themeClass: "home-promo-slide--topups",
        sortOrder: 30,
      },
    ],
  },
  shortcuts: {
    ru: [
      {
        id: "topups",
        isActive: true,
        title: "Пополнения",
        href: "/store/steam/",
        ariaLabel: "Открыть пополнения Steam",
        imageUrl: "/assets/img/home/topups-shortcut.webp?v=20260721-shortcuts-webp1",
        hoverImageUrl: "",
        logoUrl: "",
        themeClass: "home-service-shortcut--topups",
        sortOrder: 10,
      },
      {
        id: "ai",
        isActive: true,
        title: "Нейросети",
        href: "/catalog/ai/",
        ariaLabel: "Открыть нейросети",
        imageUrl: "/assets/img/home/ai-shortcut.webp?v=20260721-shortcuts-webp1",
        hoverImageUrl: "",
        logoUrl: "",
        themeClass: "home-service-shortcut--ai",
        sortOrder: 20,
      },
      {
        id: "vpn",
        isActive: true,
        title: "V*N",
        href: "/catalog/vpn/",
        ariaLabel: "Открыть GPTishka V*N",
        imageUrl: "/assets/img/services/vpn-card.webp?v=20260721-cards-webp1",
        hoverImageUrl: "",
        logoUrl: "/assets/img/services/vstar-card.webp?v=20260721-cards-webp1",
        themeClass: "home-service-shortcut--vpn",
        sortOrder: 30,
      },
    ],
    en: [
      {
        id: "topups",
        isActive: true,
        title: "Top-ups",
        href: "/en/store/steam/",
        ariaLabel: "Open Steam top-ups",
        imageUrl: "/assets/img/home/topups-shortcut.webp?v=20260721-shortcuts-webp1",
        hoverImageUrl: "",
        logoUrl: "",
        themeClass: "home-service-shortcut--topups",
        sortOrder: 10,
      },
      {
        id: "ai",
        isActive: true,
        title: "AI Services",
        href: "/en/catalog/ai/",
        ariaLabel: "Open AI services",
        imageUrl: "/assets/img/home/ai-shortcut.webp?v=20260721-shortcuts-webp1",
        hoverImageUrl: "",
        logoUrl: "",
        themeClass: "home-service-shortcut--ai",
        sortOrder: 20,
      },
      {
        id: "vpn",
        isActive: true,
        title: "V*N",
        href: "/en/catalog/vpn/",
        ariaLabel: "Open GPTishka V*N",
        imageUrl: "/assets/img/services/vpn-card.webp?v=20260721-cards-webp1",
        hoverImageUrl: "",
        logoUrl: "/assets/img/services/vstar-card.webp?v=20260721-cards-webp1",
        themeClass: "home-service-shortcut--vpn",
        sortOrder: 30,
      },
    ],
  },
};

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultContent, null, 2), "utf-8");
  }
}

function normalizeLang(value: unknown): Lang {
  return String(value || "").toLowerCase().startsWith("en") ? "en" : "ru";
}

function sanitizeSlide(item: any, index: number): PromoSlide {
  const fallback = defaultContent.slides.ru[index] || defaultContent.slides.ru[0];
  const titleLines = Array.isArray(item?.titleLines)
    ? item.titleLines.map((line: unknown) => String(line || "").trim()).filter(Boolean).slice(0, 3)
    : String(item?.title || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
  return {
    id: String(item?.id || fallback.id || `slide-${index + 1}`).trim(),
    isActive: item?.isActive !== false,
    badge: String(item?.badge || "").trim(),
    titleLines: titleLines.length ? titleLines : fallback.titleLines,
    description: String(item?.description || "").trim(),
    buttonText: String(item?.buttonText || "").trim(),
    buttonHref: String(item?.buttonHref || "").trim(),
    imageUrl: String(item?.imageUrl || "").trim(),
    themeClass: String(item?.themeClass || fallback.themeClass || "").trim(),
    sortOrder: Number(item?.sortOrder ?? (index + 1) * 10) || (index + 1) * 10,
  };
}

function sanitizeShortcut(item: any, index: number): Shortcut {
  const fallback = defaultContent.shortcuts.ru[index] || defaultContent.shortcuts.ru[0];
  return {
    id: String(item?.id || fallback.id || `shortcut-${index + 1}`).trim(),
    isActive: item?.isActive !== false,
    title: String(item?.title || "").trim(),
    href: String(item?.href || "").trim(),
    ariaLabel: String(item?.ariaLabel || "").trim(),
    imageUrl: String(item?.imageUrl || "").trim(),
    hoverImageUrl: String(item?.hoverImageUrl || "").trim(),
    logoUrl: String(item?.logoUrl || "").trim(),
    themeClass: String(item?.themeClass || fallback.themeClass || "").trim(),
    sortOrder: Number(item?.sortOrder ?? (index + 1) * 10) || (index + 1) * 10,
  };
}

function normalizeContent(input: any): HomepageContent {
  const base = input && typeof input === "object" ? input : defaultContent;
  return {
    slides: {
      ru: (Array.isArray(base?.slides?.ru) ? base.slides.ru : defaultContent.slides.ru).map(sanitizeSlide),
      en: (Array.isArray(base?.slides?.en) ? base.slides.en : defaultContent.slides.en).map(sanitizeSlide),
    },
    shortcuts: {
      ru: (Array.isArray(base?.shortcuts?.ru) ? base.shortcuts.ru : defaultContent.shortcuts.ru).map(sanitizeShortcut),
      en: (Array.isArray(base?.shortcuts?.en) ? base.shortcuts.en : defaultContent.shortcuts.en).map(sanitizeShortcut),
    },
  };
}

function isHiddenPublicVpnHomepageItem(item: { id?: string; themeClass?: string; href?: string; buttonHref?: string; title?: string; badge?: string }) {
  const text = [
    item?.id,
    item?.themeClass,
    item?.href,
    item?.buttonHref,
    item?.title,
    item?.badge,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return /\b(vpn|vless)\b|v\*n|\/catalog\/vpn|\/store\/vpn/.test(text);
}

export const homepageContentService = {
  getAll() {
    ensureDataFile();
    try {
      return normalizeContent(JSON.parse(fs.readFileSync(dataFile, "utf-8")));
    } catch {
      return defaultContent;
    }
  },

  getPublic(langInput: unknown) {
    const lang = normalizeLang(langInput);
    const content = this.getAll();
    const sort = <T extends { sortOrder: number; isActive: boolean }>(items: T[]) =>
      items
        .filter((item) => item.isActive)
        .filter((item) => !isHiddenPublicVpnHomepageItem(item as any))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      slides: sort(content.slides[lang]),
      shortcuts: sort(content.shortcuts[lang]),
    };
  },

  getLegacyBannerItems() {
    const content = this.getAll();
    return [...content.slides.ru]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((slide) => ({
        id: slide.id,
        badge: slide.badge,
        title: slide.titleLines.join(" "),
        description: slide.description,
        buttonText: slide.buttonText,
        buttonUrl: slide.buttonHref,
        backgroundImageUrl: slide.imageUrl,
        backgroundColor: "#05070d",
        backgroundGradient: "linear-gradient(135deg, rgba(53, 242, 143, 0.20), rgba(52, 108, 255, 0.12), rgba(5, 7, 13, 0.96))",
        textColor: "",
        isActive: slide.isActive,
        sortOrder: slide.sortOrder,
      }));
  },

  save(input: any) {
    ensureDataFile();
    const content = normalizeContent(input);
    fs.writeFileSync(dataFile, JSON.stringify(content, null, 2), "utf-8");
    return content;
  },

  uploadImage(file: Express.Multer.File) {
    if (!file) throw new Error("Image is required");
    return { imageUrl: saveProductImage(file) };
  },
};
