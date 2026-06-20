import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { servicePagesService } from "./service-pages.service";

function actor(req: Request) {
  return {
    userId: req.auth?.userId,
    ip: req.requestMeta?.ip,
    userAgent: req.requestMeta?.userAgent,
  };
}

export const listServicePages = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ items: await servicePagesService.list() });
});

export const getServicePage = asyncHandler(async (req: Request, res: Response) => {
  res.json(await servicePagesService.getById(String(req.params.id || "")));
});

export const createServicePage = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await servicePagesService.create(req.body, actor(req)));
});

export const updateServicePage = asyncHandler(async (req: Request, res: Response) => {
  res.json(await servicePagesService.update(String(req.params.id || ""), req.body, actor(req)));
});

export const patchServicePageStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json(await servicePagesService.patchStatus(String(req.params.id || ""), Boolean(req.body.isActive), actor(req)));
});

export const deleteServicePage = asyncHandler(async (req: Request, res: Response) => {
  await servicePagesService.remove(String(req.params.id || ""), actor(req));
  res.status(204).send();
});

export const addServicePagePlacement = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await servicePagesService.addPlacement(String(req.params.id || ""), req.body, actor(req)));
});

export const updateServicePagePlacement = asyncHandler(async (req: Request, res: Response) => {
  res.json(await servicePagesService.updatePlacement(String(req.params.id || ""), req.body, actor(req)));
});

export const deleteServicePagePlacement = asyncHandler(async (req: Request, res: Response) => {
  await servicePagesService.removePlacement(String(req.params.id || ""), actor(req));
  res.status(204).send();
});

export const getPublicServicePage = asyncHandler(async (req: Request, res: Response) => {
  const lang = String(req.query.lang || "ru").toLowerCase().startsWith("en") ? "en" : "ru";
  res.json(await servicePagesService.getPublicBySlug(String(req.params.slug || ""), lang));
});
