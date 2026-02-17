import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export const registerAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(100),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
});
