import * as schema from './schema/index.ts';

export { createDatabase, type Database, type DatabaseOptions, type Db } from './database.ts';
export { isUniqueViolation } from './errors.ts';
export {
  containsText,
  escapeLike,
  matchesWords,
  type SimilarWords,
  similarWords,
  wordsRank,
} from './search.ts';
export { uuidv7 } from './uuid.ts';
export { type WaitForDatabaseOptions, waitForDatabase } from './wait-for-database.ts';
export { schema };
