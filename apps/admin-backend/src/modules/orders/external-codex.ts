import { normalizeActivationSiteUrl } from "../../common/utils/activation-site";
import type { ActivationRecord } from "./activation.store";

/** Only the paid website flow may hand an untouched order to the card worker. */
export function resolveExternalCodexOwner(input: {
  source: unknown;
  productKey: unknown;
  activationSiteUrl: unknown;
  record?: ActivationRecord | null;
}) {
  const match = /^codex-(250|1000)$/.exec(String(input.productKey || "").trim().toLowerCase());
  if (input.source !== "site" || !match) return null;
  const record = input.record;
  if (record?.cdk || record?.taskId || Number(record?.attempts || 0) > 0) return null;
  const owner = `pulse-site${match[1]}-v1`;
  if (normalizeActivationSiteUrl(input.activationSiteUrl) === "https://zovocard.com" ||
      record?.externalFulfillmentOwner === owner || record?.lastProviderPayload?.source === owner) return owner;
  return null;
}
