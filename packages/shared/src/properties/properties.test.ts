import { describe, expect, it } from 'vitest';
import {
  createPropertyRequestSchema,
  issuePropertyRequestSchema,
  projectFieldsSchema,
  propertyAdaptationRequestSchema,
  updatePropertyRequestSchema,
} from './properties.ts';

const ID = '01a1569b-9900-7000-8000-000000000001';
const fields = { name: 'Version', shownInList: false, askedAtCreation: true, required: true };

describe('a new property', () => {
  it('has a name, options of its own names, and is required only if asked at creation', () => {
    const create = (overrides: object) =>
      createPropertyRequestSchema.safeParse({
        ...fields,
        type: 'list',
        options: [{ name: '1.2', color: 'blue' }],
        ...overrides,
      }).success;

    expect(create({})).toBe(true);
    expect(create({ askedAtCreation: false, required: false })).toBe(true);
    expect(create({ askedAtCreation: false, required: true })).toBe(false);
    expect(create({ options: [] })).toBe(false);
    expect(
      create({
        options: [
          { name: '1.2', color: 'blue' },
          { name: '1.2', color: 'green' },
        ],
      }),
    ).toBe(false);
    expect(create({ name: '  ' })).toBe(false);
  });
});

describe('a property saved', () => {
  it('names the options it removes, never one it keeps', () => {
    const save = (overrides: object) =>
      updatePropertyRequestSchema.safeParse({
        ...fields,
        options: [{ id: ID, name: '1.2', color: 'blue' }],
        removed: [],
        ...overrides,
      }).success;

    expect(save({})).toBe(true);
    expect(save({ removed: [ID] })).toBe(false);
    expect(save({ askedAtCreation: false })).toBe(false);
  });
});

describe('the value given to an issue', () => {
  it('is an option, or none', () => {
    expect(issuePropertyRequestSchema.safeParse({ optionId: ID }).success).toBe(true);
    expect(issuePropertyRequestSchema.safeParse({ optionId: null }).success).toBe(true);
    expect(issuePropertyRequestSchema.safeParse({ optionId: 'v1' }).success).toBe(false);
  });
});

describe('how a project adapts the fields', () => {
  it('hides a field or requires it, never both', () => {
    const settings = (category: { hidden: boolean; required: boolean }) => ({
      category,
      priority: { hidden: false, required: false },
    });

    expect(projectFieldsSchema.safeParse(settings({ hidden: true, required: false })).success).toBe(
      true,
    );
    expect(projectFieldsSchema.safeParse(settings({ hidden: false, required: true })).success).toBe(
      true,
    );
    expect(projectFieldsSchema.safeParse(settings({ hidden: true, required: true })).success).toBe(
      false,
    );
  });

  it('gives a property options of its own, never keeping one it removes', () => {
    const kept = ID;
    const removed = '01a1569b-9900-7000-8000-000000000002';
    const adaptation = (removedIds: string[]) => ({
      hidden: false,
      options: {
        options: [
          { id: kept, name: '1.3', color: 'blue' },
          { name: '2.0', color: 'green' },
        ],
        removed: removedIds,
      },
    });

    expect(propertyAdaptationRequestSchema.safeParse(adaptation([removed])).success).toBe(true);
    expect(propertyAdaptationRequestSchema.safeParse(adaptation([kept])).success).toBe(false);
    expect(propertyAdaptationRequestSchema.safeParse({ hidden: true, options: null }).success).toBe(
      true,
    );
  });
});
