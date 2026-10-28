import type { Violation } from '../repository.ts';
import { frontLayerViolations, frontNamingProblem, isFrontSource } from './front-structure.ts';
import { relativeImports } from './imports.ts';
import { isServerSource, serverLayerViolations, serverNamingProblem } from './server-structure.ts';
import { findHardcodedUiText } from './ui-text.ts';

export interface ConventionRule {
  id: string;
  /** Why the rule exists, printed with each violation. */
  message: string;
  appliesTo(path: string): boolean;
  check(path: string, source: string): Violation[];
}

const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /(\.test\.tsx?|\.spec\.ts|\.setup\.ts|test-helpers\.tsx?|test-setup\.ts)$/;
const PRODUCT_CODE = /^(apps|packages|plugins)\//;
const FRONTEND_CODE = /^(apps\/web|packages\/ui)\/src\//;
const SERVER_CODE = /^(apps\/server|packages\/(core|db|shared))\/src\//;
const FEATURE_ROUTES = /^apps\/server\/src\/features\/.+\.routes\.ts$/;

const isProductSource = (path: string) => PRODUCT_CODE.test(path) && SOURCE_FILE.test(path);
const isProductRuntimeSource = (path: string) => isProductSource(path) && !TEST_FILE.test(path);

/** `// allow(rule-id): reason` on the line above silences a rule once, with a written justification. */
const ALLOW_COMMENT = /\/\/\s*allow\(([\w-]+)\):\s*\S.{8,}/;

function lineMatches(
  rule: Pick<ConventionRule, 'id' | 'message'>,
  path: string,
  source: string,
  patterns: readonly RegExp[],
): Violation[] {
  const lines = source.split('\n');
  return lines.flatMap((text, index) => {
    const previous = lines[index - 1] ?? '';
    const allowed = ALLOW_COMMENT.exec(previous)?.[1] === rule.id;
    if (allowed || !patterns.some((pattern) => pattern.test(text))) {
      return [];
    }
    return [{ rule: rule.id, file: path, line: index + 1, message: rule.message }];
  });
}

/**
 * Literal role names that give away a role check. Not "member": everyone in the instance is
 * one, and members and invitations are told apart by `type === 'member'`.
 */
const ROLE_NAMES = '(admin|administrator|guest|owner|manager|team|requester|supervisor)';

