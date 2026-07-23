import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const html = read("contact.html");
const contactCss = read("assets/css/contact-flat-page.css");
const globalCss = read("assets/css/gptishka-global-dark.css");
const homeCss = read("assets/css/home-wide-marketplace.css");
const homeBundle = read("assets/css/home-critical-bundle.min.css");

const checks = [
  ["contact page uses the shared refreshed header", html.includes('class="nav nav-shell"')],
  ["contact page uses the current dark logo", html.includes("/assets/img/logo-new-dark.png")],
  ["contact page has a dedicated flat-page scope", html.includes('class="contact-flat-body"')],
  ["contact page preserves Telegram contact", html.includes("https://t.me/aimarket_gpt")],
  ["contact page preserves VK contact", html.includes("https://vk.com/gptishka")],
  ["contact page preserves email contact", html.includes("mailto:support@gptishka.shop")],
  ["contact page loads its final stylesheet", html.includes("/assets/css/contact-flat-page.css")],
  ["contact background matches the Claude graphite palette", contactCss.includes("linear-gradient(180deg, #22262d 0%, #1d2127 46%, #181b20 100%)")],
  ["contact header is transparent before scroll", contactCss.includes("background: transparent !important;")],
  ["contact header uses the homepage width", contactCss.includes("width: min(calc(100% - clamp(28px, 7vw, 136px)), 1780px) !important;")],
  ["contact header shell cannot overflow its wrapper", contactCss.includes("max-width: 100% !important;")],
  ["contact logo uses the white homepage treatment", contactCss.includes("filter: brightness(0) invert(1) drop-shadow(0 12px 24px rgba(0, 0, 0, 0.32)) !important;")],
  ["contact channels have a responsive single-column layout", contactCss.includes(".contact-channel-list {\n    grid-template-columns: 1fr;")],
  ["global support meta uses dark text", globalCss.includes("color: #283443 !important;")],
  ["home support meta uses dark text", homeCss.includes("body.home-wide-body #gptishka-support-widget .support-widget__meta {\n  color: #283443 !important;")],
  ["rebuilt home bundle includes the support contrast fix", homeBundle.includes("body.home-wide-body #gptishka-support-widget .support-widget__meta{color:#283443 !important}")],
];

const failures = checks.filter(([, ok]) => !ok);
if (failures.length) {
  for (const [label] of failures) console.error(`FAIL: ${label}`);
  process.exit(1);
}

for (const [label] of checks) console.log(`PASS: ${label}`);
