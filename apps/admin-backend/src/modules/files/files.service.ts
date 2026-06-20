import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { AppError } from "../../common/errors/app-error";
import { isAllowedUploadedImage } from "./files.middleware";

const uploadsRoot = path.join(process.cwd(), "apps", "admin-backend", "uploads");
const productsDir = path.join(uploadsRoot, "products");

function ensureDirs() {
  if (!fs.existsSync(productsDir)) {
    fs.mkdirSync(productsDir, { recursive: true });
  }
}

export function saveProductImage(file: Express.Multer.File) {
  const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
  if (!isAllowedUploadedImage(file)) {
    throw new AppError("Unsupported image type", 400);
  }

  ensureDirs();
  const fileName = `${uuid()}${ext}`;
  const targetPath = path.join(productsDir, fileName);
  fs.writeFileSync(targetPath, file.buffer);
  return `/uploads/products/${fileName}`;
}
