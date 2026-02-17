export function money(value: number, currency = "RUB") {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeCurrency = String(currency || "RUB").toUpperCase();

  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch {
    return `${safeValue.toLocaleString("ru-RU")} RUB`;
  }
}

export function fmtDate(value: string) {
  return new Date(value).toLocaleString();
}
