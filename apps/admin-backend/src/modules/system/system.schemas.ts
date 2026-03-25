import { z } from "zod";

export const adminSendTestEmailSchema = z.object({
  email: z.string().email().max(320),
});

