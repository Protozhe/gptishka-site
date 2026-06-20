import { RoleCode } from "@prisma/client";
import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/app-error";

const safeUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} as const;

export const usersService = {
  async list() {
    return prisma.user.findMany({
      select: safeUserSelect,
      orderBy: { createdAt: "desc" },
    });
  },

  async create(input: { email: string; password: string; role: RoleCode; firstName?: string; lastName?: string }) {
    const role = await prisma.role.findUnique({ where: { code: input.role } });
    if (!role) throw new AppError("Role not found", 400);

    const exists = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (exists) throw new AppError("Email already exists", 409);

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

    return prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        roleId: role.id,
      },
      select: safeUserSelect,
    });
  },

  async changeRole(userId: string, roleCode: RoleCode, actorUserId?: string) {
    if (userId === actorUserId) throw new AppError("You cannot change your own role", 400);

    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new AppError("Role not found", 400);

    return prisma.user.update({
      where: { id: userId },
      data: { roleId: role.id },
      select: safeUserSelect,
    });
  },

  async setActive(userId: string, isActive: boolean, actorUserId?: string) {
    if (userId === actorUserId && !isActive) throw new AppError("You cannot deactivate your own account", 400);

    return prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: safeUserSelect,
    });
  },

  async remove(userId: string, actorUserId?: string) {
    if (userId === actorUserId) throw new AppError("You cannot delete your own account", 400);

    return prisma.user.delete({ where: { id: userId } });
  },
};
