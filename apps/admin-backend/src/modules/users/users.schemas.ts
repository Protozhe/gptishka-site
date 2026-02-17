import { RoleCode } from "@prisma/client";
import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(100),
  role: z.enum([RoleCode.ADMIN, RoleCode.MANAGER]),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
});

export const changeUserRoleSchema = z.object({
  role: z.enum([RoleCode.ADMIN, RoleCode.MANAGER]),
});

export const changeUserStatusSchema = z.object({
  isActive: z.boolean(),
});
