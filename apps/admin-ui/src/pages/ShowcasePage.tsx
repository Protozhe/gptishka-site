import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { money } from "../lib/format";

type ProductVisualConfig = {
  cardTitle?: string;
  cardDescription?: string;
  imageUrl?: string;
  imageAlt?: string;
  backgroundType?: "solid" | "gradient" | "image";
  backgroundColor?: string;
  backgroundGradient?: string;
  buttonText?: string;
  buttonStyle?: string;
  isVisible?: boolean;
};

type Product = {
  id: string;
  title: string;
  slug: string;
  price: number | string;
  currency: string;
  category: string;
  isActive: boolean;
  visualConfig?: ProductVisualConfig | null;
};

type ShowcasePlacement = {
  id: string;
  productId: string;
  sortOrder: number;
  isActive: boolean;
  isPinned: boolean;
  product: Product;
};

type ShowcaseSection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  showOnHomepage: boolean;
  showInCatalog: boolean;
  placements: ShowcasePlacement[];
};

const defaultSectionForm = {
  title: "",
  slug: "",
  description: "",
  sortOrder: 100,
  isActive: true,
  showOnHomepage: true,
  showInCatalog: true,
};

function productCardTitle(product: Product) {
  return product.visualConfig?.cardTitle || product.title;
}

