import { z } from 'zod';

export const VisibilityEnum = z.enum(['link-public', 'domain-restricted', 'restricted']);

export const ShareSettingsSchema = z
  .object({
    layoutDirection: z.enum(['vertical', 'horizontal']).optional(),
    experimentLayout: z.enum(['horizontal', 'vertical']).optional(),
    viewDensity: z.enum(['full', 'compact']).optional(),
  })
  .strict();

export const CreateShareBodySchema = z
  .object({
    markdown: z.string(),
    name: z.string().max(500).optional(),
    visibility: VisibilityEnum.optional(),
    settings: ShareSettingsSchema.nullable().optional(),
    collapsedIds: z.array(z.string().max(200)).max(10000).optional(),
  })
  .strict();

export const UpdateShareBodySchema = z
  .object({
    markdown: z.string().optional(),
    name: z.string().max(500).optional(),
    visibility: VisibilityEnum.optional(),
    settings: ShareSettingsSchema.nullable().optional(),
    collapsedIds: z.array(z.string().max(200)).max(10000).optional(),
  })
  .strict();

export const CreateCommentBodySchema = z
  .object({
    cardId: z.string().min(1).max(200),
    body: z.string().min(1).max(2000),
  })
  .strict();

export type ValidationFailure = {
  ok: false;
  response: Response;
};

export type ValidationSuccess<T> = {
  ok: true;
  data: T;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ValidationResult<T>> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return {
      ok: false,
      response: Response.json(
        { error: 'Validation failed', issues },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: result.data };
}
