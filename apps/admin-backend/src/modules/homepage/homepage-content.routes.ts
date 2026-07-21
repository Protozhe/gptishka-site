import { Router } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { imageUpload } from "../files/files.middleware";
import { homepageContentService } from "./homepage-content.service";

export const homepageContentAdminRouter = Router();
export const homepageContentPublicRouter = Router();
export const homepageLegacyAdminRouter = Router();

homepageContentAdminRouter.use(requireAuth);
homepageLegacyAdminRouter.use(requireAuth);

homepageContentAdminRouter.get(
  "/",
  allowRoles(["OWNER", "ADMIN", "MANAGER"]),
  asyncHandler(async (_req, res) => {
    res.json(homepageContentService.getAll());
  })
);

homepageContentAdminRouter.put(
  "/",
  allowRoles(["OWNER", "ADMIN", "MANAGER"]),
  asyncHandler(async (req, res) => {
    res.json(homepageContentService.save(req.body));
  })
);

homepageContentAdminRouter.post(
  "/image",
  allowRoles(["OWNER", "ADMIN", "MANAGER"]),
  imageUpload.single("image"),
  asyncHandler(async (req, res) => {
    res.status(201).json(homepageContentService.uploadImage(req.file as Express.Multer.File));
  })
);

homepageLegacyAdminRouter.get(
  "/banners",
  allowRoles(["OWNER", "ADMIN", "MANAGER"]),
  asyncHandler(async (_req, res) => {
    res.json({ items: homepageContentService.getLegacyBannerItems() });
  })
);

homepageContentPublicRouter.get(
  "/homepage-content",
  asyncHandler(async (req, res) => {
    res.json(homepageContentService.getPublic(req.query.lang));
  })
);
