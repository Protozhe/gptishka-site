import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api } from "../lib/api";
import { money } from "../lib/format";

type BadgeType = "none" | "best" | "new" | "hit" | "sale" | "popular" | "limited" | "gift" | "pro";
type ProductDeliveryType = "activation" | "credentials" | "vpn";

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
  deliveryMethod?: 1 | 2 | 3 | "1" | "2" | "3";
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

const LEGACY_MEDIA_LINE_RE = /^media\s*:\s*(image|video)\s*:\s*(.+)$/i;
const LEGACY_MEDIA_CAPTION_RE = /^media-caption\s*:\s*(.+)$/i;

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
  const fromMethod = String(item.deliveryMethod || "").trim();
  if (fromMethod === "2") return "credentials";
  if (fromMethod === "3") return "vpn";
  if (fromMethod === "1") return "activation";

  const fromItem = String(item.deliveryType || "").trim().toLowerCase();
  if (fromItem === "credentials") return "credentials";
  if (fromItem === "vpn") return "vpn";
  const hasVpnTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:vpn");
  if (hasVpnTag) return "vpn";
  const hasCredentialsTag = (item.tags || [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "delivery:credentials");
  return hasCredentialsTag ? "credentials" : "activation";
}

function deliveryMethodNumber(deliveryType: ProductDeliveryType): 1 | 2 | 3 {
  if (deliveryType === "vpn") return 3;
  return deliveryType === "credentials" ? 2 : 1;
}

function deliveryMethodLabel(deliveryType: ProductDeliveryType): string {
  if (deliveryType === "credentials") return "Метод 2: Логин и пароль";
  if (deliveryType === "vpn") return "Метод 3: VPN (VLESS)";
  return "Метод 1: Активация по ключу";
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
  const [modalDescription, setModalDescription] = useState("");
  const [modalDescriptionEn, setModalDescriptionEn] = useState("");
  const [badge, setBadge] = useState<BadgeType>("none");
  const [deliveryType, setDeliveryType] = useState<ProductDeliveryType>("activation");
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [credentialsImportText, setCredentialsImportText] = useState("");
  const [credentialsMessage, setCredentialsMessage] = useState<string | null>(null);
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
    setModalDescription("");
    setModalDescriptionEn("");
    setBadge("none");
    setDeliveryType("activation");
    setEditingTags([]);
    setCredentialsImportText("");
    setCredentialsMessage(null);
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
    const parsedModalRu = parseDescriptionWithMedia(item.modalDescription || "");
    const parsedModalEn = parseDescriptionWithMedia(item.modalDescriptionEn || "");

    setEditingId(item.id);
    setTitle(item.title || "");
    setTitleEn(item.titleEn || "");
    setPrice(String(item.price ?? ""));
    setDescription(parsedRu.cleanDescription || "");
    setDescriptionEn(parsedEn.cleanDescription || "");
    setModalDescription(parsedModalRu.cleanDescription || "");
    setModalDescriptionEn(parsedModalEn.cleanDescription || "");
    setBadge(getBadgeFromTags(item.tags || []));
    setDeliveryType(resolveDeliveryType(item));
    setEditingTags(Array.isArray(item.tags) ? item.tags : []);
    setCredentialsImportText("");
    setCredentialsMessage(null);
    setFormError(null);
  }

  async function onSubmitProductForm(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = title.trim();
    let cleanTitleEn = titleEn.trim();
    const cleanDescription = parseDescriptionWithMedia(description).cleanDescription.trim();
    let cleanDescriptionEn = parseDescriptionWithMedia(descriptionEn).cleanDescription.trim();
    const cleanModalDescription = composeDescriptionWithMedia(modalDescription).trim();
    let cleanModalDescriptionEn = composeDescriptionWithMedia(modalDescriptionEn).trim();
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

    const finalDescriptionRu = composeDescriptionWithMedia(cleanDescription);
    const finalDescriptionEn = composeDescriptionWithMedia(cleanDescriptionEn);

    if (cleanModalDescription && !cleanModalDescriptionEn) {
      try {
        const translatedModal = await autoTranslate.mutateAsync({
          title: cleanTitle,
          description: cleanModalDescription,
        });
        cleanModalDescriptionEn = parseDescriptionWithMedia(String(translatedModal?.descriptionEn || "")).cleanDescription.trim();
      } catch {
        cleanModalDescriptionEn = cleanModalDescription;
      }
      setModalDescriptionEn(cleanModalDescriptionEn);
    }

    if (editingId) {
      await updateProduct.mutateAsync({
        id: editingId,
        payload: {
          title: cleanTitle,
          titleEn: cleanTitleEn,
          description: finalDescriptionRu,
          descriptionEn: finalDescriptionEn,
          modalDescription: cleanModalDescription,
          modalDescriptionEn: cleanModalDescriptionEn,
          price: normalizedPrice,
          tags: withBadgeTag(editingTags, badge),
          deliveryType,
          deliveryMethod: deliveryMethodNumber(deliveryType),
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
      modalDescription: cleanModalDescription,
      modalDescriptionEn: cleanModalDescriptionEn,
      price: normalizedPrice,
      oldPrice: null,
      currency: "RUB",
      category: "Subscriptions",
      tags: buildTags(cleanTitle, badge),
      stock: null,
      isActive: true,
      deliveryType,
      deliveryMethod: deliveryMethodNumber(deliveryType),
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
      const cleanModalDescription = composeDescriptionWithMedia(modalDescription).trim();
      if (cleanModalDescription) {
        try {
          const translatedModal = await autoTranslate.mutateAsync({
            title: cleanTitle,
            description: cleanModalDescription,
          });
          setModalDescriptionEn(parseDescriptionWithMedia(String(translatedModal?.descriptionEn || "")).cleanDescription.trim());
        } catch {
          setModalDescriptionEn(cleanModalDescription);
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
            <option value="activation">Метод 1: Активация по ключу</option>
            <option value="credentials">Метод 2: Выдача логин/пароль</option>
            <option value="vpn">Метод 3: Выдача VPN</option>
          </select>
          <button className="btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "Сохраняем..." : editingId ? "Сохранить изменения" : "Добавить товар"}
          </button>

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
                    <td className="px-4 py-3">{deliveryMethodLabel(itemDeliveryType)}</td>
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
