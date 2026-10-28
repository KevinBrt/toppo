import { PROPERTY_TEXT_MAX_LENGTH } from '@toppo-tracker/shared';
import { describe, expect, it } from 'vitest';
import { choiceOf, formProblems, valueOfDraft, valuesOfDrafts } from './new-issue-form.model.ts';

const settings = (required: boolean) => ({
  category: { hidden: false, required },
  priority: { hidden: false, required },
});

const V12 = '01a1569b-9900-7000-8000-000000000012';
const ADA = { id: '01a1569b-9900-7000-8000-000000000031', name: 'Ada' };

describe('the new issue form', () => {
  it('holds the choice, else the default, or nothing when the project asks for a choice', () => {
    const options = [
      { id: 'low', isDefault: false },
      { id: 'normal', isDefault: true },
    ];

    expect(choiceOf('', options, false)).toBe('normal');
    expect(choiceOf('low', options, false)).toBe('low');
    expect(choiceOf('', options, true)).toBe('');
    expect(choiceOf('low', options, true)).toBe('low');
    expect(choiceOf('', undefined, false)).toBe('');
  });

  it('gives a value from what each field holds, none from an empty one', () => {
    expect(valueOfDraft('list', V12)).toBe(V12);
    expect(valueOfDraft('multiSelect', [V12])).toStrictEqual([V12]);
    expect(valueOfDraft('text', '  ACME ')).toBe('ACME');
    expect(valueOfDraft('number', '2.5')).toBe(2.5);
    expect(valueOfDraft('date', '2026-11-02')).toBe('2026-11-02');
    expect(valueOfDraft('user', ADA)).toBe(ADA.id);
    expect(valueOfDraft('checkbox', true)).toBe(true);
    for (const empty of ['', '   ', [], null, false, undefined]) {
      expect(valueOfDraft('text', empty)).toBeUndefined();
    }
  });

  it('sends the values of the fields that give one', () => {
    const asked = [
      { id: 'version', type: 'list' as const },
      { id: 'estimate', type: 'number' as const },
      { id: 'blocking', type: 'checkbox' as const },
    ];

    expect(valuesOfDrafts(asked, { version: V12, estimate: '', blocking: true })).toStrictEqual({
      version: V12,
      blocking: true,
    });
  });

  it('needs the properties required and the fields the project asks for', () => {
    const asked = [
      { id: 'version', type: 'list' as const, required: true },
      { id: 'team', type: 'list' as const, required: false },
    ];

    expect(
      formProblems({
        asked,
        drafts: {},
        settings: settings(true),
        priorityId: '',
        categoryId: '',
      }),
    ).toStrictEqual({
      'property.version': 'required',
      priorityId: 'required',
      categoryId: 'required',
    });
    expect(
      formProblems({
        asked,
        drafts: { version: V12 },
        settings: settings(false),
        priorityId: '',
        categoryId: '',
      }),
    ).toStrictEqual({});
  });

  it('refuses a value its type cannot take', () => {
    const asked = [
      { id: 'reference', type: 'text' as const, required: false },
      { id: 'estimate', type: 'number' as const, required: false },
    ];

    expect(
      formProblems({
        asked,
        drafts: { reference: 'a'.repeat(PROPERTY_TEXT_MAX_LENGTH + 1), estimate: '1e99' },
        settings: settings(false),
        priorityId: '',
        categoryId: '',
      }),
    ).toStrictEqual({ 'property.reference': 'invalid', 'property.estimate': 'invalid' });
  });
});
