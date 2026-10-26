import { DEFAULT_ROLE_IDS } from '@toppo/core';
import { createTestDatabase } from '@toppo/testing';
import { desc, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './database.ts';
import { issueWords, projects, users } from './schema/index.ts';
import { containsText, escapeLike, matchesWords, similarWords, wordsRank } from './search.ts';
import { uuidv7 } from './uuid.ts';

let database: Database;

const NAMES = [
  'Éloïse Martin',
  'àáâãäå ç èéêë ìíîï ñ òóôõö ùúûü ýÿ ÀÁÂÃÄÅ Ç ÈÉÊË ÌÍÎÏ Ñ ÒÓÔÕÖ ÙÚÛÜ Ý',
  'Sale 50% off',
  'Under_score',
  'Back\\slash',
];

async function namesMatching(term: string): Promise<string[]> {
  const rows = await database.db
    .select({ name: users.name })
    .from(users)
    .where(containsText([users.name, users.email], term));
  return rows.map(({ name }) => name).sort();
}

beforeAll(async () => {
  database = createDatabase({ url: (await createTestDatabase()).url, maxConnections: 2 });
  await database.db.insert(users).values(
    NAMES.map((name, index) => ({
      id: uuidv7(),
      name,
      email: `person${index}@example.com`,
      instanceRoleId: DEFAULT_ROLE_IDS.team,
    })),
  );
});

afterAll(async () => {
  await database.close();
});

describe('containsText', () => {
  it('ignores case and accents, on both sides', async () => {
    expect(await namesMatching('eloise')).toStrictEqual(['Éloïse Martin']);
    expect(await namesMatching('ÉLOÏSE')).toStrictEqual(['Éloïse Martin']);
  });

  it('folds every accented letter it knows to its base letter', async () => {
    expect(
      await namesMatching('aaaaaa c eeee iiii n ooooo uuuu yy aaaaaa c eeee iiii n ooooo uuuu y'),
    ).toHaveLength(1);
  });

  it('searches every column given', async () => {
    expect(await namesMatching('person0@')).toStrictEqual(['Éloïse Martin']);
  });

  it('treats LIKE wildcards as plain characters', async () => {
    expect(await namesMatching('50%')).toStrictEqual(['Sale 50% off']);
    expect(await namesMatching('%')).toStrictEqual(['Sale 50% off']);
    // As a wildcard, _ would find "Sale".
    expect(await namesMatching('sa_e')).toStrictEqual([]);
    expect(await namesMatching('_')).toStrictEqual(['Under_score']);
    expect(await namesMatching('\\')).toStrictEqual(['Back\\slash']);
  });
});

describe('escapeLike', () => {
  it('escapes the backslash, then the wildcards', () => {
    expect(escapeLike('a\\b%c_d')).toBe('a\\\\b\\%c\\_d');
  });
});

/** The words of a person, as issues keep theirs: the name weighs more than the email. */
const personWords = sql`setweight(to_tsvector('simple', fold_text(${users.name})), 'A') || setweight(to_tsvector('simple', fold_text(${users.email})), 'B')`;

async function namesWithWords(term: string): Promise<string[]> {
  const rows = await database.db
    .select({ name: users.name })
    .from(users)
    .where(matchesWords(personWords, term))
    .orderBy(desc(wordsRank(personWords, term)));
  return rows.map(({ name }) => name);
}

describe('matchesWords', () => {
  it('finds words by their start, ignoring case and accents', async () => {
    expect(await namesWithWords('ELO')).toStrictEqual(['Éloïse Martin']);
    expect(await namesWithWords('mart éloï')).toStrictEqual(['Éloïse Martin']);
  });

  it('needs every word typed', async () => {
    expect(await namesWithWords('sale off')).toStrictEqual(['Sale 50% off']);
    expect(await namesWithWords('sale martin')).toStrictEqual([]);
  });

  it('reads only letters and digits, never full-text syntax', async () => {
    expect(await namesWithWords("50%! & | :* ' off")).toStrictEqual(['Sale 50% off']);
    expect(matchesWords(personWords, ' %& ')).toBeUndefined();
  });

  it('ranks the heavier words first', async () => {
    await database.db.insert(users).values({
      id: uuidv7(),
      name: 'Person Zero',
      email: 'zero@example.com',
      instanceRoleId: DEFAULT_ROLE_IDS.team,
    });

    const [named, ...emailed] = await namesWithWords('person');

    expect(named).toBe('Person Zero');
    expect(emailed.toSorted()).toStrictEqual(NAMES.toSorted());
  });
});

describe('similarWords', () => {
  const [billing, support, secret] = [uuidv7(), uuidv7(), uuidv7()];

  beforeAll(async () => {
    await database.db.insert(projects).values([
      { id: billing, key: 'BIL', name: 'Billing' },
      { id: support, key: 'SUP', name: 'Support' },
      { id: secret, key: 'SEC', name: 'Secret' },
    ]);
    const words = (projectId: string, list: readonly string[]) =>
      list.map((word) => ({ id: uuidv7(), projectId, word }));
    await database.db
      .insert(issueWords)
      .values([
        ...words(billing, ['facture', 'paiement', 'export']),
        ...words(support, ['payment', 'erreur', 'paiement']),
        ...words(secret, ['marmalade', 'paimentrecu']),
      ]);
  });

  it('corrects the words no issue has to the closest ones issues have', async () => {
    expect(await similarWords(database.db, 'Facutre paiment', [billing, support])).toStrictEqual(
      new Map([
        ['Facutre', ['facture']],
        ['paiment', ['paiement', 'payment']],
      ]),
    );
  });

  it('leaves the words issues have, start, or are too short to correct', async () => {
    expect(
      await similarWords(database.db, 'export fact erur zzzzzz', [billing, support]),
    ).toStrictEqual(new Map());
    expect(await similarWords(database.db, ' %& ', [billing])).toStrictEqual(new Map());
  });

  it('reads only the words of the projects given, so that others tell nothing', async () => {
    // Corrected to no word of another project, and as if theirs were not there: a secret word
    // starting with `paiment` does not stop the correction.
    expect(await similarWords(database.db, 'marmalada', [billing])).toStrictEqual(new Map());
    expect(await similarWords(database.db, 'paiment', [billing])).toStrictEqual(
      new Map([['paiment', ['paiement']]]),
    );
    expect(await similarWords(database.db, 'marmalada', [secret])).toStrictEqual(
      new Map([['marmalada', ['marmalade']]]),
    );
    expect(await similarWords(database.db, 'Facutre', [])).toStrictEqual(new Map());
  });

  it('searches a word with those it stands for', async () => {
    const similar = new Map([['matrin', ['martin']]]);

    expect(
      await database.db
        .select({ name: users.name })
        .from(users)
        .where(matchesWords(personWords, 'matrin', similar)),
    ).toStrictEqual([{ name: NAMES[0] }]);
    expect(await namesWithWords('matrin')).toStrictEqual([]);
  });
});
