import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const cssPath = "assets/css/home-wide-marketplace.css";
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";

function assert(condition, message) {
  if (!condition) {
    console.error(`homepage wide layout check failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(html.includes('id="siteTicker"'), "activation ticker must remain in index.html");
assert(html.includes('id="pricing"'), "pricing anchor #pricing must remain");
assert(html.includes('id="pricingGrid"'), "pricing grid #pricingGrid must remain");
assert(html.includes('class="page home-wide-page"'), "main must opt into homepage wide layout");
assert(html.includes("/assets/css/home-wide-marketplace.css?v="), "homepage wide CSS must be linked with cache bust");
assert(html.includes('class="hero home-hero-wide"'), "hero must use wide homepage class");
assert(html.includes('class="home-hero-wide__panel"'), "hero must include right-side service panel");
assert(html.includes('class="home-final-cta"'), "homepage must include final CTA section");
assert(!html.includes("средства замораживаются"), "homepage copy must not use alarming frozen-funds wording");
assert(html.includes("ChatGPT Plus, Claude PRO и Grok в России за 2–5 минут"), "homepage hero must use the broad marketplace offer");
assert(html.includes("Оформляйте подписки на AI-сервисы и VPN: выбирайте тариф, оплачивайте удобным способом, а GPTishka помогает довести подключение до результата."), "homepage hero must use the approved marketplace subtitle");
assert(!html.includes('data-hero-top="Подписки на"'), "homepage hero must not rotate narrow product-only headlines");
assert(!html.includes("Каталог GPTishka"), "right hero panel must not duplicate the product catalog");
assert(!html.includes('class="home-hero-panel__grid"'), "right hero panel must not render duplicate product tiles");
assert(html.includes("Как проходит подключение"), "right hero panel must explain the purchase flow");
assert(html.includes('class="home-hero-process"'), "right hero panel must use the process layout");
assert(!html.includes("SID:"), "production homepage must not render SID debug text");
assert(html.includes("home-wide-hash-sync"), "homepage must include scoped hash sync for #pricing/#how/#faq anchors");
assert(html.includes("data-home-menu-toggle"), "homepage must include a scoped mobile menu toggle");

assert(css.includes(".home-wide-page"), "wide CSS must be scoped to .home-wide-page");
assert(css.includes("--home-wide-max"), "wide CSS must define --home-wide-max");
assert(css.includes(".home-wide-page .pricing"), "wide CSS must style homepage pricing only");
assert(css.includes("@media (max-width: 760px)"), "wide CSS must include mobile rules");
assert(css.includes(".home-wide-page #pricing"), "wide CSS must set a scoped #pricing scroll offset");
assert(css.includes("gap: 14px"), "hero CTA group must keep buttons close together");
assert(css.includes("grid-template-columns: repeat(2, minmax(0, max-content))"), "hero trust badges must use a stable desktop grid");
assert(css.includes(".home-hero-process"), "wide CSS must style the process panel");
assert(css.includes(".home-wide-body #gptishka-support-widget.support-widget"), "support widget must have homepage-specific premium styling");
assert(css.includes('content: "Поддержка"'), "support widget mascot must be labeled as support");
assert(css.includes(".home-mobile-menu-toggle"), "wide CSS must style the homepage mobile menu toggle");
assert(css.includes(".home-wide-body.home-nav-open header nav"), "wide CSS must support the mobile nav drawer state");
assert(!css.includes("SID:"), "production homepage CSS must not render SID debug text");

if (process.exitCode) process.exit(process.exitCode);
console.log("homepage wide layout check passed");
