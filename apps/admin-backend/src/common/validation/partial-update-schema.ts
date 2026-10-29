import { z } from "zod";

/** Missing PATCH fields must not acquire create-only defaults in Zod 4. */
export function partialUpdateSchema<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = {} as { [K in keyof T]: z.ZodOptional<T[K]> };
  for (const key of Object.keys(schema.shape) as Array<keyof T>) {
    const field = schema.shape[key];
    const withoutDefault = field instanceof z.ZodDefault ? field.removeDefault() : field;
    shape[key] = z.optional(withoutDefault) as z.ZodOptional<T[typeof key]>;
  }
  return z.object(shape);
}
