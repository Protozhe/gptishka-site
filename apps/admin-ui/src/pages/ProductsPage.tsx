import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api } from "../lib/api";
import { money } from "../lib/format";

type BadgeType = "none" | "best" | "new" | "hit" | "sale" | "popular" | "limited" | "gift" | "pro";

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
  isActive: boolean;
};

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
    if (status === 422) return "Проверьте обязательные поля формы (включая English title/description).";
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
  const [editingTags, setEditingTags] = useState<string[]>([]);
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

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setTitleEn("");
    setPrice("");
    setDescription("");
    setDescriptionEn("");
    setBadge("none");
    setEditingTags([]);
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
    setEditingId(item.id);
    setTitle(item.title || "");
    setTitleEn(item.titleEn || "");
    setPrice(String(item.price ?? ""));
    setDescription(item.description || "");
    setDescriptionEn(item.descriptionEn || "");
    setBadge(getBadgeFromTags(item.tags || []));
    setEditingTags(Array.isArray(item.tags) ? item.tags : []);
    setFormError(null);
  }

  async function onSubmitProductForm(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = title.trim();
    const cleanTitleEn = titleEn.trim();
    const cleanDescription = description.trim();
    const cleanDescriptionEn = descriptionEn.trim();
    const normalizedPrice = Number(String(price).replace(",", "."));

    if (cleanTitle.length < 3) {
      setFormError("Название должно быть не короче 3 символов.");
      return;
    }

    if (cleanDescription.length < 10) {
      setFormError("Описание должно быть не короче 10 символов.");
      return;
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

    if (editingId) {
      await updateProduct.mutateAsync({
        id: editingId,
        payload: {
          title: cleanTitle,
          titleEn: cleanTitleEn,
          description: cleanDescription,
          descriptionEn: cleanDescriptionEn,
          price: normalizedPrice,
          tags: withBadgeTag(editingTags, badge),
        },
      });
      resetForm();
      return;
    }

    await createProduct.mutateAsync({
      title: cleanTitle,
      titleEn: cleanTitleEn,
      description: cleanDescription,
      descriptionEn: cleanDescriptionEn,
      price: normalizedPrice,
      oldPrice: null,
      currency: "RUB",
      category: "Subscriptions",
      tags: buildTags(cleanTitle, badge),
      stock: null,
      isActive: true,
    });

    resetForm();
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
          <input className="input" placeholder="Product title (EN) *" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
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
            placeholder="Product description (EN) *"
            value={descriptionEn}
            onChange={(e) => setDescriptionEn(e.target.value)}
          />

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
                <th className="px-4 py-3">Плашка</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(products.data?.items) ? products.data.items : []).map((item: Product) => {
                const itemBadge = getBadgeFromTags(item.tags || []);
                return (
                  <tr className="border-t border-slate-200 dark:border-slate-800" key={item.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.slug}</div>
                    </td>
                    <td className="px-4 py-3">{item.category}</td>
                    <td className="px-4 py-3">{money(Number(item.price), item.currency)}</td>
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