export default function ShowcasePage() {
  const queryClient = useQueryClient();
  const [sectionForm, setSectionForm] = useState(defaultSectionForm);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [placementDrafts, setPlacementDrafts] = useState<Record<string, { productId: string; sortOrder: number; isPinned: boolean }>>({});
  const [message, setMessage] = useState<string | null>(null);

  const sections = useQuery({
    queryKey: ["showcase-sections"],
    queryFn: async () => (await api.get("/showcase/sections")).data as { items: ShowcaseSection[] },
  });

  const products = useQuery({
    queryKey: ["showcase-products"],
    queryFn: async () =>
      (
        await api.get("/products", {
          params: { page: 1, limit: 100, sortBy: "title", sortDir: "asc", isArchived: false },
        })
      ).data as { items: Product[] },
  });

  const productOptions = useMemo(() => {
    const items = Array.isArray(products.data?.items) ? products.data.items : [];
    return items.filter((item) => item.isActive);
  }, [products.data?.items]);

  const saveSection = useMutation({
    mutationFn: async () => {
      const payload = {
        ...sectionForm,
        sortOrder: Number(sectionForm.sortOrder) || 100,
      };
      if (editingSectionId) {
        return api.put(`/showcase/sections/${editingSectionId}`, payload);
      }
      return api.post("/showcase/sections", payload);
    },
    onSuccess: () => {
      setSectionForm(defaultSectionForm);
      setEditingSectionId(null);
      queryClient.invalidateQueries({ queryKey: ["showcase-sections"] });
    },
  });

  const deleteSection = useMutation({
    mutationFn: (id: string) => api.delete(`/showcase/sections/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["showcase-sections"] }),
  });

  const addPlacement = useMutation({
    mutationFn: ({ sectionId, payload }: { sectionId: string; payload: { productId: string; sortOrder: number; isPinned: boolean } }) =>
      api.post(`/showcase/sections/${sectionId}/products`, { ...payload, isActive: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["showcase-sections"] }),
  });

  const updatePlacement = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ShowcasePlacement> }) => api.put(`/showcase/placements/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["showcase-sections"] }),
  });

  const removePlacement = useMutation({
    mutationFn: (id: string) => api.delete(`/showcase/placements/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["showcase-sections"] }),
  });

  function onSubmitSection(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (sectionForm.title.trim().length < 2) {
      setMessage("Название раздела должно быть не короче 2 символов.");
      return;
    }
    saveSection.mutate();
  }

  function onEditSection(section: ShowcaseSection) {
    setEditingSectionId(section.id);
    setSectionForm({
      title: section.title,
      slug: section.slug,
      description: section.description || "",
      sortOrder: section.sortOrder || 100,
      isActive: section.isActive,
      showOnHomepage: section.showOnHomepage,
      showInCatalog: section.showInCatalog,
    });
  }

  function updatePlacementDraft(sectionId: string, patch: Partial<{ productId: string; sortOrder: number; isPinned: boolean }>) {
    setPlacementDrafts((prev) => ({
      ...prev,
      [sectionId]: {
        productId: prev[sectionId]?.productId || productOptions[0]?.id || "",
        sortOrder: prev[sectionId]?.sortOrder ?? 100,
        isPinned: prev[sectionId]?.isPinned ?? false,
        ...patch,
      },
    }));
  }

  function onAddPlacement(sectionId: string) {
    const draft = placementDrafts[sectionId] || { productId: productOptions[0]?.id || "", sortOrder: 100, isPinned: false };
    if (!draft.productId) {
      setMessage("Выберите товар для добавления в раздел.");
      return;
    }
    addPlacement.mutate({ sectionId, payload: draft });
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="mb-3">
          <h2 className="text-lg font-bold">Конструктор витрины</h2>
          <p className="text-sm text-slate-500">Разделы и порядок карточек не меняют Product.id, slug, tags и выдачу.</p>
        </div>

        <form className="grid gap-2 md:grid-cols-6" onSubmit={onSubmitSection}>
          <input className="input md:col-span-2" placeholder="Название раздела" value={sectionForm.title} onChange={(e) => setSectionForm((prev) => ({ ...prev, title: e.target.value }))} />
          <input className="input" placeholder="slug, можно пустым" value={sectionForm.slug} onChange={(e) => setSectionForm((prev) => ({ ...prev, slug: e.target.value }))} />
          <input className="input" type="number" placeholder="Порядок" value={sectionForm.sortOrder} onChange={(e) => setSectionForm((prev) => ({ ...prev, sortOrder: Number(e.target.value) }))} />
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            <input type="checkbox" checked={sectionForm.isActive} onChange={(e) => setSectionForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            Активен
          </label>
          <button className="btn-primary" type="submit" disabled={saveSection.isPending}>
            {saveSection.isPending ? "Сохраняем..." : editingSectionId ? "Сохранить раздел" : "Создать раздел"}
          </button>
          <textarea className="input md:col-span-3 min-h-20" placeholder="Описание раздела" value={sectionForm.description} onChange={(e) => setSectionForm((prev) => ({ ...prev, description: e.target.value }))} />
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            <input type="checkbox" checked={sectionForm.showOnHomepage} onChange={(e) => setSectionForm((prev) => ({ ...prev, showOnHomepage: e.target.checked }))} />
            На главной
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            <input type="checkbox" checked={sectionForm.showInCatalog} onChange={(e) => setSectionForm((prev) => ({ ...prev, showInCatalog: e.target.checked }))} />
            В каталоге
          </label>
          {editingSectionId && (
            <button className="btn-secondary" type="button" onClick={() => { setEditingSectionId(null); setSectionForm(defaultSectionForm); }}>
              Отмена
            </button>
          )}
        </form>
        {message && <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</div>}
      </section>

      {(sections.data?.items || []).map((section) => {
        const draft = placementDrafts[section.id] || { productId: productOptions[0]?.id || "", sortOrder: 100, isPinned: false };
        return (
          <section className="card overflow-hidden" key={section.id}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold">{section.title}</h3>
                  <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{section.slug}</span>
                  <span className={`badge ${section.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{section.isActive ? "Активен" : "Отключен"}</span>
                </div>
                <div className="mt-1 text-sm text-slate-500">Порядок: {section.sortOrder}. На главной: {section.showOnHomepage ? "да" : "нет"}. В каталоге: {section.showInCatalog ? "да" : "нет"}.</div>
                {section.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{section.description}</p>}
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" type="button" onClick={() => onEditSection(section)}>Редактировать</button>
                <button className="btn-secondary" type="button" onClick={() => window.confirm(`Удалить раздел «${section.title}»?`) && deleteSection.mutate(section.id)} disabled={deleteSection.isPending}>Удалить</button>
              </div>
            </div>

            <div className="grid gap-2 border-b border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_120px_120px_auto] dark:border-slate-800">
              <select className="input" value={draft.productId} onChange={(e) => updatePlacementDraft(section.id, { productId: e.target.value })}>
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>{product.title} · {product.category}</option>
                ))}
              </select>
              <input className="input" type="number" value={draft.sortOrder} onChange={(e) => updatePlacementDraft(section.id, { sortOrder: Number(e.target.value) || 100 })} />
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <input type="checkbox" checked={draft.isPinned} onChange={(e) => updatePlacementDraft(section.id, { isPinned: e.target.checked })} />
                Закрепить
              </label>
              <button className="btn-primary" type="button" onClick={() => onAddPlacement(section.id)} disabled={addPlacement.isPending}>Добавить товар</button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3">Товар</th>
                    <th className="px-4 py-3">Цена</th>
                    <th className="px-4 py-3">Порядок</th>
                    <th className="px-4 py-3">Закреплен</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {(section.placements || []).map((placement) => (
                    <tr key={placement.id} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{productCardTitle(placement.product)}</div>
                        <div className="text-xs text-slate-500">{placement.product.slug}</div>
                      </td>
                      <td className="px-4 py-3">{money(Number(placement.product.price), placement.product.currency)}</td>
                      <td className="px-4 py-3">
                        <input
                          className="input w-24"
                          type="number"
                          value={placement.sortOrder}
                          onChange={(e) => updatePlacement.mutate({ id: placement.id, payload: { sortOrder: Number(e.target.value) || 100 } })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={placement.isPinned} onChange={(e) => updatePlacement.mutate({ id: placement.id, payload: { isPinned: e.target.checked } })} />
                      </td>
                      <td className="px-4 py-3">
                        <button className="btn-secondary" type="button" onClick={() => updatePlacement.mutate({ id: placement.id, payload: { isActive: !placement.isActive } })}>
                          {placement.isActive ? "Активен" : "Отключен"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button className="btn-secondary" type="button" onClick={() => removePlacement.mutate(placement.id)} disabled={removePlacement.isPending}>Убрать из раздела</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
