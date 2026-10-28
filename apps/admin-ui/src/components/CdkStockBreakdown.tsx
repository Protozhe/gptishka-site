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

export function visibleActivationPools(productKey: string, inventory: ActivationInventory, expectedSite = "") {
  const pools = activationPools(productKey, inventory, expectedSite);
  const required = new Set(productKey === "chatgpt-plus-1" ? [IOS_SITE, AISOU_SITE]
    : /^codex-(250|500|1000)$/.test(productKey) ? [AISOU_SITE, AIBUY_SITE]
    : normalizeInventorySite(expectedSite) ? [normalizeInventorySite(expectedSite)] : []);
  if (/-sdk[45]$/.test(productKey) || productKey === "gemini-pro-18") required.add("");
  const current = pools.filter(pool => required.has(pool.siteUrl) || pool.unused > 0 || pool.reserved > 0);
  const historical = pools.filter(pool => !current.includes(pool));
  return { current, historical };
}

export function matchesActivationStockFilter(productKey: string | null, inventory: ActivationInventory | undefined, filter: "all" | "low" | "empty", expectedSite = "") {
  if (filter === "all") return true;
  if (!productKey || !inventory) return false;
  const { current } = visibleActivationPools(productKey, inventory, expectedSite);
  return filter === "low" ? current.some(pool => pool.unused > 0 && pool.unused <= 3)
    : current.length === 0 || current.some(pool => pool.unused === 0);
}

function stockTone(unused: number) {
  return unused === 0 ? "empty" : unused <= 3 ? "low" : "ready";
}

function poolDetails(pool: ReturnType<typeof activationPools>[number], historical = false) {
  return <div key={pool.siteUrl} className={`cdk-pool-detail ${historical ? "cdk-pool-historical" : `cdk-tone-${stockTone(pool.unused)}`}`}>
    <div className="cdk-pool-detail-heading"><strong>{pool.title}</strong><span><b>{pool.unused}</b> свободно</span></div>
    <div className="cdk-pool-detail-meta">В резерве: {pool.reserved} · Использовано: {pool.used} · Архив: {pool.archived}</div>
    <div className="cdk-pool-detail-hint">{pool.hint}</div>
  </div>;
}

export function CdkStockBreakdown({ productKey, inventory, expectedSite, compact = false }: {
  productKey: string;
  inventory?: ActivationInventory;
  expectedSite?: string;
  compact?: boolean;
}) {
  if (!inventory) return null;
  const { current, historical } = visibleActivationPools(productKey, inventory, expectedSite);
  if (compact) return (
    <div className="cdk-channel-list">
      {current.map((pool) => (
        <div key={pool.siteUrl} title={pool.hint} className={`cdk-channel cdk-tone-${stockTone(pool.unused)}`}>
          <span className="cdk-channel-name">{pool.title}</span>
          <span className="cdk-channel-stock"><b>{pool.unused}</b><small>{pool.unused === 0 ? "нет ключей" : pool.unused <= 3 ? "мало" : "в наличии"}</small></span>
        </div>
      ))}
      {!current.length ? <span className="cdk-stock-muted">Свободных ключей нет</span> : null}
      {historical.length ? <span className="cdk-stock-history-note">История каналов — в карточке товара</span> : null}
    </div>
  );
  return (
    <section className="cdk-stock-details" aria-label="Запас по способам активации">
      <div className="cdk-stock-details-title">Запас по способам активации</div>
      <p className="cdk-stock-details-caption">Только свободные ключи входят в запас. Резерв, использованные и архив показаны отдельно.</p>
      <div className="cdk-pool-details-grid">{current.map(pool => poolDetails(pool))}</div>
      {historical.length ? <details className="cdk-stock-history"><summary>Ранее использованные каналы · {historical.length}</summary>{historical.map(pool => poolDetails(pool, true))}</details> : null}
    </section>
  );
}
