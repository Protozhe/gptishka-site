import fs from "fs";
import path from "path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";

const uploadsRoot = path.join(process.cwd(), "apps", "admin-backend", "uploads");
const productsDir = path.join(uploadsRoot, "products");
const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg"]);
const pngExtension = ".png";
const normalizedCardImageExtension = ".webp";
const normalizedCardImageSize = 1024;

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

export async function saveNormalizedProductCardImage(file: Express.Multer.File) {
  ensureDirs();
  const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
  const mime = String(file.mimetype || "").toLowerCase();
  if (!allowedImageExtensions.has(ext)) {
    throw new Error("Allowed image formats: jpg, jpeg, png, webp, svg");
  }

  // SVG is vector and should be prepared with a correct viewBox at export time.
  // TODO: add SVG viewBox normalization if SVG uploads become common for product cards.
  if (ext === ".svg" || mime === "image/svg+xml") {
    return saveProductImage(file);
  }

  const fileName = `${uuid()}${normalizedCardImageExtension}`;
  const targetPath = path.join(productsDir, fileName);

  // Remove transparent empty borders inside uploaded PNG/WebP logos/cards.
  // This is intentionally alpha-based, not color-based: many GPTishka cards use
  // black decorative backgrounds, and color-trim could crop valid artwork.
  // TODO: if one-color opaque margins become common, add an explicit admin option
  // for aggressive color trimming instead of applying it globally.
  const normalizedBuffer = await normalizeRasterProductCardImage(file.buffer);
  await sharp(normalizedBuffer, { failOn: "none" })
    // Product cards are square; normalize every uploaded raster into one stable format.
    .resize(normalizedCardImageSize, normalizedCardImageSize, {
      fit: "cover",
      position: "center",
      withoutEnlargement: false,
    })
    .webp({ quality: 92, effort: 4 })
    .toFile(targetPath);

  return `/uploads/products/${fileName}`;
}

async function normalizeRasterProductCardImage(buffer: Buffer) {
  const image = sharp(buffer, { failOn: "none" });
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height || !metadata.hasAlpha) return buffer;

  const { data, info } = await sharp(buffer, { failOn: "none" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  const alphaThreshold = 8;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return buffer;

  const trimLeft = minX;
  const trimTop = minY;
  const trimRight = info.width - 1 - maxX;
  const trimBottom = info.height - 1 - maxY;
  const hasUsefulTrim = Math.max(trimLeft, trimTop, trimRight, trimBottom) >= 2;
  if (!hasUsefulTrim) return buffer;

  return sharp(buffer, { failOn: "none" })
    .extract({
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    })
    .png()
    .toBuffer();
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
