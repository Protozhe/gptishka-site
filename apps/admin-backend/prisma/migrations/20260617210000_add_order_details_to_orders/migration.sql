ALTER TABLE "Order" ADD COLUMN "order_details" JSONB;

UPDATE "Order" AS o
SET "order_details" = latest."orderDetails"
FROM (
  SELECT DISTINCT ON (p."orderId")
    p."orderId",
    p."payload" -> 'orderDetails' AS "orderDetails"
  FROM "Payment" AS p
  WHERE jsonb_typeof(p."payload" -> 'orderDetails') = 'object'
  ORDER BY p."orderId", p."createdAt" DESC
) AS latest
WHERE o."id" = latest."orderId"
  AND o."order_details" IS NULL;
