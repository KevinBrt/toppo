import { describe, expect, it } from 'vitest';
import { checkFile, workspaceRoot } from './rules.ts';

function rulesBroken(path: string, source: string): string[] {
  return checkFile(path, source).map((violation) => violation.rule);
}

const SERVER = 'apps/server/src/features/issues/commands/create-issue.command.ts';
const WEB = 'apps/web/src/routes/issues.route.tsx';

describe('no-role-name-check', () => {
  it.each([
    "if (member.role === 'admin') {}",
    "if (user.roleName !== 'Guest') {}",
    "if ('admin' === role.name) {}",
    "const isAdmin = role.key == 'administrator';",
    "switch (role) { case 'requester': break; }",
  ])('flags %s', (source) => {
    expect(rulesBroken(SERVER, source)).toContain('no-role-name-check');
  });

  it.each([
    "await authorize(user, 'issue.delete', { projectId });",
    "const status = issue.status === 'open';",
    "const isMember = row.type === 'member';",
  ])('accepts %s', (source) => {
    expect(rulesBroken(SERVER, source)).not.toContain('no-role-name-check');
  });

  it('does not apply to tests, which seed default roles', () => {
    expect(rulesBroken('apps/server/src/roles.test.ts', "role.name === 'admin'")).toStrictEqual([]);
  });
});

describe('route-access-from-operation', () => {
  const ROUTES = 'apps/server/src/features/users/users.routes.ts';

  it.each([
    "config: { access: 'authenticated' },",
    "config: { access: { permission: 'instance.users.manage' } },",
    'config: { access: SOME_ACCESS },',
  ])('flags %s', (source) => {
    expect(rulesBroken(ROUTES, source)).toContain('route-access-from-operation');
  });

  it('accepts the access of the operation the route runs', () => {
    expect(rulesBroken(ROUTES, 'config: { access: inviteUser.access },')).toStrictEqual([]);
  });

  it('leaves platform routes, which run no operation, alone', () => {
    const meRoute = 'apps/server/src/platform/auth/me-route.ts';

    expect(rulesBroken(meRoute, "config: { access: 'public' },")).toStrictEqual([]);
  });
});

describe('allow comments', () => {
  it('silence one line when a reason is given', () => {
    const source = [
      '// allow(no-raw-sql): migration needs a dynamic schema name',
      'await sql.unsafe(statement);',
      'await sql.unsafe(other);',
    ].join('\n');

    expect(checkFile(SERVER, source).map((violation) => violation.line)).toStrictEqual([3]);
  });

  it('require a reason', () => {
    const source = ['// allow(no-raw-sql):', 'await sql.unsafe(statement);'].join('\n');

    expect(rulesBroken(SERVER, source)).toStrictEqual(['no-raw-sql']);
  });
});

describe('security rules', () => {
  it.each([
    ['sql.raw(input)', 'no-raw-sql'],
    ['element.innerHTML = html;', 'no-html-sink'],
    ['node.insertAdjacentHTML("beforeend", html)', 'no-html-sink'],
    ['const run = new Function(code);', 'no-html-sink'],
    ['const token = Math.random().toString(36);', 'no-insecure-random'],
    ['await tx.insert(activities).values({ type });', 'activities-through-record'],
  ])('flags %s', (source, rule) => {
    expect(rulesBroken(SERVER, source)).toContain(rule);
  });

  it('allows Math.random in the front end (animations, not secrets)', () => {
    expect(
      rulesBroken('apps/web/src/shared/motion/confetti.util.ts', 'Math.random()'),
    ).toStrictEqual([]);
  });
});

describe('code hygiene', () => {
  it('flags type escapes', () => {
    expect(rulesBroken(SERVER, '// @ts-ignore')).toStrictEqual(['no-type-escape']);
  });

  it('flags TODOs without an issue but accepts linked ones', () => {
    expect(rulesBroken(SERVER, '// TODO: later')).toStrictEqual(['todo-needs-issue']);
    expect(rulesBroken(SERVER, '// TODO(#42): handle archived projects')).toStrictEqual([]);
  });

  it('flags relative imports that leave the workspace', () => {
    expect(
      rulesBroken(SERVER, "import { x } from '../../../../../../packages/core/src/x.ts';"),
    ).toStrictEqual(['no-relative-import-across-packages']);
    expect(rulesBroken(SERVER, "import { x } from '../../../platform/http/zod.ts';")).toStrictEqual(
      [],
    );
  });
});

describe('front-end rules', () => {
  it('flags dark variants', () => {
    expect(rulesBroken(WEB, 'const c = "bg-surface dark:bg-black";')).toContain('light-theme-only');
  });

  it.each([
    '<div className="bg-[#0f766e]" />',
    "const style = { color: '#fff' };",
    '<p className="text-[rgb(0,0,0)]" />',
  ])('flags raw colors: %s', (source) => {
    expect(rulesBroken(WEB, source)).toContain('design-tokens-only');
  });

  it('accepts anchors that look like hex', () => {
    expect(rulesBroken(WEB, '<a href="#add">{t("x")}</a>')).not.toContain('design-tokens-only');
  });

  it.each([
    '<h1>Issues</h1>',
    '<button aria-label="Close">{icon}</button>',
    '<input placeholder="Search…" />',
    '<img alt="Logo" src={src} />',
  ])('flags hardcoded text: %s', (source) => {
    expect(rulesBroken(WEB, source)).toContain('no-hardcoded-ui-text');
  });

  it.each([
    '<h1>{t("nav.issues")}</h1>',
    '<button aria-label={t("nav.close")}>{icon}</button>',
    '<div className="flex items-center">{children}</div>',
    '<span> · </span>',
    '<svg viewBox="0 0 32 32"><path d="M0 0" /></svg>',
  ])('accepts %s', (source) => {
    expect(rulesBroken(WEB, source)).not.toContain('no-hardcoded-ui-text');
  });

  it('reports the line of the hardcoded text', () => {
    const [violation] = checkFile(WEB, ['<div>', '  {x}', '  Hello', '</div>'].join('\n'));
    expect(violation?.line).toBe(3);
  });
});

describe('workspaceRoot', () => {
  it.each([
    ['apps/web/src/main.tsx', 'apps/web'],
    ['packages/core/src/index.ts', 'packages/core'],
    ['plugins/github/src/index.ts', 'plugins/github'],
    ['scripts/src/check.ts', 'scripts'],
    ['e2e/tests/shell.spec.ts', 'e2e'],
  ])('%s → %s', (path, root) => {
    expect(workspaceRoot(path)).toBe(root);
  });
});
