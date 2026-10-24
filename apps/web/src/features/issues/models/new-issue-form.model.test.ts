import { describe, expect, it } from 'vitest';
import { choiceOf, missingChoices } from './new-issue-form.model.ts';

const settings = (required: boolean) => ({
  category: { hidden: false, required },
  priority: { hidden: false, required },
});

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

  it('needs the properties required and the fields the project asks for', () => {
    const asked = [
      { id: 'version', required: true },
      { id: 'team', required: false },
    ];

    expect(
      missingChoices({
        asked,
        values: {},
        settings: settings(true),
        priorityId: '',
        categoryId: '',
      }),
    ).toStrictEqual(['property.version', 'priorityId', 'categoryId']);
    expect(
      missingChoices({
        asked,
        values: { version: '1.2' },
        settings: settings(false),
        priorityId: '',
        categoryId: '',
      }),
    ).toStrictEqual([]);
  });
});
