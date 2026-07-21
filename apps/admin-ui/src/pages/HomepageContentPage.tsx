import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

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

type HomepageContent = {
  slides: Record<Lang, PromoSlide[]>;
  shortcuts: Record<Lang, Shortcut[]>;
};

const emptyContent: HomepageContent = {
  slides: { ru: [], en: [] },
  shortcuts: { ru: [], en: [] },
};

const newSlide = (lang: Lang, index: number): PromoSlide => ({
  id: `slide-${Date.now()}`,
  isActive: true,
  badge: lang === "en" ? "News" : "Новости",
  titleLines: [lang === "en" ? "New banner" : "Новый баннер"],
  description: "",
  buttonText: lang === "en" ? "Open" : "Открыть",
  buttonHref: lang === "en" ? "/en/catalog/" : "/catalog/",
  imageUrl: "",
  themeClass: "home-promo-slide--custom",
  sortOrder: (index + 1) * 10,
});

const newShortcut = (lang: Lang, index: number): Shortcut => ({
  id: `shortcut-${Date.now()}`,
  isActive: true,
  title: lang === "en" ? "Section" : "Раздел",
  href: lang === "en" ? "/en/catalog/" : "/catalog/",
  ariaLabel: lang === "en" ? "Open section" : "Открыть раздел",
  imageUrl: "",
  hoverImageUrl: "",
  logoUrl: "",
  themeClass: "home-service-shortcut--custom",
  sortOrder: (index + 1) * 10,
});

function cloneContent(content: HomepageContent): HomepageContent {
  return JSON.parse(JSON.stringify(content));
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || "");
  return "Не удалось загрузить данные главной страницы.";
}

