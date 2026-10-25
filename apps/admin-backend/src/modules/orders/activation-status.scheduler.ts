import { activationStore } from "./activation.store";
import { ordersService } from "./orders.service";
import { notifyPendingAisouFunds } from "../../services/aisou-procurement";

const POLL_INTERVAL_MS = 30_000;
const FIRST_POLL_DELAY_MS = 8_000;
const MAX_RECORDS_PER_CYCLE = 24;
const MAX_RECORD_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

function processingRecords() {
  const oldestAllowed = Date.now() - MAX_RECORD_AGE_MS;
  return activationStore
    .list()
    .filter((record) => {
      const status = String(record.status || "").toLowerCase();
      const verification = String(record.verificationState || "").toLowerCase();
      // A lost start response can leave a paid Codex order issued without a
      // task id. Reconcile via getActivationProof (query only), never resubmit.
      const unresolvedCodex =
        /^codex-(250|500|1000)$/.test(String(record.productKey || "")) &&
        status === "issued" &&
        verification !== "success" &&
        Boolean(record.clientTokenCiphertext) &&
        Number(record.tokenValidationAttempts || 0) > 0 &&
        Date.parse(String(record.issuedAt || "")) >= oldestAllowed;
      // A review alert after an uncertain submission must not end read-only
      // reconciliation. A later final success can still complete the order;
      // the durable task/attempt prevents any second activation submission.
      const unresolvedAibuy =
        record.activationSiteUrl === "https://aichongzhi.fun" &&
        /^(?:codex-(250|500|1000)|claude-pro)$/.test(String(record.productKey || "")) &&
        status !== "success" && verification !== "success" &&
        Boolean(record.cdk && record.taskId) && Number(record.attempts || 0) > 0 &&
        (record.lastProviderPayload?.submissionDiagnostics as any)?.phase === "submit_recharge" &&
        ["unused", "pending", "processing"].includes(String(record.lastProviderPayload?.recharge_status || "")) &&
        Date.parse(String(record.issuedAt || "")) >= oldestAllowed;
      if (status !== "processing" && verification !== "pending" && !unresolvedCodex && !unresolvedAibuy) return false;
      const updatedAt = Date.parse(String(record.updatedAt || ""));
      return !Number.isFinite(updatedAt) || updatedAt >= oldestAllowed;
    })
    .sort((left, right) => Date.parse(String(left.updatedAt || "")) - Date.parse(String(right.updatedAt || "")))
    .slice(0, MAX_RECORDS_PER_CYCLE);
}

async function runCycle() {
  // Deadline notices still tick while a previous supplier poll is taking time.
  void notifyPendingAisouFunds().catch(() => {});
  if (running) return;
  running = true;
  try {
    void ordersService.resumePendingAisouPurchases().catch(() => {});
    void ordersService.resumeClaudeZovoJobs().catch(() => {});
    for (const record of processingRecords()) {
      try {
        await ordersService.getActivationProof(record.orderId, { forceCheck: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[activation-monitor] status check failed order=${record.orderId}: ${message}`);
      }
    }
  } finally {
    running = false;
  }
}

export const activationStatusScheduler = {
  start() {
    if (timer) return;
    const first = setTimeout(() => {
      void runCycle();
    }, FIRST_POLL_DELAY_MS);
    first.unref();
    timer = setInterval(() => {
      void runCycle();
    }, POLL_INTERVAL_MS);
    timer.unref();
    process.stdout.write(`[activation-monitor] scheduler started interval=${POLL_INTERVAL_MS}ms\n`);
  },

  stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  },

  runNow: runCycle,
};
