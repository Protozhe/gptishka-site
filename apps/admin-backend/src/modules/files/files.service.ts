import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const uploadsRoot = path.join(process.cwd(), "apps", "admin-backend", "uploads");
const productsDir = path.join(uploadsRoot, "products");

function ensureDirs() {
  if (!fs.existsSync(productsDir)) {
    fs.mkdirSync(productsDir, { recursive: true });
  }
}

export function saveProductImage(file: Express.Multer.File) {
  ensureDirs();
  const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
  const fileName = `${uuid()}${ext}`;
  const targetPath = path.join(productsDir, fileName);
  fs.writeFileSync(targetPath, file.buffer);
  return `/uploads/products/${fileName}`;
}
