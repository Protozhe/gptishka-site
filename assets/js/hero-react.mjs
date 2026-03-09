import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { motion } from "https://esm.sh/framer-motion@11.11.17";

const COPY = {
  ru: {
    top: "Подключение и продление",
    titles: ["ChatGPT", "За несколько минут", "Автоматически"],
    description:
      "Быстрая активация подписки без лишних действий. Удобно, безопасно и с поддержкой на каждом этапе.",
    cta: "Открыть тарифы",
  },
  en: {
    top: "Connect and renew",
    titles: ["ChatGPT", "In a few minutes", "Automatically"],
    description:
      "Fast subscription activation without extra steps. Convenient, secure, and supported at every stage.",
    cta: "View plans",
  },
};

function RotatingHero(props) {
  const e = React.createElement;
  const { copy, ctaHref, intervalMs } = props;
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(() => (Array.isArray(copy.titles) ? copy.titles.filter(Boolean) : []), [copy.titles]);

  useEffect(() => {
    if (titles.length < 2) return;
    const timeoutId = window.setTimeout(() => {
      if (titleNumber === titles.length - 1) {
        setTitleNumber(0);
      } else {
        setTitleNumber(titleNumber + 1);
      }
    }, intervalMs);

    return () => window.clearTimeout(timeoutId);
  }, [intervalMs, titleNumber, titles]);

  return e(
    "div",
    { className: "hero-react" },
    e(
      "div",
      { className: "hero-react__headline" },
      e(
        "h1",
        { className: "hero-react__title" },
        e("span", { className: "hero-react__top" }, copy.top),
        e(
          "span",
          { className: "hero-react__viewport", "aria-live": "polite" },
          titles.map((title, index) =>
            e(
              motion.span,
              {
                key: index,
                className: "hero-react__word",
                initial:
                  index === 0
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 110 },
                transition: { type: "spring", stiffness: 50 },
                animate:
                  titleNumber === index
                    ? {
                        y: 0,
                        opacity: 1,
                      }
                    : {
                        y: titleNumber > index ? -150 : 150,
                        opacity: 0,
                      },
              },
              title
            )
          )
        )
      ),
      e("p", { className: "hero-react__description" }, copy.description)
    ),
    e(
      "div",
      { className: "hero-react__actions" },
      e("a", { href: ctaHref, className: "btn hero-react__btn" }, copy.cta)
    )
  );
}

function getLang(node) {
  const raw = String(node.getAttribute("data-lang") || "").trim().toLowerCase();
  return raw.startsWith("en") ? "en" : "ru";
}

function buildCopy(node) {
  const lang = getLang(node);
  const base = COPY[lang];
  const wordsRaw = String(node.getAttribute("data-hero-words") || "").trim();
  const titles = wordsRaw
    ? wordsRaw
        .split("|")
        .map(v => String(v || "").trim())
        .filter(Boolean)
    : base.titles;

  return {
    top: String(node.getAttribute("data-hero-top") || base.top),
    titles: titles.length ? titles : base.titles,
    description: String(node.getAttribute("data-hero-description") || base.description),
    cta: String(node.getAttribute("data-hero-cta") || base.cta),
  };
}

function mountHero(node) {
  if (!node) return;
  const alreadyMounted = node.dataset.heroMounted === "1" && Boolean(node.querySelector(".hero-react"));
  if (alreadyMounted) return;

  const lang = getLang(node);
  const copy = buildCopy(node);
  const defaultHref = lang === "en" ? "/en/index.html#pricing" : "/index.html#pricing";
  const ctaHref = String(node.getAttribute("data-cta-href") || defaultHref).trim() || defaultHref;
  const rawInterval = Number(node.getAttribute("data-hero-interval") || 2000);
  const intervalMs = Number.isFinite(rawInterval) && rawInterval >= 1200 ? rawInterval : 2000;

  if (!node.__heroReactRoot) {
    node.__heroReactRoot = createRoot(node);
  }
  node.__heroReactRoot.render(React.createElement(RotatingHero, { copy, ctaHref, intervalMs }));

  const markMountedWhenReady = (attempt = 0) => {
    if (!node) return;
    if (node.querySelector(".hero-react")) {
      node.dataset.heroMounted = "1";
      return;
    }
    if (attempt >= 20) {
      node.dataset.heroMounted = "1";
      return;
    }
    window.requestAnimationFrame(() => markMountedWhenReady(attempt + 1));
  };

  markMountedWhenReady();

  if (node.dataset.heroObserverAttached !== "1" && typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => {
      const hasHeroTree = node.querySelector(".hero-react");
      if (hasHeroTree) return;
      mountHero(node);
    });

    observer.observe(node, { childList: true, subtree: true });
    node.__heroReactObserver = observer;
    node.dataset.heroObserverAttached = "1";
  }
}

function mountAllHeroes() {
  const nodes = Array.from(document.querySelectorAll("[data-hero-react-root]"));
  nodes.forEach(mountHero);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountAllHeroes, { once: true });
} else {
  mountAllHeroes();
}
