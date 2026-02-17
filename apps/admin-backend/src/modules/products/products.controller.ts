import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { productsService } from "./products.service";
import { saveProductImage } from "../files/files.service";

function actor(req: Request) {
  return {
    userId: req.auth?.userId,
    ip: req.requestMeta?.ip,
    userAgent: req.requestMeta?.userAgent,
  };
}

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, ...filters } = req.query as any;
  const data = await productsService.list({ page, limit, ...filters });

  res.json({
    items: data.items,
    total: data.total,
    page,
    limit,
    totalPages: Math.ceil(data.total / limit),
  });
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const item = await productsService.getById(String(req.params.id));
  res.json(item);
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const item = await productsService.create(req.body, actor(req));
  res.status(201).json(item);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const role = req.auth?.role;

  if (role === "MANAGER") {
    const keys = Object.keys(req.body || {});
    const allowed = ["stock"];
    const hasForbidden = keys.some((key) => !allowed.includes(key));

    if (hasForbidden) {
      throw new AppError("Managers can only update product stock", 403);
    }
  }

  const item = await productsService.update(String(req.params.id), req.body, actor(req));
  res.json(item);
});

export const patchProductStatus = asyncHandler(async (req: Request, res: Response) => {
  const item = await productsService.patchStatus(String(req.params.id), req.body, actor(req));
  res.json(item);
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await productsService.remove(String(req.params.id), actor(req));
  res.status(204).send();
});

export const bulkPriceUpdate = asyncHandler(async (req: Request, res: Response) => {
  const data = await productsService.bulkPrice(req.body.productIds, req.body.mode, req.body.value, actor(req));
  res.json({ items: data });
});

export const uploadProductImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: "Image file is required" });
  }

  const url = saveProductImage(req.file);
  const image = await productsService.addImage(String(req.params.id), url, actor(req));
  res.status(201).json(image);
});
