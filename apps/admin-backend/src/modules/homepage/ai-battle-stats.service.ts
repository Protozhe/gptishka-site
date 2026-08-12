import fs from "fs";
import path from "path";
import { AppError } from "../../common/errors/app-error";

export type AiBattleSide = "chatgpt" | "claude";

type StoredAiBattleStats = {
  chatgpt: number;
  claude: number;
  updatedAt: string;
};

const dataDir = path.join(process.cwd(), "apps", "admin-backend", "data");
const dataFile = path.join(dataDir, "ai-battle-stats.json");
const emptyStats: StoredAiBattleStats = {
  chatgpt: 64,
  claude: 78,
  updatedAt: "2026-08-09T00:00:00.000Z",
};

function normalizeCount(value: unknown) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(emptyStats, null, 2), "utf-8");
  }
}

function readStats(): StoredAiBattleStats {
  ensureDataFile();
  try {
    const stored = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
    return {
      chatgpt: normalizeCount(stored?.chatgpt),
      claude: normalizeCount(stored?.claude),
      updatedAt: String(stored?.updatedAt || emptyStats.updatedAt),
    };
  } catch {
    return { ...emptyStats };
  }
}

function writeStats(stats: StoredAiBattleStats) {
  ensureDataFile();
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(stats, null, 2), "utf-8");
  fs.renameSync(temporaryFile, dataFile);
}

function publicStats(stats: StoredAiBattleStats) {
  const total = stats.chatgpt + stats.claude;
  const chatgptPercent = total > 0 ? Math.round((stats.chatgpt / total) * 100) : 50;
  return {
    chatgpt: stats.chatgpt,
    claude: stats.claude,
    total,
    chatgptPercent,
    claudePercent: 100 - chatgptPercent,
    updatedAt: stats.updatedAt,
  };
}

export const aiBattleStatsService = {
  get() {
    return publicStats(readStats());
  },

  registerClick(sideInput: unknown) {
    const side = String(sideInput || "").toLowerCase() as AiBattleSide;
    if (side !== "chatgpt" && side !== "claude") {
      throw new AppError("Choose chatgpt or claude", 400);
    }

    const stats = readStats();
    stats[side] += 1;
    stats.updatedAt = new Date().toISOString();
    writeStats(stats);
    return publicStats(stats);
  },
};
