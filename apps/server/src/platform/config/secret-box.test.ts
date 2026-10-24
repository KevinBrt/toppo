import { describe, expect, it } from 'vitest';
import { createSecretBox } from './secret-box.ts';

const KEY = 'an instance key long enough to sign sessions';

describe('the secret box', () => {
  it('opens what it sealed, never the same way twice', () => {
    const box = createSecretBox(KEY);
    const once = box.seal('smtp password');
    const twice = box.seal('smtp password');

    expect(once).not.toContain('smtp password');
    expect(once).not.toBe(twice);
    expect(box.open(once)).toBe('smtp password');
    expect(box.open(twice)).toBe('smtp password');
  });

  it('opens nothing sealed with another key, changed, or of another format', () => {
    const sealed = createSecretBox(KEY).seal('smtp password');
    const [format, iv, tag, data = ''] = sealed.split('.');
    const changed = [format, iv, tag, `${data.startsWith('A') ? 'B' : 'A'}${data.slice(1)}`];

    expect(createSecretBox(`${KEY}, changed`).open(sealed)).toBeNull();
    expect(createSecretBox(KEY).open(changed.join('.'))).toBeNull();
    expect(createSecretBox(KEY).open(`v0.${iv}.${tag}.${data}`)).toBeNull();
    expect(createSecretBox(KEY).open('not sealed')).toBeNull();
  });
});
