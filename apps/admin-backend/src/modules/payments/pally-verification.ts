import { env } from "../../config/env";
import { AppError } from "../../common/errors/app-error";

type VerificationInput = {
  paymentRef: string;
  orderId: string;
  expectedAmount: number;
  expectedCurrency: string;
  reportedAmount?: number;
};

function cents(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

async function readPally(path: string, id: string) {
  if (!env.PALLY_API_TOKEN || !id) throw new AppError("Pally verification is not configured", 503);
  const url = new URL(path, env.PALLY_API_BASE_URL);
  url.searchParams.set("id", id);
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", Authorization: `Bearer ${env.PALLY_API_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new AppError("Pally verification failed", 409);
  return response.json();
}

// Pally's status amount may include a payer surcharge. Only its authenticated
// payment resource's bill_amount proves the original price in that case.
export async function verifyPallyPaidBill(input: VerificationInput) {
  const bill = await readPally("/api/v1/bill/status", input.paymentRef);
  const expected = cents(input.expectedAmount);
  const gross = cents(bill.amount);
  if (bill.success !== true || bill.id !== input.paymentRef || bill.order_id !== input.orderId ||
      bill.status !== "SUCCESS" || expected === null || gross === null || gross < expected ||
      String(bill.currency_in || "").toUpperCase() !== input.expectedCurrency.toUpperCase()) {
    throw new AppError("Pally bill does not match the order", 409);
  }
  if (gross !== expected) {
    const payments = await readPally("/api/v1/bill/payments", input.paymentRef);
    const entries = payments.data;
    if (payments.success !== true || !Array.isArray(entries) || payments.links?.next) {
      throw new AppError("Pally payment details are incomplete", 409);
    }
    const succeeded = entries.filter((entry: any) => entry.status === "SUCCESS");
    const payment = succeeded[0];
    if (succeeded.length !== 1 || payment.bill_id !== input.paymentRef || payment.bill_order_id !== input.orderId ||
        cents(payment.bill_amount) !== expected || cents(payment.amount) !== gross ||
        cents(payment.refunded_amount) !== 0 ||
        String(payment.currency_in || "").toUpperCase() !== input.expectedCurrency.toUpperCase()) {
      throw new AppError("Pally payment amount does not match the order", 409);
    }
  }
  if (input.reportedAmount !== undefined &&
      cents(input.reportedAmount) !== expected && cents(input.reportedAmount) !== gross) {
    throw new AppError("Webhook amount mismatch", 409);
  }
  return { amount: input.expectedAmount, chargedAmount: gross / 100, currency: input.expectedCurrency, status: "success" as const };
}
