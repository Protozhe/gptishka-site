import fs from "node:fs";

const pages = new Map([
  ["oferta.html", { title: "Публичная оферта", minHeadings: 14 }],
  ["politika.html", { title: "Политика конфиденциальности", minHeadings: 12 }],
  ["refund.html", { title: "Условия возврата", minHeadings: 7 }],
  ["about.html", { title: "О сервисе", minHeadings: 0 }],
  ["guarantee.html", { title: "Гарантия", minHeadings: 4 }],
]);

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

for (const [file, expected] of pages) {
  const html = fs.readFileSync(file, "utf8");
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1].replace(/<[^>]+>/g, "").trim();
  const h2Count = (html.match(/<h2\b/gi) || []).length;

  check(html.includes('<body class="information-flat-body">'), `${file}: missing shared body scope`);
  check(html.includes('class="nav nav-shell"'), `${file}: missing refreshed header shell`);
  check(html.includes("/assets/img/logo-new-dark.png"), `${file}: missing current logo asset`);
  check(!html.includes('src="/assets/img/logo.png"'), `${file}: legacy logo is still used`);
  check(html.includes('class="page information-page"'), `${file}: missing information page scope`);
  check(html.includes('class="information-page__back"'), `${file}: missing back link`);
  check(html.includes("/assets/css/information-flat-page.css"), `${file}: missing shared stylesheet`);
  check(html.includes('class="footer-links-primary"'), `${file}: missing primary footer row`);
  check(html.includes('class="footer-links-secondary"'), `${file}: missing secondary footer row`);
  check(html.includes('href="/contact.html"'), `${file}: missing contact footer link`);
  check(h1 === expected.title, `${file}: unexpected h1 "${h1}"`);
  check(h2Count >= expected.minHeadings, `${file}: expected at least ${expected.minHeadings} h2, found ${h2Count}`);
}

const css = fs.readFileSync("assets/css/information-flat-page.css", "utf8");
check(css.includes("linear-gradient(180deg, #22262d 0%, #1d2127 46%, #181b20 100%)"), "shared CSS: graphite background missing");
check(css.includes("grid-template-columns: auto auto minmax(140px, 1fr) auto !important;"), "shared CSS: homepage header grid missing");
check(css.includes("filter: brightness(0) invert(1)"), "shared CSS: white logo treatment missing");
check(css.includes(":is(.container, .about, .policy-content, .grid, .block)"), "shared CSS: legacy surfaces are not normalized");
check(css.includes("background: transparent !important;"), "shared CSS: flat surfaces missing");
check(css.includes("hr + h2"), "shared CSS: long-form section rhythm missing");
check(css.includes("@media (max-width: 760px)"), "shared CSS: mobile layout missing");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log(`Information pages verified: ${pages.size}`);
