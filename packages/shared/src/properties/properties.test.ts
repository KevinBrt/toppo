import { describe, expect, it } from 'vitest';
import {
  createPropertyRequestSchema,
  PROPERTY_TYPES,
  projectFieldsSchema,
  propertyAdaptationRequestSchema,
  updatePropertyRequestSchema,
} from './properties.ts';

const ID = '01a1569b-9900-7000-8000-000000000001';
const fields = { name: 'Version', shownInList: false, askedAtCreation: true, required: true };

describe('a new property', () => {
  const create = (overrides: object) =>
    createPropertyRequestSchema.safeParse({
      ...fields,
      type: 'list',
      options: [{ name: '1.2', color: 'blue' }],
      ...overrides,
    }).success;

  it('has a name, options of its own names, and is required only if asked at creation', () => {
    expect(create({})).toBe(true);
    expect(create({ askedAtCreation: false, required: false })).toBe(true);
    expect(create({ askedAtCreation: false, required: true })).toBe(false);
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

  it.each(PROPERTY_TYPES)(
    'of type %s has options only if it is a list or a multi-select',
    (type) => {
      const withOptions = type === 'list' || type === 'multiSelect';
      const required = type !== 'checkbox';

      expect(create({ type, required })).toBe(withOptions);
      expect(create({ type, required, options: [] })).toBe(!withOptions);
      expect(create({ type, required, options: undefined })).toBe(!withOptions);
    },
  );

  it('is never a checkbox that must be ticked', () => {
    expect(create({ type: 'checkbox', options: [], required: true })).toBe(false);
    expect(create({ type: 'checkbox', options: [], required: false })).toBe(true);
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
    // A property without options saves none: its type is checked once it is found.
    expect(save({ options: [] })).toBe(true);
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
