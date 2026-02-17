import { PrismaClient, RoleCode } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const allowedRoles = new Set<string>(Object.values(RoleCode));

async function main() {
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "");
  const roleRaw = String(process.env.BOOTSTRAP_ADMIN_ROLE || "SUPPORT").trim().toUpperCase();
  const firstName = String(process.env.BOOTSTRAP_ADMIN_FIRST_NAME || "Support").trim();
  const lastName = String(process.env.BOOTSTRAP_ADMIN_LAST_NAME || "Team").trim();
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);

  if (!email) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL is required");
  }
  if (!password || password.length < 8) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD is required and must be at least 8 characters");
  }
  if (!allowedRoles.has(roleRaw)) {
    throw new Error(`BOOTSTRAP_ADMIN_ROLE must be one of: ${Array.from(allowedRoles).join(", ")}`);
  }

  const roleCode = roleRaw as RoleCode;
  const role = await prisma.role.upsert({
    where: { code: roleCode },
    create: { code: roleCode, name: roleCode[0] + roleCode.slice(1).toLowerCase() },
    update: {},
  });

  const passwordHash = await bcrypt.hash(password, rounds);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      firstName: firstName || null,
      lastName: lastName || null,
      roleId: role.id,
      isActive: true,
    },
    update: {
      passwordHash,
      roleId: role.id,
      isActive: true,
      firstName: firstName || null,
      lastName: lastName || null,
    },
    include: { role: true },
  });

  process.stdout.write(`[admin-backend] upserted ${user.email} with role ${user.role.code}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
