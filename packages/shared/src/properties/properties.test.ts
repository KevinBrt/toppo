import { describe, expect, it } from 'vitest';
import {
  createPropertyRequestSchema,
  issuePropertyRequestSchema,
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
