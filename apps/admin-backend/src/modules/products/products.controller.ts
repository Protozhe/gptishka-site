import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { deliveryTypeToMethod, resolveProductDeliveryType } from "../../common/utils/product-delivery";
import { productsService } from "./products.service";
import { saveProductImage } from "../files/files.service";

function actor(req: Request) {
  return {
    userId: req.auth?.userId,
    ip: req.requestMeta?.ip,
    userAgent: req.requestMeta?.userAgent,
  };
}

function withDeliveryType<T extends { tags?: string[] }>(item: T) {
  const deliveryType = resolveProductDeliveryType(item?.tags);
  return {
    ...item,
    deliveryType,
    deliveryMethod: deliveryTypeToMethod(deliveryType),
  };
}

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, ...filters } = req.query as any;
  const data = await productsService.list({ page, limit, ...filters });

  res.json({
    items: (data.items || []).map((item: any) => withDeliveryType(item)),
    total: data.total,
    page,
    limit,
    totalPages: Math.ceil(data.total / limit),
  });
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const item = await productsService.getById(String(req.params.id));
  res.json(withDeliveryType(item as any));
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const item = await productsService.create(req.body, actor(req));
  res.status(201).json(withDeliveryType(item as any));
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
  res.json(withDeliveryType(item as any));
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

export const listProductCredentials = asyncHandler(async (req: Request, res: Response) => {
  const productId = String(req.params.id || "").trim();
  const statusRaw = String(req.query.status || "").trim().toLowerCase();
  const status = statusRaw === "available" || statusRaw === "assigned" ? statusRaw : undefined;
  const q = String(req.query.q || "").trim() || undefined;
  const data = await productsService.listManualCredentials(productId, { status, q });
  res.json(data);
});

export const importProductCredentials = asyncHandler(async (req: Request, res: Response) => {
  const productId = String(req.params.id || "").trim();
  const body = req.body as { rows?: string[]; text?: string };
  const data = await productsService.importManualCredentials(productId, body, actor(req));
  res.status(201).json(data);
});

export const deleteProductCredential = asyncHandler(async (req: Request, res: Response) => {
  const productId = String(req.params.id || "").trim();
  const credentialId = String(req.params.credentialId || "").trim();
  await productsService.deleteManualCredential(productId, credentialId, actor(req));
  res.status(204).send();
});

export const translateRuToEn = asyncHandler(async (req: Request, res: Response) => {
  const title = String(req.body?.title || "");
  const description = String(req.body?.description || "");
  const translated = await productsService.translateRuToEn(title, description);
  res.json(translated);
});
