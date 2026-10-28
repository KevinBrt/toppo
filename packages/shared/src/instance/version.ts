import { z } from 'zod';

/**
 * The version of Toppo this code is: release-please updates it in the commit that releases a
 * version (`extra-files` in release-please-config.json), so that the server and the web app both
 * know it from their build. Between releases, the version last released.
 */
export const TOPPO_VERSION = '1.0.1'; // x-release-please-version

/** A released version, as its tag names it without the `v`: `0.2.0`. */
export const releasedVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

/** Body of `GET /api/v1/instance/version`. */
export const instanceVersionResponseSchema = z.object({
  /** The version running. */
  version: z.string(),
  /**
   * A newer version published, with the page of its release notes, for whoever manages the
   * instance; `null` otherwise, or while checking is turned off.
   */
  update: z.object({ version: releasedVersionSchema, url: z.url() }).nullable(),
});

export type InstanceVersionResponse = z.infer<typeof instanceVersionResponseSchema>;
