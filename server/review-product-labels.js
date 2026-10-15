"use strict";

function reviewProductLabel(value) {
  const original = String(value || "").trim();
  const name = original.toLowerCase();
  if (/codex/.test(name)) {
    const credits = name.match(/\b(250|500|1000)\s*(?:кредит|credits)/i);
    return credits ? `Codex — ${credits[1]} кредитов` : "Кредиты Codex";
  }
  if (/claude|клауд/.test(name) && /верификац|verification|\bkyc\b|\bcvp\b/.test(name)) {
    const kind = name.match(/\b(kyc|cvp)\b/i);
    return "Верификация Claude" + (kind ? ` — ${kind[1].toUpperCase()}` : "");
  }
  if (/чатгпт|chatgpt|cgpt/.test(name)) {
    const plan = /pro\s*20\s*[xх]|про\s*20/.test(name) ? "Pro 20x"
      : /pro\s*5\s*[xх]|про\s*5/.test(name) ? "Pro 5x"
      : /плюс|plus/.test(name) ? "Plus"
      : /\bgo\b|(?:^|\s|\\)го(?:\s|$)/.test(name) ? "Go" : "";
    return plan ? `ChatGPT ${plan}` + (/1\s*месяц|1\s*month/.test(name) ? " — 1 месяц" : "") : "Подписка ChatGPT";
  }
  if (/супергрок|supergrok/.test(name)) return "SuperGrok — 1 месяц";
  const category = original.match(/^(Claude|Grok|Gemini|Perplexity),\s*[\d\s.,]+\s*₽$/i);
  if (category) return `Подписка ${category[1]}`;
  return original || "Цифровая подписка";
}

module.exports = { reviewProductLabel };
