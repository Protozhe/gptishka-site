import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Save, Upload, X } from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/format";

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
  textColor?: string;
  buttonText?: string;
  buttonStyle?: string;
  buttonBackground?: string;
  buttonTextColor?: string;
  isVisible?: boolean;
};

type ProductVisualBackgroundType = "solid" | "gradient" | "image";

type Product = {
  id: string;
  title: string;
  slug: string;
  description: string;
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

type ShowcaseRenderMode = "auto" | "cards";

type ShowcaseSection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  showOnHomepage: boolean;
  showInCatalog: boolean;
  renderMode: ShowcaseRenderMode;
  placements: ShowcasePlacement[];
};

type SectionFormState = {
  title: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  showOnHomepage: boolean;
  showInCatalog: boolean;
  renderMode: ShowcaseRenderMode;
};

type ShowcaseServiceCard = {
  id?: string;
  serviceKey: string;
  title: string;
  description: string;
  planSummary: string;
  priceText: string;
  buttonText: string;
  href: string;
  iconText: string;
  theme: string;
  imageUrl: string;
  imageAlt: string;
  hoverImageUrl: string;
  hoverImageAlt: string;
  backgroundType: "solid" | "gradient" | "image";
  backgroundColor: string;
  backgroundGradient: string;
  textColor: string;
  buttonBackground: string;
  buttonTextColor: string;
  isActive: boolean;
  sortOrder: number;
  isDefault?: boolean;
};

const defaultSectionForm: SectionFormState = {
  title: "",
  slug: "",
  description: "",
  sortOrder: 100,
  isActive: true,
  showOnHomepage: true,
  showInCatalog: true,
  renderMode: "cards",
};

function productCardTitle(product: Product) {
  return product.visualConfig?.cardTitle || product.title;
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
    textColor: "",
    buttonText: "Выбрать тариф",
    buttonStyle: "primary",
    buttonBackground: "",
    buttonTextColor: "",
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
  price: string | number;
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
  const textColor = visual.textColor || "#ffffff";
  const buttonBackground = visual.buttonBackground || (visual.buttonStyle === "secondary" ? "rgba(255,255,255,.14)" : "#16a34a");
  const buttonTextColor = visual.buttonTextColor || "#ffffff";
  const numericPrice = Number(price);

  return (
    <article className="overflow-hidden rounded-[28px] p-3 shadow-xl" style={{ background, color: textColor }}>
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
        <p className="line-clamp-2 text-sm opacity-80">{description}</p>
        <div className="text-base font-bold">{numericPrice > 0 ? `от ${money(numericPrice, currency)}` : "цена на витрине"}</div>
        <button type="button" className="h-12 rounded-xl text-sm font-bold" style={{ background: buttonBackground, color: buttonTextColor }}>
          {visual.buttonText || "Выбрать тариф"}
        </button>
      </div>
    </article>
  );
}

function serviceCardBackground(card: ShowcaseServiceCard) {
  if (card.backgroundType === "gradient" && card.backgroundGradient) return card.backgroundGradient;
  if (card.backgroundType === "image" && card.imageUrl) {
    return `linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.62)), url("${card.imageUrl}") center/cover`;
  }
  return card.backgroundColor || "#111827";
}

function serviceCardButtonBackground(card: ShowcaseServiceCard) {
  return card.buttonBackground || "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)";
}

