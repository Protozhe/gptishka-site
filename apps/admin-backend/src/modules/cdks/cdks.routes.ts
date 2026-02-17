import { Router } from "express";
import { z } from "zod";
import { requireAuth, allowRoles } from "../auth/auth.middleware";
import { validateBody, validateQuery } from "../../common/middleware/validation";
import { asyncHandler } from "../../common/http/async-handler";
import { cdkKeysStore } from "./cdk-keys.store";
import { licenseService } from "../../services/licenseService";

const listSchema = z.object({
  status: z.enum(["unused", "used"]).optional(),
  productKey: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const importSchema = z.object({
  productKey: z.string().default("chatgpt"),
  codes: z.array(z.string()).optional(),
  text: z.string().optional(),
});

function parseCodes(input: z.infer<typeof importSchema>) {
  const fromArray = Array.isArray(input.codes) ? input.codes : [];
  const fromText = String(input.text || "")
    .split(/\r?\n|,|;|\s+/)
    .map((v) => v.trim())
    .filter(Boolean);
  return [...fromArray, ...fromText];
}

export const cdkKeysRouter = Router();

cdkKeysRouter.use(requireAuth, allowRoles(["OWNER", "ADMIN", "MANAGER"]));

cdkKeysRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    // New health-like endpoint: aggregated counts by status.
    // Does not return key values.
    res.json(await licenseService.stats());
  })
);

cdkKeysRouter.get(
  "/",
  validateQuery(listSchema),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof listSchema>;
    res.json(await cdkKeysStore.list(q));
  })
);

cdkKeysRouter.post(
  "/import",
  validateBody(importSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof importSchema>;
    const result = await cdkKeysStore.importCodes(
      {
        productKey: body.productKey,
        codes: parseCodes(body),
      },
      { userId: req.auth?.userId }
    );
    res.status(201).json(result);
  })
);

cdkKeysRouter.post(
  "/:id/return-unused",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || "");
    const result = await cdkKeysStore.returnToUnused(id, { userId: req.auth?.userId });
    if (!result) {
      return res.status(404).json({ message: "CDK key not found" });
    }
    res.json(result);
  })
);

cdkKeysRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || "");
    const result = await cdkKeysStore.removeUnused(id, { userId: req.auth?.userId });
    if (!result.ok) {
      if (result.reason === "not_unused") {
        return res.status(409).json({ message: "Only unused CDK keys can be deleted" });
      }
      return res.status(404).json({ message: "CDK key not found" });
    }
    res.status(204).send();
  })
);
