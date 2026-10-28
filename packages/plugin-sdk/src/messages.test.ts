import { describe, expect, it } from 'vitest';
import { translate } from './messages.ts';

const messages = {
  panel: { title: 'Time spent', total: '{minutes} minutes by {who}' },
  done: 'Done',
};

describe('a plugin’s messages', () => {
  it('are found by their dotted key, their params filled in', () => {
    expect(translate(messages, 'panel.title')).toBe('Time spent');
    expect(translate(messages, 'panel.total', { minutes: 90, who: 'Ada' })).toBe(
      '90 minutes by Ada',
    );
    expect(translate(messages, 'done')).toBe('Done');
  });

  it('show their key when the language lacks one, and a param left out as it is written', () => {
    expect(translate(messages, 'panel.missing')).toBe('panel.missing');
    expect(translate(messages, 'done.deeper')).toBe('done.deeper');
    expect(translate(messages, 'panel')).toBe('panel');
    expect(translate(messages, 'panel.total', { minutes: 5 })).toBe('5 minutes by {who}');
  });
});
