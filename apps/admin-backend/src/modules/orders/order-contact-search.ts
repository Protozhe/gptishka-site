import type { Prisma } from "@prisma/client";

/** Search only checkout contact fields, never session tokens or arbitrary payment data. */
export function orderContactSearch(query: string): Prisma.OrderWhereInput[] {
  const value = query.trim().replace(/^https?:\/\/(?:t\.me|telegram\.me)\//i, "").replace(/^@+/, "").replace(/\/$/, "");
  if (!value) return [];
  const fields = ["telegram", "telegramUsername", "telegramUserId", "telegramId"];
  const filters: Prisma.OrderWhereInput[] = [];
  for (const field of fields) {
    const conditions: ({ string_contains: string; mode: "insensitive" } | { equals: number })[] = [
      { string_contains: value, mode: "insensitive" },
    ];
    // Older checkout forms may have saved numeric IDs as JSON numbers.
    if (/^[1-9]\d{3,15}$/.test(value) && Number.isSafeInteger(Number(value))) {
      conditions.push({ equals: Number(value) });
    }
    for (const condition of conditions) {
      filters.push({ orderDetails: { ...condition, path: ["contact", field] } });
      filters.push({ payments: { some: { payload: { ...condition, path: ["orderDetails", "contact", field] } } } });
    }
  }
  filters.push({ telegramUsername: { contains: value, mode: "insensitive" } });
  return filters;
}
