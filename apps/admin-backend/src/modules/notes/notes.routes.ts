import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/http/async-handler";
import { validateBody } from "../../common/middleware/validation";
import { noteCreateRateLimit, noteReadRateLimit, noteWriteRateLimit } from "../../common/security/rate-limit";
import { notesService } from "./notes.service";

const noteBodySchema = z.object({
  title: z.string().max(160).optional().default(""),
  content: z.string().max(100_000).optional().default(""),
});

function editTokenFromRequest(req: any) {
  return String(req.get("X-Note-Edit-Token") || "").trim();
}

export const notesPublicRouter = Router();

notesPublicRouter.post(
  "/notes",
  noteCreateRateLimit,
  validateBody(noteBodySchema),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(await notesService.create(req.body));
  })
);

notesPublicRouter.get(
  "/notes/:slug",
  noteReadRateLimit,
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await notesService.read(req.params.slug, editTokenFromRequest(req)));
  })
);

notesPublicRouter.put(
  "/notes/:slug",
  noteWriteRateLimit,
  validateBody(noteBodySchema),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await notesService.update(req.params.slug, editTokenFromRequest(req), req.body));
  })
);

notesPublicRouter.delete(
  "/notes/:slug",
  noteWriteRateLimit,
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await notesService.remove(req.params.slug, editTokenFromRequest(req)));
  })
);
