export type ActivationPoolCounts = { unused: number; used: number; reserved: number; archived: number; total: number };
export type ActivationInventory = Record<string, Record<string, ActivationPoolCounts>>;

const IOS_SITE = "https://vip.sxzfd.com";
const AISOU_SITE = "https://aiee.fun";
const AIBUY_SITE = "https://aichongzhi.fun";

export function normalizeInventorySite(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.search = "";
    const site = url.toString().replace(/\/+$/, "");
    return site === "https://9977ai.vip/go.php" ? IOS_SITE : site;
  } catch {
    return "";
  }
}

export function activationPoolLabel(productKey: string, siteUrl: string) {
  const site = normalizeInventorySite(siteUrl);
  if (productKey === "chatgpt-plus-1" && site === IOS_SITE) return { title: "iOS · действующая подписка", hint: "Go / Plus / Pro Light / Pro · ключи IOS-" };
  if (productKey === "chatgpt-plus-1" && site === AISOU_SITE) return { title: "Free · без подписки", hint: "AIEE · ключи GPLUS-" };
  if (site === AISOU_SITE) return { title: "AISOU / AIEE", hint: site };
  if (site === AIBUY_SITE) return { title: "AI-BUY", hint: site };
  if (site === IOS_SITE) return { title: "iOS", hint: site };
  if (!site && productKey.endsWith("-sdk5")) return { title: "SDK · Claude", hint: "Активация по токену Claude" };
  if (!site && productKey.endsWith("-sdk4")) return { title: "SDK · Grok", hint: "Активация по токену Grok" };
  if (!site && productKey === "gemini-pro-18") return { title: "Ссылки Gemini", hint: "Одна ссылка на один заказ" };
  return site ? { title: site.replace(/^https?:\/\//, ""), hint: site } : { title: "Способ не указан", hint: "Проверьте привязку этих ключей к сайту активации" };
}

export function activationPools(productKey: string, inventory: ActivationInventory, expectedSite = "") {
  const stored = inventory[productKey] || {};
  const knownSites = productKey === "chatgpt-plus-1" ? [IOS_SITE, AISOU_SITE]
    : /^codex-(250|500|1000)$/.test(productKey) ? [AISOU_SITE, AIBUY_SITE]
    : normalizeInventorySite(expectedSite) ? [normalizeInventorySite(expectedSite)] : [];
  const sites = [...new Set([...knownSites, ...Object.keys(stored)])];
  return sites.map((siteUrl) => ({
    siteUrl,
    ...activationPoolLabel(productKey, siteUrl),
    ...(stored[siteUrl] || { unused: 0, used: 0, reserved: 0, archived: 0, total: 0 }),
  }));
}

export function CdkStockBreakdown({ productKey, inventory, expectedSite, compact = false }: {
  productKey: string;
  inventory?: ActivationInventory;
  expectedSite?: string;
  compact?: boolean;
}) {
  if (!inventory) return null;
  const pools = activationPools(productKey, inventory, expectedSite);
  if (!pools.length) return null;
  if (compact) return (
    <div className="mt-2 flex min-w-[220px] flex-col items-start gap-1 text-left text-xs font-medium">
      {pools.map((pool) => (
        <span key={pool.siteUrl} title={pool.hint} className={`rounded-lg px-2 py-1 ${pool.unused === 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : pool.unused <= 3 ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
          {pool.title}: <b>{pool.unused}</b>{pool.unused === 0 ? " · нет ключей" : ""}
        </span>
      ))}
    </div>
  );
  return (
    <section className="space-y-2" aria-label="Запас по способам активации">
      <div className="text-sm font-semibold">Запас по способам активации</div>
      <p className="text-xs text-slate-500">Полный остаток, без учёта поиска. Резерв, использованные и архив не входят в свободный запас.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {pools.map((pool) => (
          <div key={pool.siteUrl} className={`rounded-xl border p-3 ${pool.unused === 0 ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30" : pool.unused <= 3 ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"}`}>
            <div className="font-semibold">{pool.title}</div>
            <div className="mt-1 text-lg font-bold">Свободно: {pool.unused}{pool.unused === 0 ? " · нет ключей" : pool.unused <= 3 ? " · мало" : ""}</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">В резерве: {pool.reserved} · Использовано: {pool.used} · Архив: {pool.archived}</div>
            <div className="mt-1 break-all text-xs text-slate-500">{pool.hint}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
