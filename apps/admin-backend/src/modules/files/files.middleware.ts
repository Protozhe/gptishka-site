import multer from "multer";
import { AppError } from "../../common/errors/app-error";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export function isAllowedUploadedImage(file: Pick<Express.Multer.File, "mimetype" | "originalname">) {
  const mime = String(file.mimetype || "").toLowerCase();
  const originalName = String(file.originalname || "");
  return ALLOWED_IMAGE_MIME_TYPES.has(mime) && ALLOWED_IMAGE_EXTENSIONS.test(originalName);
}

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedUploadedImage(file)) {
      callback(new AppError("Unsupported image type", 400));
      return;
    }
    callback(null, true);
  },
});
