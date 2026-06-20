import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const uploadsRoot = path.join(process.cwd(), "apps", "admin-backend", "uploads");
const productsDir = path.join(uploadsRoot, "products");
const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg"]);
const pngExtension = ".png";

function ensureDirs() {
  if (!fs.existsSync(productsDir)) {
    fs.mkdirSync(productsDir, { recursive: true });
  }
}

export function saveProductImage(file: Express.Multer.File) {
  ensureDirs();
  const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
  if (!allowedImageExtensions.has(ext)) {
    throw new Error("Allowed image formats: jpg, jpeg, png, webp, svg");
  }
  const fileName = `${uuid()}${ext}`;
  const targetPath = path.join(productsDir, fileName);
  fs.writeFileSync(targetPath, file.buffer);
  return `/uploads/products/${fileName}`;
}

export function saveProductPngImage(file: Express.Multer.File) {
  ensureDirs();
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  if (ext !== pngExtension || mime !== "image/png") {
    throw new Error("Allowed image format: png");
  }
  const fileName = `${uuid()}${pngExtension}`;
  const targetPath = path.join(productsDir, fileName);
  fs.writeFileSync(targetPath, file.buffer);
  return `/uploads/products/${fileName}`;
}

export function deleteProductImageByUrl(imageUrl: string) {
  const normalized = String(imageUrl || "").trim();
  if (!normalized.startsWith("/uploads/products/")) return false;

  const fileName = path.basename(normalized);
  if (!fileName) return false;

  const targetPath = path.resolve(productsDir, fileName);
  const safeRoot = path.resolve(productsDir);
  if (!targetPath.startsWith(safeRoot + path.sep)) return false;

  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
