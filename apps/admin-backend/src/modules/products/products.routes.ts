import { Router } from "express";
import { validateBody, validateQuery } from "../../common/middleware/validation";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import {
  bulkPriceUpdate,
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  patchProductStatus,
  updateProduct,
  uploadProductImage,
} from "./products.controller";
import {
  bulkPriceSchema,
  createProductSchema,
  productQuerySchema,
  statusPatchSchema,
  updateProductSchema,
} from "./products.schemas";
import { imageUpload } from "../files/files.middleware";

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get("/", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateQuery(productQuerySchema), listProducts);
productsRouter.get("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), getProduct);
productsRouter.post("/", allowRoles(["OWNER", "ADMIN"]), validateBody(createProductSchema), createProduct);
productsRouter.put("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(updateProductSchema), updateProduct);
productsRouter.patch("/:id/status", allowRoles(["OWNER", "ADMIN"]), validateBody(statusPatchSchema), patchProductStatus);
productsRouter.patch("/bulk/price", allowRoles(["OWNER", "ADMIN"]), validateBody(bulkPriceSchema), bulkPriceUpdate);
productsRouter.post("/:id/images", allowRoles(["OWNER", "ADMIN"]), imageUpload.single("image"), uploadProductImage);
productsRouter.delete("/:id", allowRoles(["OWNER", "ADMIN"]), deleteProduct);