export const RULES: readonly ConventionRule[] = [
  {
    id: 'no-role-name-check',
    message: 'Check a permission with authorize(), never a role name',
    appliesTo: isProductRuntimeSource,
    check(path, source) {
      return lineMatches(this, path, source, [
        /\brole\w*(\.\w+)*\s*[!=]==?\s*['"`]/i,
        /['"`]\w+['"`]\s*[!=]==?\s*\w*role\w*\b/i,
        new RegExp(`['"\`]${ROLE_NAMES}['"\`]\\s*[!=]==?`, 'i'),
        new RegExp(`[!=]==?\\s*['"\`]${ROLE_NAMES}['"\`]`, 'i'),
        new RegExp(`case\\s+['"\`]${ROLE_NAMES}['"\`]`, 'i'),
      ]);
    },
  },
  {
    id: 'route-access-from-operation',
    message:
      'A route declares the access of the operation it runs: config: { access: operation.access }',
    appliesTo: (path) => FEATURE_ROUTES.test(path),
    check(path, source) {
      return lineMatches(this, path, source, [/\baccess:(?!\s*[A-Za-z_$][\w$]*\.access\b)/]);
    },
  },
  {
    id: 'no-raw-sql',
    message: 'Raw SQL bypasses parameter binding; use Drizzle or tagged `sql` templates',
    appliesTo: isProductRuntimeSource,
    check(path, source) {
      return lineMatches(this, path, source, [/\bsql\.raw\s*\(/, /\.unsafe\s*\(/]);
    },
  },
  {
    id: 'no-html-sink',
    message: 'Writing HTML directly opens XSS holes; render through React',
    appliesTo: isProductRuntimeSource,
    check(path, source) {
      return lineMatches(this, path, source, [
        /\.(innerHTML|outerHTML)\s*=/,
        /\.insertAdjacentHTML\s*\(/,
        /\bdocument\.write(ln)?\s*\(/,
        /\bnew\s+Function\s*\(/,
      ]);
    },
  },
  {
    id: 'no-insecure-random',
    message: 'Math.random() is predictable; use node:crypto',
    appliesTo: (path) => SERVER_CODE.test(path) && !TEST_FILE.test(path),
    check(path, source) {
      return lineMatches(this, path, source, [/\bMath\.random\s*\(/]);
    },
  },
  {
    id: 'activities-through-record',
    message:
      'Write activities with recordActivity (platform/activities): it queues the job that tells people',
    appliesTo: (path) =>
      path.startsWith('apps/server/src/') &&
      !TEST_FILE.test(path) &&
      !path.endsWith('platform/activities/record-activity.ts'),
    check(path, source) {
      return lineMatches(this, path, source, [/\.insert\(\s*activities\s*\)/]);
    },
  },
  {
    id: 'no-type-escape',
    message: '@ts-ignore and @ts-nocheck hide real errors; fix the types',
    appliesTo: (path) => SOURCE_FILE.test(path),
    check(path, source) {
      return lineMatches(this, path, source, [/@ts-(ignore|nocheck)\b/]);
    },
  },
  {
    id: 'todo-needs-issue',
    message: 'Link TODO/FIXME to a GitHub issue: TODO(#123)',
    appliesTo: (path) => SOURCE_FILE.test(path),
    check(path, source) {
      return lineMatches(this, path, source, [/\b(TODO|FIXME|HACK|XXX)\b(?!\(#\d+\))/]);
    },
  },
  {
    id: 'light-theme-only',
    message: 'Toppo ships a single light theme; do not add dark: variants',
    appliesTo: (path) => FRONTEND_CODE.test(path) && SOURCE_FILE.test(path),
    check(path, source) {
      return lineMatches(this, path, source, [/(^|[\s"'`])dark:/]);
    },
  },
  {
    id: 'design-tokens-only',
    message: 'Use design tokens from packages/ui/src/theme.css instead of raw colors',
    appliesTo: (path) => FRONTEND_CODE.test(path) && path.endsWith('.tsx'),
    check(path, source) {
      return lineMatches(this, path, source, [
        /-\[#[0-9a-f]{3,8}\]/i,
        /-\[(rgb|rgba|hsl|hsla|oklch)\(/i,
        /\b(color|background|backgroundColor|borderColor)\s*:\s*['"`]#[0-9a-f]{3,8}/i,
      ]);
    },
  },
  {
    id: 'no-relative-import-across-packages',
    message: 'Import other workspaces by package name (@toppo-tracker/...), never by relative path',
    appliesTo: (path) => SOURCE_FILE.test(path),
    check(path, source) {
      const root = workspaceRoot(path);
      return relativeImports(path, source)
        .filter(({ target }) => !target.startsWith(`${root}/`))
        .map(({ line }) => ({ rule: this.id, file: path, line, message: this.message }));
    },
  },
  {
    id: 'no-hardcoded-ui-text',
    message: 'User-facing text must come from i18n messages: t("...")',
    appliesTo: (path) => FRONTEND_CODE.test(path) && path.endsWith('.tsx') && !TEST_FILE.test(path),
    check(path, source) {
      return findHardcodedUiText(source).map((line) => ({
        rule: this.id,
        file: path,
        line,
        message: this.message,
      }));
    },
  },
  {
    id: 'front-file-naming',
    message: 'Front-end files follow the routes/features/shared layout and kind suffixes',
    appliesTo: isFrontSource,
    check(path) {
      const problem = frontNamingProblem(path);
      return problem ? [{ rule: this.id, file: path, line: 1, message: problem }] : [];
    },
  },
  {
    id: 'front-layers',
    message: 'Front-end layers: routes → features → shared',
    appliesTo: isFrontSource,
    check(path, source) {
      return frontLayerViolations(this.id, path, source);
    },
  },
  {
    id: 'server-file-naming',
    message: 'Server files follow the platform/features layout and kind suffixes',
    appliesTo: isServerSource,
    check(path) {
      const problem = serverNamingProblem(path);
      return problem ? [{ rule: this.id, file: path, line: 1, message: problem }] : [];
    },
  },
  {
    id: 'server-layers',
    message: 'Server layers: features → platform',
    appliesTo: isServerSource,
    check(path, source) {
      return serverLayerViolations(this.id, path, source);
    },
  },
];

/** `apps/web/src/x.ts` → `apps/web`; `scripts/src/x.ts` → `scripts`. */
export function workspaceRoot(path: string): string {
  const [first = '', second = ''] = path.split('/');
  return ['apps', 'packages', 'plugins'].includes(first) ? `${first}/${second}` : first;
}

/** The rules quote the very patterns they forbid, so their own sources are not checked. */
const SELF = 'scripts/src/conventions/';

export function checkFile(path: string, source: string): Violation[] {
  if (path.startsWith(SELF)) {
    return [];
  }
  return RULES.filter((rule) => rule.appliesTo(path)).flatMap((rule) => rule.check(path, source));
}
