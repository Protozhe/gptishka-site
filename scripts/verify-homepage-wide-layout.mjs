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

assert(css.includes(".home-wide-page"), "wide CSS must be scoped to .home-wide-page");
assert(css.includes("--home-wide-max"), "wide CSS must define --home-wide-max");
assert(css.includes(".home-wide-page .pricing"), "wide CSS must style homepage pricing only");
assert(css.includes("@media (max-width: 760px)"), "wide CSS must include mobile rules");

if (process.exitCode) process.exit(process.exitCode);
console.log("homepage wide layout check passed");
