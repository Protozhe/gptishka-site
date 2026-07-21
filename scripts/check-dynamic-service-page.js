const { chromium } = require("playwright");

const url = process.argv[2] || "http://localhost:4000/chatgpt";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle" });

  const result = await page.evaluate(() => {
    const root = document.querySelector("[data-service-page]");
    const heroTitle = document.querySelector(".service-hero__content h1")?.textContent?.trim() || "";
    const plansGrid = document.querySelector("#servicePlansGrid");
    const buyButton = document.querySelector(".pay-now-btn, .buy-btn");
    return {
      servicePage: root?.getAttribute("data-service-page") || "",
      heroTitle,
      hasPlansGrid: Boolean(plansGrid),
      hasBuyButton: Boolean(buyButton),
      buyButtonText: buyButton?.textContent?.trim() || "",
    };
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.servicePage) throw new Error("Missing data-service-page");
  if (!result.heroTitle) throw new Error("Missing hero title");
  if (!result.hasPlansGrid) throw new Error("Missing servicePlansGrid");
  if (!result.hasBuyButton) throw new Error("Missing buy button");

  await browser.close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
