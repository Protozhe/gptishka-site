import crypto from "crypto";
import fs from "fs";
import path from "path";

export type ActivationReviewRecord = {
  orderId: string;
  publicId: string;
  productTitle: string;
  rating: number;
  text: string;
  createdAt: string;
  updatedAt: string;
};

type ActivationReviewsData = {
  items: ActivationReviewRecord[];
};

function resolveDataDir() {
  const configured = String(process.env.GPTISHKA_RUNTIME_DIR || process.env.RUNTIME_DIR || "").trim();
  if (configured) return path.resolve(configured);

  const linuxDefault = "/var/lib/gptishka-runtime";
  if (process.platform === "linux" && fs.existsSync(linuxDefault)) return linuxDefault;
  return path.resolve(process.cwd(), "data");
}

const dataDir = resolveDataDir();
const reviewsFile = path.join(dataDir, "activation-reviews.json");
let writeQueue = Promise.resolve();

function normalizeData(value: unknown): ActivationReviewsData {
  const items = Array.isArray((value as any)?.items)
    ? (value as any).items.filter((item: any) => item && item.orderId && item.publicId && item.text)
    : [];
  return { items: items.slice(0, 5000) };
}

async function readData(): Promise<ActivationReviewsData> {
  try {
    return normalizeData(JSON.parse(await fs.promises.readFile(reviewsFile, "utf8")));
  } catch (error: any) {
    if (error?.code === "ENOENT") return { items: [] };
    throw error;
  }
}

async function writeData(data: ActivationReviewsData) {
  await fs.promises.mkdir(dataDir, { recursive: true });
  const temporaryFile = `${reviewsFile}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporaryFile, `${JSON.stringify(normalizeData(data), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.promises.rename(temporaryFile, reviewsFile);
}

function makePublicId(orderId: string) {
  return `site-${crypto.createHash("sha256").update(`activation-review:${orderId}`).digest("hex").slice(0, 20)}`;
}

export const activationReviewsStore = {
  async upsert(input: { orderId: string; productTitle: string; rating: number; text: string }) {
    const savePromise = writeQueue.then(async () => {
      const data = await readData();
      const now = new Date().toISOString();
      const index = data.items.findIndex((item) => item.orderId === input.orderId);
      const existing = index >= 0 ? data.items[index] : null;
      const saved: ActivationReviewRecord = {
        orderId: input.orderId,
        publicId: existing?.publicId || makePublicId(input.orderId),
        productTitle: input.productTitle,
        rating: input.rating,
        text: input.text,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      if (index >= 0) data.items[index] = saved;
      else data.items.unshift(saved);
      data.items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      await writeData(data);
      return saved;
    });
    writeQueue = savePromise.then(() => undefined, () => undefined);
    return savePromise;
  },

  async listPublic() {
    const data = await readData();
    return data.items.map((item) => ({
      id: item.publicId,
      sourceId: "gptishka-activation",
      sourceType: "site",
      sourceLabel: "Покупка на сайте",
      sourceHidden: true,
      author: "Покупатель GPTishka",
      text: item.text,
      detail: item.productTitle || "Автоматическая активация",
      date: item.createdAt,
      dateLabel: "",
      rating: item.rating,
      url: "",
      sortOrder: Date.parse(item.createdAt) || 0,
    }));
  },
};
