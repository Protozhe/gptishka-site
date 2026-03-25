export default function slugify(value: string) {
  const normalized = String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 120);

  return normalized || "product";
}
