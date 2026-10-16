import { zValidator as zv } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';

export const validate = (
  target: 'json' | 'query' | 'param',
  schema: ZodSchema
) =>
  zv(target, schema, (result, c) => {
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue?.message || 'Validation error';
      return c.json(
        {
          error: message,
          issues: result.error.issues,
        },
        400
      );
    }
  });
