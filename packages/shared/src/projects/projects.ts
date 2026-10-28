import { z } from 'zod';
import { PALETTE_COLORS } from '../colors.ts';
import { projectKeySchema } from '../project-key.ts';

export const PROJECT_NAME_MAX_LENGTH = 80;

export const PROJECT_DESCRIPTION_MAX_LENGTH = 1000;

/** Rows per page of the projects list. */
export const PROJECTS_PAGE_SIZE = 50;

/** How many of a project's members its row in the list shows, beside their count. */
export const PROJECT_MEMBERS_PREVIEW = 4;

export const projectColorSchema = z.enum(PALETTE_COLORS);

export const projectKeyParamsSchema = z.object({
  projectKey: projectKeySchema,
});

export const projectNameSchema = z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH);

export const projectDescriptionSchema = z.string().trim().max(PROJECT_DESCRIPTION_MAX_LENGTH);

/** Body of `POST /api/v1/projects`. */
export const createProjectRequestSchema = z.object({
  key: projectKeySchema,
  name: projectNameSchema,
  description: projectDescriptionSchema.default(''),
});

export type CreateProjectRequest = z.input<typeof createProjectRequestSchema>;

export const createProjectResponseSchema = z.object({
  id: z.uuid(),
  key: z.string(),
});

/** Body of `PATCH /api/v1/projects/:projectKey`: the key changes only until the first issue. */
export const updateProjectRequestSchema = z.object({
  key: projectKeySchema,
  name: projectNameSchema,
  description: projectDescriptionSchema,
  color: projectColorSchema,
});

export type UpdateProjectRequest = z.input<typeof updateProjectRequestSchema>;

/** Body of `GET /api/v1/projects/:projectKey`: a project, as the caller may use it. */
export const projectResponseSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string(),
  color: projectColorSchema,
  /** Read-only while archived. */
  archived: z.boolean(),
  /** The key can change until the project's first issue. */
  keyEditable: z.boolean(),
  /**
   * What the caller may do in this project, by catalog name (`@toppo-tracker/core`), so the web app can
   * hide the rest. Plain strings on the wire: the server stays the only judge.
   */
  permissions: z.array(z.string()),
});

export type ProjectResponse = z.infer<typeof projectResponseSchema>;

/**
 * Query of `GET /api/v1/projects`: the projects the caller reaches. The server searches and pages;
 * archived ones are listed apart.
 */
export const projectsQuerySchema = z.object({
  /** Every project the caller reaches, or only those whose settings or access they manage. */
  scope: z.enum(['reachable', 'managed']).default('reachable'),
  state: z.enum(['active', 'archived']).default('active'),
  /** Part of a key or a name, case and accents ignored. */
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

/** The filters a screen sends; the first page of active projects when none is given. */
export interface ProjectsQuery {
  scope?: 'reachable' | 'managed' | undefined;
  state?: 'active' | 'archived' | undefined;
  search?: string | undefined;
  page?: number | undefined;
}

export const projectSummarySchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string(),
  color: projectColorSchema,
  /**
   * The people added to the project, not those who reach every project: only on the projects
   * screen (`scope=managed`), for those who manage it; `null` elsewhere, so that who works on a
   * project stays private from those who see their own issues only.
   */
  members: z
    .object({
      count: z.number().int(),
      /** The first few, by name. */
      shown: z.array(z.object({ userId: z.uuid(), name: z.string() })),
    })
    .nullable(),
  /**
   * Its open issues, urgent ones among them, and when it last changed: only on the projects screen
   * (`scope=managed`), where those who manage the project see them; `null` elsewhere.
   */
  issues: z
    .object({
      open: z.number().int(),
      urgent: z.number().int(),
      /** UTC ISO 8601, or `null` while nothing happened in the project. */
      lastActivityAt: z.iso.datetime().nullable(),
    })
    .nullable(),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectsResponseSchema = z.object({
  /** One page, by name. */
  rows: z.array(projectSummarySchema),
  /** Projects matching the search in the requested state, across all pages. */
  matching: z.number().int(),
  /** Projects matching the search in each state: the counts of the tabs. */
  counts: z.object({ active: z.number().int(), archived: z.number().int() }),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type ProjectsResponse = z.infer<typeof projectsResponseSchema>;
