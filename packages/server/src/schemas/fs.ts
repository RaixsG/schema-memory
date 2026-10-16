import { z } from 'zod';

export const listDirectoriesQuerySchema = z.object({
  path: z.string().optional(),
});

export type ListDirectoriesQueryInput = z.infer<typeof listDirectoriesQuerySchema>;
