import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { showcaseService } from "./showcase.service";

function actor(req: Request) {
  return {
    userId: req.auth?.userId,
    ip: req.requestMeta?.ip,
    userAgent: req.requestMeta?.userAgent,
  };
}

export const getProductVisual = asyncHandler(async (req: Request, res: Response) => {
  const data = await showcaseService.getProductVisual(String(req.params.id || ""));
  res.json(data);
});

export const upsertProductVisual = asyncHandler(async (req: Request, res: Response) => {
  const data = await showcaseService.upsertProductVisual(String(req.params.id || ""), req.body, actor(req));
  res.json(data);
});

export const uploadProductVisualImage = asyncHandler(async (req: Request, res: Response) => {
  const data = await showcaseService.uploadProductVisualImage(String(req.params.id || ""), req.file as Express.Multer.File, actor(req));
  res.status(201).json(data);
});

export const deleteProductVisualImage = asyncHandler(async (req: Request, res: Response) => {
  const data = await showcaseService.deleteProductVisualImage(String(req.params.id || ""), actor(req));
  res.json(data);
});

export const uploadProductVisualHoverImage = asyncHandler(async (req: Request, res: Response) => {
  const data = await showcaseService.uploadProductVisualHoverImage(String(req.params.id || ""), req.file as Express.Multer.File, actor(req));
  res.status(201).json(data);
});

export const deleteProductVisualHoverImage = asyncHandler(async (req: Request, res: Response) => {
  const data = await showcaseService.deleteProductVisualHoverImage(String(req.params.id || ""), actor(req));
  res.json(data);
});

export const listShowcaseSections = asyncHandler(async (_req: Request, res: Response) => {
  const items = await showcaseService.listSections();
  res.json({ items });
});

export const createShowcaseSection = asyncHandler(async (req: Request, res: Response) => {
  const item = await showcaseService.createSection(req.body, actor(req));
  res.status(201).json(item);
});

export const updateShowcaseSection = asyncHandler(async (req: Request, res: Response) => {
  const item = await showcaseService.updateSection(String(req.params.id || ""), req.body, actor(req));
  res.json(item);
});

export const deleteShowcaseSection = asyncHandler(async (req: Request, res: Response) => {
  await showcaseService.removeSection(String(req.params.id || ""), actor(req));
  res.status(204).send();
});

export const addShowcasePlacement = asyncHandler(async (req: Request, res: Response) => {
  const item = await showcaseService.addPlacement(String(req.params.id || ""), req.body, actor(req));
  res.status(201).json(item);
});

export const updateShowcasePlacement = asyncHandler(async (req: Request, res: Response) => {
  const item = await showcaseService.updatePlacement(String(req.params.id || ""), req.body, actor(req));
  res.json(item);
});

export const deleteShowcasePlacement = asyncHandler(async (req: Request, res: Response) => {
  await showcaseService.removePlacement(String(req.params.id || ""), actor(req));
  res.status(204).send();
});