function normalizeServiceCardKeyInput(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildBlankServiceCard(serviceKey: string, sortOrder = 100): ShowcaseServiceCard {
  const key = normalizeServiceCardKeyInput(serviceKey);
  return {
    serviceKey: key,
    title: "Новая карточка",
    description: "Описание карточки на главной.",
    planSummary: "",
    priceText: "",
    buttonText: "Открыть",
    href: "/catalog/",
    iconText: key ? key.slice(0, 8).toUpperCase() : "NEW",
    theme: key || "custom",
    imageUrl: "",
    imageAlt: "",
    hoverImageUrl: "",
    hoverImageAlt: "",
    backgroundType: "gradient",
    backgroundColor: "#111111",
    backgroundGradient: "linear-gradient(135deg,#111111,#243)",
    textColor: "",
    buttonBackground: "",
    buttonTextColor: "",
    isActive: true,
    sortOrder,
    isDefault: false,
  };
}

export default function ShowcasePage() {
  const queryClient = useQueryClient();
  const [sectionForm, setSectionForm] = useState(defaultSectionForm);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [selectedVisualProductId, setSelectedVisualProductId] = useState("");
  const [visualConfig, setVisualConfig] = useState<ProductVisualConfig>(buildDefaultVisualConfig());
  const [visualMessage, setVisualMessage] = useState<string | null>(null);
  const [editingServiceCardKey, setEditingServiceCardKey] = useState<string | null>(null);
  const [serviceCardDrafts, setServiceCardDrafts] = useState<Record<string, ShowcaseServiceCard>>({});
  const [placementDrafts, setPlacementDrafts] = useState<Record<string, { productId: string; sortOrder: number; isPinned: boolean }>>({});
  const [message, setMessage] = useState<string | null>(null);

  const sections = useQuery({
    queryKey: ["showcase-sections"],
    queryFn: async () => (await api.get("/showcase/sections")).data as { items: ShowcaseSection[] },
  });

  const serviceCardsQuery = useQuery({
    queryKey: ["showcase-service-cards"],
    queryFn: async () => (await api.get("/showcase/service-cards")).data as { items: ShowcaseServiceCard[] },
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

  const selectedVisualProduct = useMemo(() => {
    const selectedId = selectedVisualProductId || productOptions[0]?.id || "";
    return productOptions.find((item) => item.id === selectedId) || productOptions[0] || null;
  }, [productOptions, selectedVisualProductId]);

  useEffect(() => {
    if (!selectedVisualProduct && selectedVisualProductId) {
      setSelectedVisualProductId("");
      setVisualConfig(buildDefaultVisualConfig());
      return;
    }
    if (!selectedVisualProduct) return;
    if (!selectedVisualProductId) {
      setSelectedVisualProductId(selectedVisualProduct.id);
    }
    setVisualConfig(mergeVisualConfig(selectedVisualProduct));
    setVisualMessage(null);
  }, [selectedVisualProduct?.id]);

  const serviceCards = useMemo(() => {
    const items = Array.isArray(serviceCardsQuery.data?.items) ? serviceCardsQuery.data.items : [];
    const savedKeys = new Set(items.map((item) => item.serviceKey));
    const draftOnly = Object.values(serviceCardDrafts).filter((item) => item?.serviceKey && !savedKeys.has(item.serviceKey));
    return [...items, ...draftOnly].slice().sort((a, b) => Number(a.sortOrder || 100) - Number(b.sortOrder || 100));
  }, [serviceCardsQuery.data?.items, serviceCardDrafts]);

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

  const saveProductVisual = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProductVisualConfig }) => api.put(`/products/${id}/visual`, payload),
    onSuccess: () => {
      setVisualMessage("Визуал карточки сохранён.");
      queryClient.invalidateQueries({ queryKey: ["showcase-products"] });
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
      if (nextVisual) setVisualConfig((prev) => ({ ...prev, ...nextVisual }));
      queryClient.invalidateQueries({ queryKey: ["showcase-products"] });
    },
  });

  const deleteProductVisualImageMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}/visual/image`),
    onSuccess: (response) => {
      const nextVisual = response.data?.visual as ProductVisualConfig | undefined;
      setVisualConfig((prev) => ({ ...prev, ...(nextVisual || {}), imageUrl: "", imageAlt: "" }));
      queryClient.invalidateQueries({ queryKey: ["showcase-products"] });
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
      if (nextVisual) setVisualConfig((prev) => ({ ...prev, ...nextVisual }));
      queryClient.invalidateQueries({ queryKey: ["showcase-products"] });
    },
  });

  const deleteProductVisualHoverImageMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}/visual/hover-image`),
    onSuccess: (response) => {
      const nextVisual = response.data?.visual as ProductVisualConfig | undefined;
      setVisualConfig((prev) => ({ ...prev, ...(nextVisual || {}), hoverImageUrl: "", hoverImageAlt: "" }));
      queryClient.invalidateQueries({ queryKey: ["showcase-products"] });
    },
  });

  const saveServiceCard = useMutation({
    mutationFn: ({ serviceKey, payload }: { serviceKey: string; payload: ShowcaseServiceCard }) =>
      api.put(`/showcase/service-cards/${serviceKey}`, payload),
    onSuccess: () => {
      setEditingServiceCardKey(null);
      queryClient.invalidateQueries({ queryKey: ["showcase-service-cards"] });
    },
  });

  const uploadServiceCardImage = useMutation({
    mutationFn: async ({ serviceKey, file, kind }: { serviceKey: string; file: File; kind: "image" | "hover" }) => {
      const formData = new FormData();
      formData.append("image", file);
      const path = kind === "hover" ? "hover-image" : "image";
      return (await api.post(`/showcase/service-cards/${serviceKey}/${path}`, formData, { headers: { "Content-Type": "multipart/form-data" } })).data as { imageUrl: string; item: ShowcaseServiceCard };
    },
    onSuccess: (result) => {
      const item = result.item;
      setServiceCardDrafts((prev) => ({ ...prev, [item.serviceKey]: item }));
      queryClient.invalidateQueries({ queryKey: ["showcase-service-cards"] });
    },
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
      renderMode: section.renderMode || "auto",
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

  function selectVisualProduct(productId: string) {
    const product = productOptions.find((item) => item.id === productId);
    setSelectedVisualProductId(productId);
    setVisualConfig(product ? mergeVisualConfig(product) : buildDefaultVisualConfig());
    setVisualMessage(null);
  }

  function updateVisualConfig(patch: Partial<ProductVisualConfig>) {
    setVisualConfig((prev) => ({ ...prev, ...patch }));
    setVisualMessage(null);
  }

  function prepareVisualPayload(): ProductVisualConfig {
    return {
      cardTitle: String(visualConfig.cardTitle || "").trim(),
      cardDescription: String(visualConfig.cardDescription || "").trim(),
      imageUrl: String(visualConfig.imageUrl || "").trim(),
      imageAlt: String(visualConfig.imageAlt || "").trim(),
      hoverImageUrl: String(visualConfig.hoverImageUrl || "").trim(),
      hoverImageAlt: String(visualConfig.hoverImageAlt || "").trim(),
      backgroundType: visualConfig.backgroundType || "solid",
      backgroundColor: String(visualConfig.backgroundColor || "").trim(),
      backgroundGradient: String(visualConfig.backgroundGradient || "").trim(),
      textColor: String(visualConfig.textColor || "").trim(),
      buttonText: String(visualConfig.buttonText || "").trim(),
      buttonStyle: String(visualConfig.buttonStyle || "").trim(),
      buttonBackground: String(visualConfig.buttonBackground || "").trim(),
      buttonTextColor: String(visualConfig.buttonTextColor || "").trim(),
      isVisible: visualConfig.isVisible !== false,
    };
  }

  async function onSaveVisualOnly() {
    const product = selectedVisualProduct;
    if (!product) {
      setVisualMessage("Выберите товар для редактирования визуала.");
      return;
    }
    try {
      const response = await saveProductVisual.mutateAsync({ id: product.id, payload: prepareVisualPayload() });
      const nextVisual = response.data?.visual as ProductVisualConfig | undefined;
      if (nextVisual) setVisualConfig((prev) => ({ ...prev, ...nextVisual }));
    } catch {
      setVisualMessage("Не удалось сохранить визуал карточки.");
    }
  }

  async function onUploadVisualImage(file: File | null) {
    const product = selectedVisualProduct;
    if (!product || !file) return;
    await uploadProductVisualImageMutation.mutateAsync({ id: product.id, file });
  }

  async function onUploadVisualHoverImage(file: File | null) {
    const product = selectedVisualProduct;
    if (!product || !file) return;
    await uploadProductVisualHoverImageMutation.mutateAsync({ id: product.id, file });
  }

  function onDeleteVisualImage() {
    const product = selectedVisualProduct;
    if (!product) return;
    deleteProductVisualImageMutation.mutate(product.id);
  }

  function onDeleteVisualHoverImage() {
    const product = selectedVisualProduct;
    if (!product) return;
    deleteProductVisualHoverImageMutation.mutate(product.id);
  }

  function serviceCardDraft(card: ShowcaseServiceCard) {
    return serviceCardDrafts[card.serviceKey] || card;
  }

  function editServiceCard(card: ShowcaseServiceCard) {
    setEditingServiceCardKey(card.serviceKey);
    setServiceCardDrafts((prev) => ({ ...prev, [card.serviceKey]: card }));
  }

  function createServiceCard() {
    const raw = window.prompt("Введите ключ карточки латиницей, например steam-topup или new-service");
    const key = normalizeServiceCardKeyInput(raw || "");
    if (!key) {
      setMessage("Ключ карточки должен быть латиницей: a-z, 0-9, дефис или подчёркивание.");
      return;
    }
    const existing = serviceCards.find((card) => card.serviceKey === key);
    if (existing) {
      editServiceCard(existing);
      return;
    }
    const next = buildBlankServiceCard(key, Math.max(100, ...serviceCards.map((card) => Number(card.sortOrder || 100))) + 10);
    setServiceCardDrafts((prev) => ({ ...prev, [key]: next }));
    setEditingServiceCardKey(key);
  }

  function updateServiceCardDraft(serviceKey: string, patch: Partial<ShowcaseServiceCard>) {
    const source = serviceCards.find((card) => card.serviceKey === serviceKey);
    if (!source) return;
    setServiceCardDrafts((prev) => ({
      ...prev,
      [serviceKey]: {
        ...(prev[serviceKey] || source),
        ...patch,
      },
    }));
  }

  function submitServiceCard(card: ShowcaseServiceCard) {
    const draft = serviceCardDraft(card);
    saveServiceCard.mutate({ serviceKey: card.serviceKey, payload: draft });
  }

  async function uploadServiceCardFile(card: ShowcaseServiceCard, kind: "image" | "hover", file: File | null) {
    if (!file) return;
    const result = await uploadServiceCardImage.mutateAsync({ serviceKey: card.serviceKey, kind, file });
    const field = kind === "hover" ? "hoverImageUrl" : "imageUrl";
    updateServiceCardDraft(card.serviceKey, { [field]: result.imageUrl } as Partial<ShowcaseServiceCard>);
  }

  return (
    <div className="space-y-4">
      <section className="hidden">
        <div className="mb-3">
          <h2 className="text-lg font-bold">Конструктор витрины</h2>
          <p className="text-sm text-slate-500">Разделы и порядок карточек не меняют Product.id, slug, tags и выдачу.</p>
        </div>

        <form className="grid gap-2 md:grid-cols-6" onSubmit={onSubmitSection}>
          <input className="input md:col-span-2" placeholder="Название раздела" value={sectionForm.title} onChange={(e) => setSectionForm((prev) => ({ ...prev, title: e.target.value }))} />
          <input className="input" placeholder="slug, можно пустым" value={sectionForm.slug} onChange={(e) => setSectionForm((prev) => ({ ...prev, slug: e.target.value }))} />
          <input className="input" type="number" placeholder="Порядок" value={sectionForm.sortOrder} onChange={(e) => setSectionForm((prev) => ({ ...prev, sortOrder: Number(e.target.value) }))} />
          <select className="input" value={sectionForm.renderMode} onChange={(e) => setSectionForm((prev) => ({ ...prev, renderMode: e.target.value as ShowcaseRenderMode }))}>
            <option value="cards">Карточки товаров</option>
            <option value="auto">Авто AI/VPN</option>
          </select>
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

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Визуал карточки на витрине</h3>
            <p className="text-sm text-slate-500">Редактирует внешний вид товара на главной и в витрине. Product.id, цена, tags и выдача не меняются.</p>
          </div>
          <select
            className="input min-w-[280px]"
            value={selectedVisualProduct?.id || ""}
            onChange={(e) => selectVisualProduct(e.target.value)}
          >
            {productOptions.map((product) => (
              <option key={product.id} value={product.id}>
                {product.title} · {product.category}
              </option>
            ))}
          </select>
        </div>

        {!selectedVisualProduct ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Активных товаров для редактирования визуала пока нет.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <input
                  type="checkbox"
                  checked={visualConfig.isVisible !== false}
                  onChange={(e) => updateVisualConfig({ isVisible: e.target.checked })}
                />
                Показывать карточку
              </label>
              <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-slate-800">
                {selectedVisualProduct.slug}
              </div>
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
                placeholder="URL обычного изображения"
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
                placeholder="URL hover-изображения"
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
              <input
                className="input"
                placeholder="Цвет текста карточки, например #ffffff"
                value={visualConfig.textColor || ""}
                onChange={(e) => updateVisualConfig({ textColor: e.target.value })}
              />
              <input
                className="input"
                placeholder="Стиль кнопки: primary / secondary / glass"
                value={visualConfig.buttonStyle || ""}
                onChange={(e) => updateVisualConfig({ buttonStyle: e.target.value })}
              />
              <input
                className="input"
                placeholder="Фон кнопки CSS"
                value={visualConfig.buttonBackground || ""}
                onChange={(e) => updateVisualConfig({ buttonBackground: e.target.value })}
              />
              <input
                className="input"
                placeholder="Цвет текста кнопки, например #06110b"
                value={visualConfig.buttonTextColor || ""}
                onChange={(e) => updateVisualConfig({ buttonTextColor: e.target.value })}
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
                <button type="button" className="btn-secondary" onClick={onDeleteVisualImage} disabled={deleteProductVisualImageMutation.isPending}>
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
                <button type="button" className="btn-secondary" onClick={onDeleteVisualHoverImage} disabled={deleteProductVisualHoverImageMutation.isPending}>
                  Удалить hover
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void onSaveVisualOnly()}
                  disabled={saveProductVisual.isPending}
                >
                  {saveProductVisual.isPending ? "Сохраняем визуал..." : "Сохранить визуал карточки"}
                </button>
                <span className="text-xs text-slate-500">Сохраняет только внешний вид выбранного товара.</span>
              </div>
              {visualMessage && <div className="text-xs text-slate-600 dark:text-slate-300 md:col-span-2">{visualMessage}</div>}
            </div>

            <ProductVisualPreview
              visual={visualConfig}
              fallbackTitle={selectedVisualProduct.title}
              fallbackDescription={selectedVisualProduct.description}
              price={selectedVisualProduct.price}
              currency={selectedVisualProduct.currency}
            />
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Карточки главной</h3>
            <p className="text-sm text-slate-500">Отдельные карточки сервисов: ChatGPT, Claude, SuperGrok и VPN. Это не тарифы, а визуальные карточки на главной.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {serviceCardsQuery.isFetching && <span className="badge bg-slate-100 text-slate-600">Обновляем</span>}
            <button className="btn-primary inline-flex items-center gap-2" type="button" onClick={createServiceCard}>
              <Plus size={16} />
              Добавить карточку
            </button>
          </div>
        </div>

        {serviceCardsQuery.isError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Не удалось загрузить карточки главной. Проверьте API и миграции базы.
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
          {serviceCards.map((card) => {
            const draftCard = serviceCardDraft(card);
            const editing = editingServiceCardKey === card.serviceKey;
            return (
              <article className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800" key={card.serviceKey}>
                <div
                  className="overflow-hidden rounded-xl p-3 shadow-sm"
                  style={{
                    background: serviceCardBackground(draftCard),
                    color: draftCard.textColor || "#ffffff",
                  }}
                >
                  <div className="mb-3 aspect-[16/10] overflow-hidden rounded-lg bg-black/20">
                    {draftCard.imageUrl ? (
                      <img className="h-full w-full object-cover" src={draftCard.imageUrl} alt={draftCard.imageAlt || draftCard.title} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl font-bold">{draftCard.iconText || draftCard.serviceKey}</div>
                    )}
                  </div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white/15 px-2 py-1 text-xs font-bold">{draftCard.iconText || draftCard.serviceKey}</span>
                    <span className="text-xs opacity-80">{draftCard.serviceKey}</span>
                  </div>
                  <h4 className="text-lg font-bold">{draftCard.title || card.serviceKey}</h4>
                  <p className="mt-1 min-h-12 text-sm opacity-80">{draftCard.description}</p>
                  {draftCard.planSummary && <p className="mt-2 text-xs opacity-80">{draftCard.planSummary}</p>}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <strong className="text-sm">{draftCard.priceText || "Цена авто"}</strong>
                    <span
                      className="rounded-lg px-3 py-2 text-xs font-bold"
                      style={{ background: serviceCardButtonBackground(draftCard), color: draftCard.buttonTextColor || "#06110b" }}
                    >
                      {draftCard.buttonText || "К тарифам"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-secondary inline-flex items-center gap-2" type="button" onClick={() => editServiceCard(card)}>
                    <Pencil size={16} />
                    Редактировать
                  </button>
                  {editing && (
                    <>
                      <button className="btn-primary inline-flex items-center gap-2" type="button" disabled={saveServiceCard.isPending} onClick={() => submitServiceCard(card)}>
                        <Save size={16} />
                        Сохранить
                      </button>
                      <button className="btn-secondary inline-flex items-center gap-2" type="button" onClick={() => setEditingServiceCardKey(null)}>
                        <X size={16} />
                        Закрыть
                      </button>
                    </>
                  )}
                </div>

                {editing && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <input className="input" placeholder="Название" value={draftCard.title || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { title: e.target.value })} />
                    <input className="input" placeholder="Ссылка" value={draftCard.href || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { href: e.target.value })} />
                    <textarea className="input min-h-20 md:col-span-2" placeholder="Описание" value={draftCard.description || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { description: e.target.value })} />
                    <input className="input" placeholder="Строка тарифов" value={draftCard.planSummary || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { planSummary: e.target.value })} />
                    <input className="input" placeholder="Цена на карточке" value={draftCard.priceText || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { priceText: e.target.value })} />
                    <input className="input" placeholder="Текст кнопки" value={draftCard.buttonText || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { buttonText: e.target.value })} />
                    <input className="input" placeholder="Иконка" value={draftCard.iconText || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { iconText: e.target.value })} />
                    <input className="input" placeholder="Theme class" value={draftCard.theme || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { theme: e.target.value })} />
                    <input className="input" type="number" placeholder="Порядок" value={draftCard.sortOrder || 100} onChange={(e) => updateServiceCardDraft(card.serviceKey, { sortOrder: Number(e.target.value) || 100 })} />
                    <input className="input" placeholder="Картинка" value={draftCard.imageUrl || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { imageUrl: e.target.value })} />
                    <label className="btn-secondary inline-flex cursor-pointer items-center justify-center gap-2">
                      <Upload size={16} />
                      Загрузить
                      <input className="hidden" type="file" accept="image/*" onChange={(e) => { void uploadServiceCardFile(card, "image", e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                    </label>
                    <input className="input" placeholder="Hover-картинка" value={draftCard.hoverImageUrl || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { hoverImageUrl: e.target.value })} />
                    <label className="btn-secondary inline-flex cursor-pointer items-center justify-center gap-2">
                      <Upload size={16} />
                      Hover
                      <input className="hidden" type="file" accept="image/*" onChange={(e) => { void uploadServiceCardFile(card, "hover", e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                    </label>
                    <select className="input" value={draftCard.backgroundType || "solid"} onChange={(e) => updateServiceCardDraft(card.serviceKey, { backgroundType: e.target.value as ShowcaseServiceCard["backgroundType"] })}>
                      <option value="solid">Solid</option>
                      <option value="gradient">Gradient</option>
                      <option value="image">Image</option>
                    </select>
                    <input className="input" placeholder="Фон" value={draftCard.backgroundColor || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { backgroundColor: e.target.value })} />
                    <input className="input md:col-span-2" placeholder="Градиент" value={draftCard.backgroundGradient || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { backgroundGradient: e.target.value })} />
                    <input className="input" placeholder="Цвет текста" value={draftCard.textColor || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { textColor: e.target.value })} />
                    <input className="input" placeholder="Фон кнопки" value={draftCard.buttonBackground || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { buttonBackground: e.target.value })} />
                    <input className="input" placeholder="Цвет кнопки" value={draftCard.buttonTextColor || ""} onChange={(e) => updateServiceCardDraft(card.serviceKey, { buttonTextColor: e.target.value })} />
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                      <input type="checkbox" checked={draftCard.isActive !== false} onChange={(e) => updateServiceCardDraft(card.serviceKey, { isActive: e.target.checked })} />
                      Активна
                    </label>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {false && (sections.data?.items || []).map((section) => {
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
