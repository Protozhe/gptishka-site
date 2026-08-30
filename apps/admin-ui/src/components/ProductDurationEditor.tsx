import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export type DurationProduct = {
  id: string;
  title: string;
  description?: string;
  descriptionEn?: string;
};

const DURATION_LINE_RE = /^(?:[✓✔]\s*)?(?:срок|duration)\s*:/i;
const TITLE_DURATION_RE = /\b\d+\s*(?:д(?:ень|ня|ней)|недел(?:я|и|ь)|мес(?:яц|яца|яцев)?|год(?:а|ов)?|лет|days?|weeks?|months?|years?)(?=$|[\s.,;:()\-–—])/i;

function parseDescriptionDuration(value: string): string {
  const line = String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((item) => item.trim())
    .find((item) => DURATION_LINE_RE.test(item));
  return line?.replace(DURATION_LINE_RE, "").trim() || "";
}

function withDurationLine(description: string, duration: string, language: "ru" | "en"): string {
  const lines = String(description || "").replace(/\r/g, "").split("\n");
  const cleaned = lines.filter((line) => !DURATION_LINE_RE.test(line.trim())).join("\n").trim();
  const value = String(duration || "").trim();
  if (!value) return cleaned;
  const durationLine = `${language === "en" ? "Duration" : "Срок"}: ${value}`;
  return cleaned ? `${cleaned}\n${durationLine}` : durationLine;
}

export function getProductDurationLabel(product: DurationProduct): string {
  return (
    parseDescriptionDuration(product.description || "") ||
    String(product.title || "").match(TITLE_DURATION_RE)?.[0]?.trim() ||
    ""
  );
}

function getDurationSortScore(product: DurationProduct): number {
  const value = getProductDurationLabel(product).toLowerCase();
  const amount = Number(value.match(/\d+/)?.[0] || "");
  if (!Number.isFinite(amount) || amount <= 0) return Number.MAX_SAFE_INTEGER;
  if (/д(?:ень|ня|ней)|days?/.test(value)) return amount;
  if (/недел|weeks?/.test(value)) return amount * 7;
  if (/год|лет|years?/.test(value)) return amount * 365;
  if (/мес|months?/.test(value)) return amount * 30;
  return Number.MAX_SAFE_INTEGER;
}

function getProductFamily(product: DurationProduct): string {
  return String(product.title || "")
    .replace(TITLE_DURATION_RE, "")
    .replace(/\s+(?:на|for)\s*$/i, "")
    .replace(/[\s–—-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function compareProductsByFamilyAndDuration(a: DurationProduct, b: DurationProduct): number {
  const byProduct = getProductFamily(a).localeCompare(getProductFamily(b), "ru", {
    sensitivity: "base",
    numeric: true,
  });
  if (byProduct !== 0) return byProduct;
  const byDuration = getDurationSortScore(a) - getDurationSortScore(b);
  if (byDuration !== 0) return byDuration;
  return String(a.title || "").localeCompare(String(b.title || ""), "ru", { sensitivity: "base", numeric: true });
}

export function ProductDurationEditor({ product }: { product: DurationProduct }) {
  const queryClient = useQueryClient();
  const [durationRu, setDurationRu] = useState(getProductDurationLabel(product));
  const [durationEn, setDurationEn] = useState(
    parseDescriptionDuration(product.descriptionEn || "") || String(product.title || "").match(TITLE_DURATION_RE)?.[0]?.trim() || ""
  );
  const [message, setMessage] = useState("");

  const saveDuration = useMutation({
    mutationFn: async () => {
      const cleanRu = durationRu.trim();
      const cleanEn = durationEn.trim() || cleanRu;
      return api.put(`/products/${product.id}`, {
        description: withDurationLine(product.description || "", cleanRu, "ru"),
        descriptionEn: withDurationLine(product.descriptionEn || "", cleanEn, "en"),
      });
    },
    onSuccess: async () => {
      setMessage("Срок сохранён");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["tg-products"] });
    },
    onError: () => setMessage("Не удалось сохранить срок"),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    saveDuration.mutate();
  };

  return (
    <form className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 dark:border-cyan-900 dark:bg-cyan-950/30" onSubmit={onSubmit}>
      <div className="text-sm font-semibold">Срок товара для CDK / SDK</div>
      <p className="mt-1 text-xs text-slate-500">
        Срок отображается в таблице и определяет порядок товаров: 1 месяц → 3 месяца → 12 месяцев.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Срок (RU)</span>
          <input className="input" value={durationRu} onChange={(event) => setDurationRu(event.target.value)} placeholder="3 месяца" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Duration (EN)</span>
          <input className="input" value={durationEn} onChange={(event) => setDurationEn(event.target.value)} placeholder="3 months" />
        </label>
        <button className="btn-primary self-end" type="submit" disabled={saveDuration.isPending}>
          {saveDuration.isPending ? "Сохраняем..." : "Сохранить срок"}
        </button>
      </div>
      {message ? <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{message}</div> : null}
    </form>
  );
}
