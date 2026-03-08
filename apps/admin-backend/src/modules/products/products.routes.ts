import { Router } from "express";
import { validateBody, validateQuery } from "../../common/middleware/validation";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import {
  bulkPriceUpdate,
  createProduct,
  deleteProductCredential,
  deleteProduct,
  getProduct,
  importProductCredentials,
  listProductCredentials,
  listProducts,
  patchProductStatus,
  translateRuToEn,
  updateProduct,
  uploadProductImage,
} from "./products.controller";
import {
  bulkPriceSchema,
  createProductSchema,
  importProductCredentialsSchema,
  productCredentialsQuerySchema,
  productQuerySchema,
  statusPatchSchema,
  translateRuToEnSchema,
  updateProductSchema,
} from "./products.schemas";
import { imageUpload } from "../files/files.middleware";

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get("/", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateQuery(productQuerySchema), listProducts);
productsRouter.post("/translate/ru-en", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(translateRuToEnSchema), translateRuToEn);
productsRouter.get("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), getProduct);
productsRouter.post("/", allowRoles(["OWNER", "ADMIN"]), validateBody(createProductSchema), createProduct);
productsRouter.put("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(updateProductSchema), updateProduct);
productsRouter.patch("/:id/status", allowRoles(["OWNER", "ADMIN"]), validateBody(statusPatchSchema), patchProductStatus);
productsRouter.patch("/bulk/price", allowRoles(["OWNER", "ADMIN"]), validateBody(bulkPriceSchema), bulkPriceUpdate);
productsRouter.post("/:id/images", allowRoles(["OWNER", "ADMIN"]), imageUpload.single("image"), uploadProductImage);
productsRouter.get("/:id/credentials", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateQuery(productCredentialsQuerySchema), listProductCredentials);
productsRouter.post("/:id/credentials/import", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(importProductCredentialsSchema), importProductCredentials);
productsRouter.delete("/:id/credentials/:credentialId", allowRoles(["OWNER", "ADMIN", "MANAGER"]), deleteProductCredential);
productsRouter.delete("/:id", allowRoles(["OWNER", "ADMIN"]), deleteProduct);
