import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedUploadedImage } from "./files.middleware";
import { saveProductImage } from "./files.service";

test("isAllowedUploadedImage accepts raster image types", () => {
  assert.equal(isAllowedUploadedImage({ mimetype: "image/jpeg", originalname: "photo.jpg" }), true);
  assert.equal(isAllowedUploadedImage({ mimetype: "image/png", originalname: "icon.png" }), true);
  assert.equal(isAllowedUploadedImage({ mimetype: "image/webp", originalname: "card.webp" }), true);
});

test("isAllowedUploadedImage rejects svg and extension mismatches", () => {
  assert.equal(isAllowedUploadedImage({ mimetype: "image/svg+xml", originalname: "vector.svg" }), false);
  assert.equal(isAllowedUploadedImage({ mimetype: "image/png", originalname: "script.svg" }), false);
  assert.equal(isAllowedUploadedImage({ mimetype: "image/jpeg", originalname: "photo.php" }), false);
});

test("isAllowedUploadedImage handles uppercase and double extensions", () => {
  assert.equal(isAllowedUploadedImage({ mimetype: "image/jpeg", originalname: "PHOTO.JPG" }), true);
  assert.equal(isAllowedUploadedImage({ mimetype: "image/jpeg", originalname: "photo.jpg.php" }), false);
});

test("saveProductImage rejects mimetype and extension mismatches before writing", () => {
  assert.throws(
    () =>
      saveProductImage({
        mimetype: "image/svg+xml",
        originalname: "vector.jpg",
        buffer: Buffer.from("<svg></svg>"),
      } as Express.Multer.File),
    /Unsupported image type/
  );
});
