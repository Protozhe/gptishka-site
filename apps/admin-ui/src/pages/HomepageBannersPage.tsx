import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type HomepageBannerSlide = {
  id: string;
  badge: string;
  title: string;
  description: string;
  buttonText: string;
  buttonUrl: string;
  backgroundImageUrl: string;
  backgroundColor: string;
  backgroundGradient: string;
  textColor: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type SlideDraft = Omit<HomepageBannerSlide, "id" | "createdAt" | "updatedAt">;

const DEFAULT_GRADIENT =
  "linear-gradient(135deg, rgba(53, 242, 143, 0.34), rgba(52, 108, 255, 0.2), rgba(5, 7, 13, 0.96))";

const EMPTY_DRAFT: SlideDraft = {
  badge: "Новость",
  title: "Новый баннер GPTishka",
  description: "Коротко опишите акцию, новость или важное обновление для клиентов.",
  buttonText: "К тарифам",
  buttonUrl: "#pricing",
  backgroundImageUrl: "",
  backgroundColor: "#05070d",
  backgroundGradient: DEFAULT_GRADIENT,
  textColor: "",
  isActive: true,
  sortOrder: 100,
};

function toDraft(slide: HomepageBannerSlide): SlideDraft {
  return {
    badge: slide.badge || "",
    title: slide.title || "",
    description: slide.description || "",
    buttonText: slide.buttonText || "",
    buttonUrl: slide.buttonUrl || "",
    backgroundImageUrl: slide.backgroundImageUrl || "",
    backgroundColor: slide.backgroundColor || "#05070d",
    backgroundGradient: slide.backgroundGradient || DEFAULT_GRADIENT,
    textColor: slide.textColor || "",
    isActive: slide.isActive !== false,
    sortOrder: slide.sortOrder ?? 100,
  };
}

function previewBackground(draft: SlideDraft) {
  const gradient = draft.backgroundGradient || `linear-gradient(135deg, ${draft.backgroundColor || "#05070d"}, #101827)`;
  if (!draft.backgroundImageUrl) return gradient;
  return `${gradient}, url("${draft.backgroundImageUrl}") center / cover no-repeat`;
}

export default function HomepageBannersPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, SlideDraft>>({});
  const [error, setError] = useState("");

  const slidesQuery = useQuery<{ items: HomepageBannerSlide[] }>({
    queryKey: ["homepage-banners"],
    queryFn: async () => (await api.get("/homepage/banners")).data,
  });

  const slides = useMemo(() => slidesQuery.data?.items || [], [slidesQuery.data?.items]);

  useEffect(() => {
    const next: Record<string, SlideDraft> = {};
    for (const slide of slides) {
      next[slide.id] = toDraft(slide);
    }
    setDrafts(next);
  }, [slides]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["homepage-banners"] });

  const createMutation = useMutation({
    mutationFn: async () => (await api.post("/homepage/banners", EMPTY_DRAFT)).data,
    onSuccess: () => {
      setError("");
      invalidate();
    },
    onError: () => setError("Не удалось создать баннер. Проверьте доступ к API."),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: SlideDraft }) => (await api.put(`/homepage/banners/${id}`, draft)).data,
    onSuccess: () => {
      setError("");
      invalidate();
    },
    onError: () => setError("Не удалось сохранить баннер. Проверьте поля и доступ к API."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/homepage/banners/${id}`),
    onSuccess: () => {
      setError("");
      invalidate();
    },
    onError: () => setError("Не удалось удалить баннер."),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      return (await api.post(`/homepage/banners/${id}/background`, formData, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: () => {
      setError("");
      invalidate();
    },
    onError: () => setError("Не удалось загрузить фоновую картинку."),
  });

  const deleteBackgroundMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/homepage/banners/${id}/background`)).data,
    onSuccess: () => {
      setError("");
      invalidate();
    },
    onError: () => setError("Не удалось удалить фоновую картинку."),
  });

  function updateDraft<K extends keyof SlideDraft>(id: string, key: K, value: SlideDraft[K]) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || EMPTY_DRAFT),
        [key]: value,
      },
    }));
  }

  function removeSlide(id: string) {
    if (!window.confirm("Удалить этот баннер с главной?")) return;
    deleteMutation.mutate(id);
  }

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-950 via-emerald-950 to-cyan-900 px-5 py-4 text-white">
          <h2 className="text-lg font-bold">Главная: баннеры и новости</h2>
          <p className="mt-1 max-w-3xl text-sm text-emerald-50">
            Управляйте большим баннером на первом экране: новости, акции, важные обновления, фоновые картинки и кнопки.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="text-sm font-semibold">Слайдов: {slides.length}</div>
            <div className="text-xs text-slate-500">На сайте показываются только активные слайды, отсортированные по порядку.</div>
          </div>
          <button className="btn-primary" type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            Добавить баннер
          </button>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {slidesQuery.isLoading ? <div className="card p-5 text-sm text-slate-500">Загружаем баннеры...</div> : null}

      <div className="space-y-4">
        {slides.map((slide) => {
          const draft = drafts[slide.id] || toDraft(slide);
          return (
            <section className="card overflow-hidden" key={slide.id}>
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_440px]">
                <div className="space-y-4 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Бейдж</span>
                      <input className="input" value={draft.badge} onChange={(event) => updateDraft(slide.id, "badge", event.target.value)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Порядок</span>
                      <input
                        className="input"
                        type="number"
                        value={draft.sortOrder}
                        onChange={(event) => updateDraft(slide.id, "sortOrder", Number(event.target.value || 0))}
                      />
                    </label>
                  </div>

                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Заголовок</span>
                    <input className="input" value={draft.title} onChange={(event) => updateDraft(slide.id, "title", event.target.value)} />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Текст</span>
                    <textarea
                      className="input min-h-[96px]"
                      value={draft.description}
                      onChange={(event) => updateDraft(slide.id, "description", event.target.value)}
                    />
                  </label>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Название кнопки</span>
                      <input className="input" value={draft.buttonText} onChange={(event) => updateDraft(slide.id, "buttonText", event.target.value)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ссылка кнопки</span>
                      <input className="input" value={draft.buttonUrl} onChange={(event) => updateDraft(slide.id, "buttonUrl", event.target.value)} />
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Цвет фона</span>
                      <input className="input" value={draft.backgroundColor} onChange={(event) => updateDraft(slide.id, "backgroundColor", event.target.value)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Цвет текста</span>
                      <input className="input" value={draft.textColor} onChange={(event) => updateDraft(slide.id, "textColor", event.target.value)} placeholder="#ffffff" />
                    </label>
                  </div>

                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Градиент / overlay</span>
                    <textarea
                      className="input min-h-[72px] font-mono text-xs"
                      value={draft.backgroundGradient}
                      onChange={(event) => updateDraft(slide.id, "backgroundGradient", event.target.value)}
                    />
                  </label>

                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(event) => updateDraft(slide.id, "isActive", event.target.checked)}
                    />
                    Активен на сайте
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={() => saveMutation.mutate({ id: slide.id, draft })}
                      disabled={saveMutation.isPending}
                    >
                      Сохранить
                    </button>
                    <label className="btn-secondary cursor-pointer">
                      Загрузить фон
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) uploadMutation.mutate({ id: slide.id, file });
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => deleteBackgroundMutation.mutate(slide.id)}
                      disabled={!draft.backgroundImageUrl || deleteBackgroundMutation.isPending}
                    >
                      Удалить фон
                    </button>
                    <button className="btn-secondary text-rose-600" type="button" onClick={() => removeSlide(slide.id)} disabled={deleteMutation.isPending}>
                      Удалить
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-200 bg-slate-950 p-4 dark:border-slate-800 lg:border-l lg:border-t-0">
                  <div
                    className="relative flex min-h-[320px] overflow-hidden rounded-3xl border border-white/10 p-7 text-white shadow-2xl"
                    style={{
                      background: previewBackground(draft),
                      color: draft.textColor || "#ffffff",
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-black/5 via-black/20 to-black/60" />
                    <div className="relative z-10 mt-auto max-w-[92%]">
                      {draft.badge ? (
                        <div className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white/80">
                          {draft.badge}
                        </div>
                      ) : null}
                      <h3 className="text-3xl font-black tracking-[-0.04em]">{draft.title || "Заголовок баннера"}</h3>
                      <p className="mt-3 text-sm leading-6 text-white/78">{draft.description || "Текст баннера будет здесь."}</p>
                      {draft.buttonText ? (
                        <div className="mt-6 inline-flex rounded-full bg-white px-5 py-2 text-sm font-extrabold text-slate-950 shadow-lg">
                          {draft.buttonText}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 break-all text-xs text-slate-400">
                    Фон: {draft.backgroundImageUrl || "градиент без картинки"}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {!slidesQuery.isLoading && !slides.length ? (
        <section className="card p-5 text-sm text-slate-500">Баннеров пока нет. Нажмите “Добавить баннер”, чтобы создать первый слайд.</section>
      ) : null}
    </div>
  );
}
