import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("apps/admin-ui/src/pages/ProductsPage.tsx", "utf8");

assert.ok(source.includes('type ProductSortMode = "product-duration" | "title" | "price" | "newest";'));
assert.ok(source.includes('const [productSortMode, setProductSortMode] = useState<ProductSortMode>("product-duration");'));
assert.ok(source.includes('function getProductDurationLabel(item: Product): string'));
assert.ok(source.includes('function getProductDurationSortScore(item: Product): number'));
assert.ok(source.includes('function getProductFamilySortKey(item: Product): string'));
assert.ok(source.includes('<option value="product-duration">По товару и сроку</option>'));
assert.ok(source.includes('<div className="text-sm font-semibold text-slate-900 dark:text-white">Срок товара</div>'));
assert.ok(source.includes('<th className="px-4 py-3">Срок</th>'));
assert.ok(source.includes('{sortedProducts.map((item: Product) => {'));

console.log("Admin product duration field and sorting verified.");
