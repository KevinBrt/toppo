import { describe, expect, it } from 'vitest';
import { effectiveProperties } from './project-properties.ts';

const version = { id: 'version', projectId: null };
const team = { id: 'team', projectId: null };
const sprint = { id: 'sprint', projectId: 'web' };
const elsewhere = { id: 'region', projectId: 'api' };
const option = (propertyId: string, name: string, projectId: string | null = null) => ({
  propertyId,
  projectId,
  name,
});
const options = [
  option('version', '1.2'),
  option('version', '1.3'),
  option('version', 'web-2.0', 'web'),
  option('version', 'api-9', 'api'),
  option('team', 'Web'),
  option('sprint', 'S1'),
  option('region', 'EU'),
];
const names = (properties: readonly { id: string; options: readonly { name: string }[] }[]) =>
  properties.map(({ id, options: own }) => [id, own.map(({ name }) => name)]);

describe("a project's properties", () => {
  it("are the instance's with their options, then its own, never another project's", () => {
    expect(
      names(effectiveProperties('web', [version, team, sprint, elsewhere], options, [])),
    ).toEqual([
      ['version', ['1.2', '1.3']],
      ['team', ['Web']],
      ['sprint', ['S1']],
    ]);
  });

  it('leave out those it hides, and take its own options where it has them', () => {
    const adaptations = [
      { propertyId: 'team', hidden: true, ownOptions: false },
      { propertyId: 'version', hidden: false, ownOptions: true },
    ];

    expect(
      names(effectiveProperties('web', [version, team, sprint], options, adaptations)),
    ).toEqual([
      ['version', ['web-2.0']],
      ['sprint', ['S1']],
    ]);
    expect(names(effectiveProperties('api', [version, team], options, []))).toEqual([
      ['version', ['1.2', '1.3']],
      ['team', ['Web']],
    ]);
  });
});
