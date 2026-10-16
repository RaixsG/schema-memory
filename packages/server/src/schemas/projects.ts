import { z } from 'zod';

export const planProjectSchema = z.object({
  path: z.string({ required_error: 'Field "path" is required.' }).min(1, 'Field "path" is required.'),
});

export const addProjectSchema = z.object({
  path: z.string({ required_error: 'Field "path" is required.' }).min(1, 'Field "path" is required.'),
  id: z.string().optional(),
  name: z.string().optional(),
  dialect: z.enum(['postgres', 'sqlite', 'mysql']).optional(),
  installProjectSkill: z.boolean().optional(),
});

export const removeProjectQuerySchema = z.object({
  deleteData: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

export const saveLayoutSchema = z.object({
  layout: z
    .record(
      z.string(),
      z.object({
        x: z.number(),
        y: z.number(),
      })
    )
    .default({}),
});

export const savePendingSchema = z.object({
  proposedDbml: z.string().optional(),
  model: z.any().optional(),
  note: z.string().optional(),
});

export const listAdrsQuerySchema = z.object({
  table: z.string().optional(),
  column: z.string().optional(),
  status: z.enum(['propuesto', 'confirmado', 'revisar', 'reconstruido']).optional(),
});

export type PlanProjectInput = z.infer<typeof planProjectSchema>;
export type AddProjectInput = z.infer<typeof addProjectSchema>;
export type SaveLayoutInput = z.infer<typeof saveLayoutSchema>;
export type SavePendingInput = z.infer<typeof savePendingSchema>;
