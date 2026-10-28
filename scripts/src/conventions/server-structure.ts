import { posix } from 'node:path';
import type { Violation } from '../repository.ts';
import { type FeatureLayout, featureLayoutProblem } from './feature-layout.ts';
import { type LayerModel, layerViolations, locateByFolder } from './layers.ts';

/**
 * Layout of a server feature; the kind is written in each file name:
 * - root: `setup.routes.ts`, the HTTP adapter and only entry point of the feature;
 * - `commands/`: `complete-setup.command.ts`, state changes in one transaction (defineCommand);
 * - `queries/`: `get-setup-status.query.ts`, reads that never write (defineQuery);
 * - `jobs/`: `send-email.job.ts`, work for the background queue (defineJob);
 * - `models/`: `issue.model.ts`, types and Zod schemas of the feature;
 * - `utils/`: `setup-code.util.ts`, pure helpers.
 */
export const SERVER_FEATURE_LAYOUT: FeatureLayout = {
  '': ['routes'],
  commands: ['command'],
  queries: ['query'],
  jobs: ['job'],
  models: ['model'],
  utils: ['util'],
};

const SERVER_SRC = 'apps/server/src/';
const TEST = /\.test\.ts$/;
/** Entry points and app assembly, at the root of apps/server/src. */
const ROOT_FILES = new Set(['main.ts', 'healthcheck.ts', 'app.ts', 'test-helpers.ts']);

export function isServerSource(path: string): boolean {
  return path.startsWith(SERVER_SRC) && path.endsWith('.ts');
}

/** Where a server file belongs and how it is named; `null` when it follows the conventions. */
export function serverNamingProblem(path: string): string | null {
  const relative = path.slice(SERVER_SRC.length);
  const fileName = posix.basename(path);
  if (!relative.includes('/')) {
    return ROOT_FILES.has(fileName) || TEST.test(fileName)
      ? null
      : 'Put code in platform/<area>/ or features/<feature>/, not at the root of apps/server/src';
  }
  if (!/^(platform|features)\/[^/]+\//.test(relative)) {
    return 'apps/server/src is organized in platform/<area>/ and features/<feature>/';
  }
  if (!relative.startsWith('features/') || TEST.test(fileName)) {
    return null;
  }
  const kind = /\.([a-z]+)\.ts$/.exec(fileName)?.[1] ?? '';
  return featureLayoutProblem(SERVER_FEATURE_LAYOUT, relative.split('/').slice(2), kind);
}

/** `platform` is technical and knows no feature; a feature uses `platform` and itself only. */
const SERVER_LAYERS: LayerModel = {
  src: SERVER_SRC,
  locate: (relativePath) => locateByFolder(relativePath, ['platform', 'features']),
  mayImport(from, to) {
    switch (from.layer) {
      case 'platform':
        return to.layer === 'platform';
      case 'features':
        return to.layer === 'platform' || (to.layer === 'features' && to.feature === from.feature);
      default:
        return true;
    }
  },
  messages: {
    platform: 'platform/ cannot import features: it is wired to them in app.ts',
    features:
      'A feature imports platform/ and its own files only; call another feature through its commands and queries from app.ts, or move shared logic to @toppo-tracker/core',
  },
};

export function serverLayerViolations(rule: string, path: string, source: string): Violation[] {
  return layerViolations(SERVER_LAYERS, rule, path, source);
}
