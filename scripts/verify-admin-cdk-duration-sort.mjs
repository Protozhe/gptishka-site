import assert from "node:assert/strict";
import fs from "node:fs";

const editor = fs.readFileSync("apps/admin-ui/src/components/ProductDurationEditor.tsx", "utf8");
const cdkPage = fs.readFileSync("apps/admin-ui/src/pages/CdkKeysPage.tsx", "utf8");
const telegramPage = fs.readFileSync("apps/admin-ui/src/pages/TelegramCdkPage.tsx", "utf8");

assert.ok(editor.includes("function getProductFamily(product: DurationProduct): string"));
assert.ok(editor.includes("export function compareProductsByFamilyAndDuration"));
assert.ok(editor.includes("export function getProductDurationLabel"));
assert.ok(editor.includes("Срок товара для CDK / SDK"));
assert.ok(editor.includes("api.put(`/products/${product.id}`"));

for (const [name, source] of [
  ["CDK / SDK", cdkPage],
  ["Telegram CDK", telegramPage],
]) {
  assert.ok(source.includes(".sort(compareProductsByFamilyAndDuration)"), `${name}: product-duration sorting is missing`);
  assert.ok(source.includes('<th className="px-4 py-3">Срок</th>'), `${name}: duration column is missing`);
  assert.ok(source.includes("<ProductDurationEditor product={product} />"), `${name}: duration editor is missing`);
  assert.ok(source.includes("showDurationEditor={false}"), `${name}: legacy pools must not edit product duration`);
}

assert.ok(telegramPage.includes('limit: 100, isArchived: false, sortBy: "title", sortDir: "asc"'));

console.log("Admin CDK / SDK product duration sorting and editor verified.");
