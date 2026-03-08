import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api } from "../lib/api";
import { money } from "../lib/format";

type BadgeType = "none" | "best" | "new" | "hit" | "sale" | "popular" | "limited" | "gift" | "pro";
type MediaType = "none" | "image" | "video";
type ProductDeliveryType = "activation" | "credentials";

type ProductImage = {
  id: string;
  url: string;
  isMain?: boolean;
};

type Product = {
  id: string;
  slug: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  price: number | string;
  currency: string;
  category: string;
  tags: string[];
  images?: ProductImage[];
  isActive: boolean;
  deliveryType?: ProductDeliveryType;
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

const MEDIA_LINE_RE = /^media\s*:\s*(image|video)\s*:\s*(.+)$/i;
const MEDIA_CAPTION_RE = /^media-caption\s*:\s*(.+)$/i;

function parseDescriptionWithMedia(value: string): {
  cleanDescription: string;
  mediaType: MediaType;
  mediaUrl: string;
  mediaCaption: string;
} {
  const lines = String(value || "").replace(/\r/g, "").split("\n");
  const cleanLines: string[] = [];
  let mediaType: MediaType = "none";
  let mediaUrl = "";
  let mediaCaption = "";

  lines.forEach((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      cleanLines.push("");
      return;
    }

    const mediaMatch = trimmed.match(MEDIA_LINE_RE);
    if (mediaMatch) {
      if (!mediaUrl) {
        mediaType = String(mediaMatch[1] || "").toLowerCase() === "video" ? "video" : "image";
        mediaUrl = String(mediaMatch[2] || "").trim();
      }
      return;
    }

    const captionMatch = trimmed.match(MEDIA_CAPTION_RE);
    if (captionMatch) {
      if (!mediaCaption) mediaCaption = String(captionMatch[1] || "").trim();
      return;
    }

    cleanLines.push(line);
  });

  const cleanDescription = cleanLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanDescription, mediaType, mediaUrl, mediaCaption };
}

function composeDescriptionWithMedia(baseDescription: string, mediaType: MediaType, mediaUrl: string, mediaCaption: string): string {
  const cleanBase = parseDescriptionWithMedia(baseDescription).cleanDescription;
  const normalizedUrl = String(mediaUrl || "").trim();
  const normalizedCaption = String(mediaCaption || "").trim();
  const hasMedia = mediaType !== "none" && normalizedUrl.length > 0;

  if (!hasMedia) return cleanBase;

  const chunks = [cleanBase].filter(Boolean);
  chunks.push(`media:${mediaType}:${normalizedUrl}`);
  if (normalizedCaption) {
    chunks.push(`media-caption:${normalizedCaption}`);
  }
  return chunks.join("\n\n").trim();
}

function absolutizeMediaUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${window.location.origin}${raw}`;
  return raw;
}

function inferMediaTypeFromUrl(url: string): MediaType {
  const source = String(url || "").trim().toLowerCase();
  if (!source) return "none";
  if (/(\.mp4|\.webm|youtube\.com|youtu\.be|vimeo\.com)/i.test(source)) return "video";
  return "image";
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

function withBadgeTag(tags: string[] = [], badge: BadgeType): string[] {
  const list = Array.isArray(tags) ? tags : [];
  const cleaned = list.filter((tag) => !String(tag || "").toLowerCase().startsWith("badge:"));
  if (badge === "none") return cleaned;
  return [...cleaned, `badge:${badge}`];
}

function resolveDeliveryType(item: Product): ProductDeliveryType {
  const fromItem = String(item.deliveryType || "").trim().toLowerCase();
  if (fromItem === "credentials") return "credentials";
  const hasCredentialsTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:credentials");
  return hasCredentialsTag ? "credentials" : "activation";
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
    const status = error.response?.status;
    if (status === 403) return "Недостаточно прав для изменения товаров. Нужна роль ADMIN, OWNER или MANAGER.";
    if (status === 422) return "Проверьте обязательные поля формы.";
    if (status === 401) return "Сессия истекла. Войдите в админку заново.";
  }

  return fallback;
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [badge, setBadge] = useState<BadgeType>("none");
  const [deliveryType, setDeliveryType] = useState<ProductDeliveryType>("activation");
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<MediaType>("none");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [editingImages, setEditingImages] = useState<ProductImage[]>([]);
  const [credentialsImportText, setCredentialsImportText] = useState("");
  const [credentialsMessage, setCredentialsMessage] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      page: 1,
      limit: 50,
      q,
      ...(showInactive ? {} : { isActive: true }),
    }),
    [q, showInactive]
  );

  const products = useQuery({
    queryKey: ["products", params],
    queryFn: async () => (await api.get("/products", { params })).data,
  });

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const updateProduct = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => api.put(`/products/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const autoTranslate = useMutation({
    mutationFn: async (payload: { title: string; description: string }) =>
      (await api.post("/products/translate/ru-en", payload)).data as { titleEn: string; descriptionEn: string; provider: string },
  });

  const uploadProductImage = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      return (await api.post(`/products/${id}/images`, formData, { headers: { "Content-Type": "multipart/form-data" } })).data as ProductImage;
    },
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

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setTitleEn("");
    setPrice("");
    setDescription("");
    setDescriptionEn("");
    setBadge("none");
    setDeliveryType("activation");
    setEditingTags([]);
    setMediaType("none");
    setMediaUrl("");
    setMediaCaption("");
    setEditingImages([]);
    setCredentialsImportText("");
    setCredentialsMessage(null);
    setUploadFile(null);
    setUploadMessage(null);
    setFormError(null);
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
    const preferredMedia = parsedRu.mediaUrl
      ? parsedRu
      : parsedEn.mediaUrl
        ? parsedEn
        : { mediaType: "none" as MediaType, mediaUrl: "", mediaCaption: "" };

    setEditingId(item.id);
    setTitle(item.title || "");
    setTitleEn(item.titleEn || "");
    setPrice(String(item.price ?? ""));
    setDescription(parsedRu.cleanDescription || "");
    setDescriptionEn(parsedEn.cleanDescription || "");
    setBadge(getBadgeFromTags(item.tags || []));
    setDeliveryType(resolveDeliveryType(item));
    setEditingTags(Array.isArray(item.tags) ? item.tags : []);
    setMediaType(preferredMedia.mediaType || "none");
    setMediaUrl(preferredMedia.mediaUrl || "");
    setMediaCaption(preferredMedia.mediaCaption || "");
    setEditingImages(Array.isArray(item.images) ? item.images : []);
    setCredentialsImportText("");
    setCredentialsMessage(null);
    setUploadFile(null);
    setUploadMessage(null);
    setFormError(null);
  }

  async function onSubmitProductForm(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = title.trim();
    let cleanTitleEn = titleEn.trim();
    const cleanDescription = parseDescriptionWithMedia(description).cleanDescription.trim();
    let cleanDescriptionEn = parseDescriptionWithMedia(descriptionEn).cleanDescription.trim();
    const normalizedPrice = Number(String(price).replace(",", "."));
    const normalizedMediaType = mediaType === "image" || mediaType === "video" ? mediaType : "none";
    const normalizedMediaUrl = String(mediaUrl || "").trim();
    const normalizedMediaCaption = String(mediaCaption || "").trim();

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
        cleanDescriptionEn = parseDescriptionWithMedia(String(translated?.descriptionEn || "")).cleanDescription.trim();
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

    const finalDescriptionRu = composeDescriptionWithMedia(cleanDescription, normalizedMediaType, normalizedMediaUrl, normalizedMediaCaption);
    const finalDescriptionEn = composeDescriptionWithMedia(cleanDescriptionEn, normalizedMediaType, normalizedMediaUrl, normalizedMediaCaption);

    if (editingId) {
      await updateProduct.mutateAsync({
        id: editingId,
        payload: {
          title: cleanTitle,
          titleEn: cleanTitleEn,
          description: finalDescriptionRu,
          descriptionEn: finalDescriptionEn,
          price: normalizedPrice,
          tags: withBadgeTag(editingTags, badge),
          deliveryType,
        },
      });
      resetForm();
      return;
    }

    await createProduct.mutateAsync({
      title: cleanTitle,
      titleEn: cleanTitleEn,
      description: finalDescriptionRu,
      descriptionEn: finalDescriptionEn,
      price: normalizedPrice,
      oldPrice: null,
      currency: "RUB",
      category: "Subscriptions",
      tags: buildTags(cleanTitle, badge),
      stock: null,
      isActive: true,
      deliveryType,
    });

    resetForm();
  }

  async function onAutoTranslateClick() {
    setFormError(null);
    const cleanTitle = title.trim();
    const cleanDescription = parseDescriptionWithMedia(description).cleanDescription.trim();

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
      setDescriptionEn(parseDescriptionWithMedia(String(translated?.descriptionEn || "")).cleanDescription.trim());
    } catch {
      setFormError("Не удалось выполнить автоперевод RU -> EN. Повторите позже.");
    }
  }

  async function onUploadImageClick() {
    setUploadMessage(null);
    if (!editingId) {
      setUploadMessage("Сначала выберите товар через «Редактировать». ");
      return;
    }
    if (!uploadFile) {
      setUploadMessage("Выберите файл изображения.");
      return;
    }

    try {
      const uploaded = await uploadProductImage.mutateAsync({ id: editingId, file: uploadFile });
      setEditingImages((prev) => [uploaded, ...prev.filter((item) => item.id !== uploaded.id)]);
      if (!String(mediaUrl || "").trim()) {
        setMediaType("image");
        setMediaUrl(uploaded.url);
      }
      setUploadFile(null);
      setUploadMessage("Фото загружено. Можно сразу использовать в всплывающем окне.");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (error) {
      setUploadMessage(getRequestErrorMessage(error, "Не удалось загрузить изображение."));
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
          <input className="input" placeholder="Название товара (RU)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="Product title (EN)" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
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
            <option value="activation">Активация по токену</option>
            <option value="credentials">Выдача логин/пароль</option>
          </select>
          <button className="btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "Сохраняем..." : editingId ? "Сохранить изменения" : "Добавить товар"}
          </button>

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

          <select className="input md:col-span-1" value={mediaType} onChange={(e) => setMediaType(e.target.value as MediaType)}>
            <option value="none">Без медиа</option>
            <option value="image">Фото</option>
            <option value="video">Видео</option>
          </select>
          <input
            className="input md:col-span-2"
            placeholder="Ссылка на медиа (https://... или /uploads/...)"
            value={mediaUrl}
            onChange={(e) => {
              const nextUrl = e.target.value;
              setMediaUrl(nextUrl);
              if (mediaType === "none" && String(nextUrl || "").trim()) {
                setMediaType(inferMediaTypeFromUrl(nextUrl));
              }
            }}
          />
          <input
            className="input md:col-span-1"
            placeholder="Подпись к медиа (опционально)"
            value={mediaCaption}
            onChange={(e) => setMediaCaption(e.target.value)}
          />

          {mediaType !== "none" && String(mediaUrl || "").trim() && (
            <div className="md:col-span-4 rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 font-semibold text-slate-700 dark:text-slate-200">Предпросмотр медиа для всплывающего окна</div>
              {mediaType === "image" ? (
                <img
                  src={absolutizeMediaUrl(mediaUrl)}
                  alt="Media preview"
                  className="max-h-60 w-auto rounded-lg border border-slate-200 object-contain dark:border-slate-700"
                />
              ) : (
                <a className="text-cyan-700 underline dark:text-cyan-300" href={absolutizeMediaUrl(mediaUrl)} target="_blank" rel="noreferrer">
                  Открыть видео-ссылку
                </a>
              )}
              {mediaCaption && <div className="mt-2 text-slate-500">{mediaCaption}</div>}
            </div>
          )}

          {editingId && (
            <div className="md:col-span-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 text-sm font-semibold">Загрузка фото для всплывающего окна</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setUploadFile(file);
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onUploadImageClick}
                  disabled={!uploadFile || uploadProductImage.isPending}
                >
                  {uploadProductImage.isPending ? "Загружаем..." : "Загрузить фото"}
                </button>
              </div>
              {uploadMessage && <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{uploadMessage}</div>}
              {editingImages.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {editingImages.map((image) => (
                    <div key={image.id} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950">
                      <img src={absolutizeMediaUrl(image.url)} alt="Product" className="h-24 w-full rounded object-cover" />
                      <button
                        type="button"
                        className="btn-secondary mt-2 w-full"
                        onClick={() => {
                          setMediaType("image");
                          setMediaUrl(image.url);
                        }}
                      >
                        Использовать в окне
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
          <button className="btn-secondary" type="button" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Скрыть отключенные" : "Показать отключенные"}
          </button>
        </div>
        {(toggle.error || archive.error || bulk.error) && (
          <div className="mt-3 text-sm text-rose-600">Не удалось выполнить действие. Проверьте доступы и соединение с API.</div>
        )}
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
                return (
                  <tr className="border-t border-slate-200 dark:border-slate-800" key={item.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.slug}</div>
                    </td>
                    <td className="px-4 py-3">{item.category}</td>
                    <td className="px-4 py-3">{money(Number(item.price), item.currency)}</td>
                    <td className="px-4 py-3">{itemDeliveryType === "credentials" ? "Логин/пароль" : "Активация"}</td>
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