export default function HomepageContentPage() {
  const queryClient = useQueryClient();
  const [lang, setLang] = useState<Lang>("ru");
  const [draft, setDraft] = useState<HomepageContent | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["homepage-content"],
    queryFn: async () => (await api.get("/homepage-content")).data as HomepageContent,
    retry: 1,
  });

  const content = useMemo(() => draft || query.data || emptyContent, [draft, query.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: HomepageContent) => (await api.put("/homepage-content", payload)).data as HomepageContent,
    onSuccess: (saved) => {
      setDraft(saved);
      setMessage("Сохранено.");
      queryClient.invalidateQueries({ queryKey: ["homepage-content"] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      return (await api.post("/homepage-content/image", formData, { headers: { "Content-Type": "multipart/form-data" } })).data as { imageUrl: string };
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  function updateContent(mutator: (next: HomepageContent) => void) {
    setDraft((prev) => {
      const next = cloneContent(prev || query.data || emptyContent);
      mutator(next);
      return next;
    });
    setMessage(null);
  }

  function updateSlide(index: number, patch: Partial<PromoSlide>) {
    updateContent((next) => {
      next.slides[lang][index] = { ...next.slides[lang][index], ...patch };
    });
  }

  function updateShortcut(index: number, patch: Partial<Shortcut>) {
    updateContent((next) => {
      next.shortcuts[lang][index] = { ...next.shortcuts[lang][index], ...patch };
    });
  }

  async function uploadTo(target: "slide" | "shortcutImage" | "shortcutHover" | "shortcutLogo", index: number, file: File | null) {
    if (!file) return;
    const result = await uploadMutation.mutateAsync(file);
    if (target === "slide") updateSlide(index, { imageUrl: result.imageUrl });
    if (target === "shortcutImage") updateShortcut(index, { imageUrl: result.imageUrl });
    if (target === "shortcutHover") updateShortcut(index, { hoverImageUrl: result.imageUrl });
    if (target === "shortcutLogo") updateShortcut(index, { logoUrl: result.imageUrl });
  }

  const slides = content.slides[lang] || [];
  const shortcuts = content.shortcuts[lang] || [];

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Главная страница</h2>
            <p className="text-sm text-slate-500">
              Редактирование слайдера и трёх плиток под ним: Пополнения, Нейросети, V*N.
            </p>
          </div>
          <div className="flex gap-2">
            <button className={`btn-secondary ${lang === "ru" ? "bg-cyan-600 text-white" : ""}`} type="button" onClick={() => setLang("ru")}>RU</button>
            <button className={`btn-secondary ${lang === "en" ? "bg-cyan-600 text-white" : ""}`} type="button" onClick={() => setLang("en")}>EN</button>
            <button className="btn-primary" type="button" disabled={saveMutation.isPending || query.isLoading} onClick={() => saveMutation.mutate(content)}>
              {saveMutation.isPending ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </div>
        {query.isLoading && <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Загружаем настройки главной страницы...</div>}
        {query.isError && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Не удалось загрузить настройки. Проверьте авторизацию и API: {errorMessage(query.error)}
          </div>
        )}
        {message && <div className="mt-2 text-sm text-emerald-600">{message}</div>}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold">Слайдер</h3>
          <button className="btn-secondary" type="button" onClick={() => updateContent((next) => next.slides[lang].push(newSlide(lang, next.slides[lang].length)))}>
            + Добавить слайд
          </button>
        </div>

        <div className="space-y-3">
          {slides.map((slide, index) => (
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800" key={`${slide.id}-${index}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <strong>Слайд #{index + 1}</strong>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={slide.isActive} onChange={(e) => updateSlide(index, { isActive: e.target.checked })} />
                  Активен
                </label>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <input className="input" placeholder="ID" value={slide.id} onChange={(e) => updateSlide(index, { id: e.target.value })} />
                <input className="input" placeholder="Бейдж" value={slide.badge} onChange={(e) => updateSlide(index, { badge: e.target.value })} />
                <input className="input" type="number" placeholder="Порядок" value={slide.sortOrder} onChange={(e) => updateSlide(index, { sortOrder: Number(e.target.value) || 0 })} />
                <input className="input" placeholder="CSS-класс темы" value={slide.themeClass} onChange={(e) => updateSlide(index, { themeClass: e.target.value })} />
                <textarea
                  className="input min-h-20 md:col-span-2"
                  placeholder="Заголовок. Каждая строка = отдельная строка на баннере"
                  value={(slide.titleLines || []).join("\n")}
                  onChange={(e) => updateSlide(index, { titleLines: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })}
                />
                <textarea className="input min-h-20 md:col-span-2" placeholder="Описание" value={slide.description} onChange={(e) => updateSlide(index, { description: e.target.value })} />
                <input className="input" placeholder="Текст кнопки" value={slide.buttonText} onChange={(e) => updateSlide(index, { buttonText: e.target.value })} />
                <input className="input" placeholder="Ссылка кнопки" value={slide.buttonHref} onChange={(e) => updateSlide(index, { buttonHref: e.target.value })} />
                <input className="input" placeholder="URL фоновой картинки" value={slide.imageUrl} onChange={(e) => updateSlide(index, { imageUrl: e.target.value })} />
                <label className="btn-secondary cursor-pointer text-center">
                  Загрузить фото
                  <input className="hidden" type="file" accept="image/*" onChange={(e) => { void uploadTo("slide", index, e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                </label>
              </div>
              {slide.imageUrl && <img className="mt-2 h-24 rounded-xl object-cover" src={slide.imageUrl} alt="" />}
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold">Разделы под слайдером</h3>
          <button className="btn-secondary" type="button" onClick={() => updateContent((next) => next.shortcuts[lang].push(newShortcut(lang, next.shortcuts[lang].length)))}>
            + Добавить раздел
          </button>
        </div>

        <div className="space-y-3">
          {shortcuts.map((shortcut, index) => (
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800" key={`${shortcut.id}-${index}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <strong>{shortcut.title || `Раздел #${index + 1}`}</strong>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={shortcut.isActive} onChange={(e) => updateShortcut(index, { isActive: e.target.checked })} />
                  Активен
                </label>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <input className="input" placeholder="ID" value={shortcut.id} onChange={(e) => updateShortcut(index, { id: e.target.value })} />
                <input className="input" placeholder="Название" value={shortcut.title} onChange={(e) => updateShortcut(index, { title: e.target.value })} />
                <input className="input" type="number" placeholder="Порядок" value={shortcut.sortOrder} onChange={(e) => updateShortcut(index, { sortOrder: Number(e.target.value) || 0 })} />
                <input className="input" placeholder="CSS-класс темы" value={shortcut.themeClass} onChange={(e) => updateShortcut(index, { themeClass: e.target.value })} />
                <input className="input md:col-span-2" placeholder="Ссылка" value={shortcut.href} onChange={(e) => updateShortcut(index, { href: e.target.value })} />
                <input className="input md:col-span-2" placeholder="Aria label" value={shortcut.ariaLabel} onChange={(e) => updateShortcut(index, { ariaLabel: e.target.value })} />
                <input className="input" placeholder="Основная картинка" value={shortcut.imageUrl} onChange={(e) => updateShortcut(index, { imageUrl: e.target.value })} />
                <label className="btn-secondary cursor-pointer text-center">
                  Загрузить 1 картинку
                  <input className="hidden" type="file" accept="image/*" onChange={(e) => { void uploadTo("shortcutImage", index, e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                </label>
                <input className="input" placeholder="Hover-картинка" value={shortcut.hoverImageUrl} onChange={(e) => updateShortcut(index, { hoverImageUrl: e.target.value })} />
                <label className="btn-secondary cursor-pointer text-center">
                  Загрузить hover
                  <input className="hidden" type="file" accept="image/*" onChange={(e) => { void uploadTo("shortcutHover", index, e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                </label>
                <input className="input" placeholder="Лого вместо картинки" value={shortcut.logoUrl} onChange={(e) => updateShortcut(index, { logoUrl: e.target.value })} />
                <label className="btn-secondary cursor-pointer text-center">
                  Загрузить лого
                  <input className="hidden" type="file" accept="image/*" onChange={(e) => { void uploadTo("shortcutLogo", index, e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                </label>
              </div>
              <div className="mt-2 flex gap-2">
                {shortcut.imageUrl && <img className="h-20 w-32 rounded-xl object-cover" src={shortcut.imageUrl} alt="" />}
                {shortcut.hoverImageUrl && <img className="h-20 w-32 rounded-xl object-cover" src={shortcut.hoverImageUrl} alt="" />}
                {shortcut.logoUrl && <img className="h-20 w-32 rounded-xl object-contain" src={shortcut.logoUrl} alt="" />}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
