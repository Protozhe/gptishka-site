import crypto from "crypto";
import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/app-error";

const NOTE_SLUG_PATTERN = /^[a-f0-9]{12}$/;
const MAX_TITLE_LENGTH = 160;
const MAX_CONTENT_LENGTH = 100_000;

function hashEditToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hasValidEditToken(expectedHash: string, token?: string | null) {
  const provided = String(token || "").trim();
  if (!provided) return false;
  const actualHash = hashEditToken(provided);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function normalizeSlug(value: unknown) {
  const slug = String(value || "").trim().toLowerCase();
  if (!NOTE_SLUG_PATTERN.test(slug)) throw new AppError("Заметка не найдена", 404);
  return slug;
}

function normalizeFields(input: { title?: unknown; content?: unknown }) {
  const title = String(input.title || "").trim().slice(0, MAX_TITLE_LENGTH);
  const content = String(input.content || "");
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new AppError(`Текст заметки не должен превышать ${MAX_CONTENT_LENGTH} символов`, 400);
  }
  return { title, content };
}

function publicNote(note: { slug: string; title: string; content: string; createdAt: Date; updatedAt: Date }, editable: boolean) {
  return {
    slug: note.slug,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    editable,
  };
}

async function createUniqueSlug() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = crypto.randomBytes(6).toString("hex");
    const exists = await prisma.publicNote.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  throw new AppError("Не удалось создать адрес заметки. Повторите попытку.", 503);
}

export const notesService = {
  async create(input: { title?: unknown; content?: unknown }) {
    const fields = normalizeFields(input);
    const slug = await createUniqueSlug();
    const editToken = crypto.randomBytes(32).toString("base64url");
    const note = await prisma.publicNote.create({
      data: { slug, editTokenHash: hashEditToken(editToken), ...fields },
    });
    return { note: publicNote(note, true), editToken };
  },

  async read(slugInput: unknown, editToken?: string | null) {
    const slug = normalizeSlug(slugInput);
    const note = await prisma.publicNote.findUnique({ where: { slug } });
    if (!note) throw new AppError("Заметка не найдена", 404);
    return publicNote(note, hasValidEditToken(note.editTokenHash, editToken));
  },

  async update(slugInput: unknown, editToken: string | null | undefined, input: { title?: unknown; content?: unknown }) {
    const slug = normalizeSlug(slugInput);
    const note = await prisma.publicNote.findUnique({ where: { slug } });
    if (!note) throw new AppError("Заметка не найдена", 404);
    if (!hasValidEditToken(note.editTokenHash, editToken)) {
      throw new AppError("Секретная ссылка редактирования недействительна", 403);
    }
    const updated = await prisma.publicNote.update({ where: { slug }, data: normalizeFields(input) });
    return publicNote(updated, true);
  },

  async remove(slugInput: unknown, editToken?: string | null) {
    const slug = normalizeSlug(slugInput);
    const note = await prisma.publicNote.findUnique({ where: { slug } });
    if (!note) throw new AppError("Заметка не найдена", 404);
    if (!hasValidEditToken(note.editTokenHash, editToken)) {
      throw new AppError("Секретная ссылка редактирования недействительна", 403);
    }
    await prisma.publicNote.delete({ where: { slug } });
    return { ok: true };
  },
};
