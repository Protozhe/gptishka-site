import fs from "node:fs";

const page = fs.readFileSync("apps/admin-ui/src/pages/ShowcasePage.tsx", "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`showcase product visual editor check failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(page.includes("function buildDefaultVisualConfig("), "showcase page must own default product visual config");
assert(page.includes("function mergeVisualConfig("), "showcase page must merge saved product visual config");
assert(page.includes("function ProductVisualPreview("), "showcase page must show product visual preview");
assert(page.includes("selectedVisualProductId"), "showcase page must track selected product");
assert(page.includes("saveProductVisual"), "showcase page must save product visual config");
assert(page.includes('api.put(`/products/${id}/visual`, payload)'), "showcase page must use existing product visual API");
assert(page.includes('api.post(`/products/${id}/visual/image`'), "showcase page must upload main product visual image");
assert(page.includes('api.post(`/products/${id}/visual/hover-image`'), "showcase page must upload hover product visual image");
assert(page.includes("Визуал карточки на витрине"), "showcase page must expose product visual editor block");
assert(page.includes("Сохранить визуал карточки"), "showcase page must expose visual-only save action");

if (process.exitCode) process.exit(process.exitCode);
console.log("showcase product visual editor check passed");
