import { normalizeActivationSiteUrl } from "../../common/utils/activation-site";
import type { ActivationRecord } from "./activation.store";

/** Only the paid website flow may hand an untouched order to the card worker. */
export function resolveExternalCodexOwner(input: {
  source: unknown;
  productKey: unknown;
  activationSiteUrl: unknown;
  accountPlan?: unknown;
  record?: ActivationRecord | null;
}) {
  const key = String(input.productKey || "").trim().toLowerCase();
  const match = /^codex-(250|500|1000)$/.exec(key);
  const pro = /^chatgpt-pro-(5|20|25)x-1$/.exec(key);
  const go = key === "chatgpt-go-1";
  const plus = key === "chatgpt-plus-1";
  if (input.source !== "site" || (!match && !pro && !go && !plus)) return null;
  const record = input.record;
  if (record?.cdk || record?.taskId || Number(record?.attempts || 0) > 0) return null;
  if (plus && (record?.reservedCandidates?.length ||
      (String(input.accountPlan || "").trim().toLowerCase() !== "free" &&
       record?.externalFulfillmentOwner !== "pulse-siteplus-v1" && record?.lastProviderPayload?.source !== "pulse-siteplus-v1"))) return null;
  const owner = plus ? "pulse-siteplus-v1" : go ? "pulse-sitego-v1" : pro ? (pro[1] === "25" ? "pulse-sitepro500-v1" : `pulse-sitepro${pro[1]}x-v1`) : `pulse-site${match![1]}-v1`;
  // Preserve existing persistent owners for reconciliation. New subscriptions
  // select their route only after session planType is known; credits never
  // enter Zovo, even if an old catalog selection still names that provider.
  if (record?.externalFulfillmentOwner === owner || record?.lastProviderPayload?.source === owner) return owner;
  if (match) return null;
  if (String(input.accountPlan || "").trim().toLowerCase() !== "free") return null;
  if (plus || go || pro || normalizeActivationSiteUrl(input.activationSiteUrl) === "https://zovocard.com" ||
      record?.externalFulfillmentOwner === owner || record?.lastProviderPayload?.source === owner) return owner;
  return null;
}
