# Performance of the issue list and search

The issue list, its search and the search palette are checked on a database of realistic size, with the plans PostgreSQL actually runs. Run the check again after changing their queries or the indexes of `issues`.

## Running the check

```sh
npm run db:up                    # the test server (port 54330) must be up
npm run perf:issues              # builds the server, seeds, replays, reports (about 2 minutes)
npm run perf:issues -- --reuse   # replays on the database seeded by the last run
```

`scripts/src/perf/explain-issues.ts`:

1. creates `toppo_perf` on the test server, lets the built server migrate it, sets it up and invites a member (Grace, Team role) through the real flows;
2. seeds it with `scripts/src/perf/seed-issues.sql`, then `VACUUM ANALYZE`, as autovacuum leaves a table at rest;
3. turns on `auto_explain` (analyzed, with buffers) for that database only, and replays the requests of the list and the palette, as the administrator and as the member, each twice;
4. writes every plan to `postgres.log` and, request by request, the plans of the issue queries to `plans.txt` (both in the system temporary folder, `toppo-perf`);
5. without `auto_explain`, prints each request's best round trip of five.

## The data set

| What                 | How many                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Issues               | 100,012, 224 MB with their indexes                                                            |
| Properties           | a version on 80 %, a platform on 40 %, a due day and an estimate on 30 %, a box ticked on 5 % |
| Projects             | 30: one of 40,000 issues, one of 20,000, 28 of about 1,400                                    |
| People               | 202, each in about six projects; Grace in ten, the large one among them                       |
| Closed               | two issues in three                                                                           |
| Unassigned           | one in four                                                                                   |
| Priorities           | low 20 %, normal 50 %, high 20 %, urgent 10 %                                                 |
| Titles, descriptions | 4 to 9 words; 2 to 7 sentences                                                                |

Words are drawn as in real text: a hundred English and French words (accents included), the first ones far more often than the last, and one word in ten an error code (`E1000` to `E9999`), rare by nature. "erreur" is in 57 % of the issues, "facture" in 25 %, `E4821` in 60.

## Results

Round trips through the server (session, project, permissions and JSON included: about 13 ms for nothing), best of five, on Docker Desktop for Windows, PostgreSQL 18:

| Request                                                       | Time                 |
| ------------------------------------------------------------- | -------------------- |
| List of the large project: open, newest first (the default)   | 16 ms                |
| Same, as a member                                             | 14 ms                |
| All issues, page 300                                          | 63 ms                |
| Sorted by last change / by title / by assignee                | 25–34 ms             |
| Grouped by status, sorted by priority                         | 34 ms                |
| One assignee / the caller's own                               | 14–16 ms             |
| Searched: a common word / a rarer word / an error code        | 66 / 49 / 18 ms      |
| Searched: inside words (`chargem`) / a key (`BIG-12345`)      | 23 / 8 ms            |
| A version / no version / a platform / a box ticked            | 21 / 25 / 21 / 21 ms |
| Two property filters (a version and a platform)               | 20 ms                |
| Due within a month / an estimate from 3 to 5                  | 40 / 47 ms           |
| Palette: a common word / a rarer word / an error code / a key | 70 / 48 / 11 / 11 ms |
| Palette as a member: a common word / two words                | 69 / 149 ms          |
| My issues                                                     | 16 ms                |

## What the plans taught

- **Sort in the order indexes can be read in.** `desc nulls last` on a column that is never null does not match a btree read backwards (`desc nulls first`): the default list read the whole table and sorted 14,000 rows to show 50 (38 ms for the query, 0.4 ms now). Only the assignee, which may be missing, sorts `nulls last`.
- **Plan each run with its own values.** postgres.js prepares statements, and after five runs PostgreSQL may keep one generic plan, made without the values: blind to how rare a searched word is, it picked a whole-table scan. Toppo's connections set `plan_cache_mode = force_custom_plan` (`packages/db/src/database.ts`).
- **A searched list never follows the numbers' index.** PostgreSQL estimates words typed in part (`e4821:*`) poorly; reading the index backwards until a page is full went through the whole large project for a code found 27 times (240 ms, and more for a word not found at all). Sorted by number, a searched list sorts on `number + 0`, which no index holds: the matches are always gathered through the search indexes first. A very common word costs a little more (61 ms instead of 45), a rare one far less.
- **Rank the best few before fetching their fields.** The palette ranked and joined the fields of every match when PostgreSQL thought there were few; it now picks the ten best from the issues and their projects alone, then joins the fields of those ten (141 ms for two common words, 58 ms now).
- **Count from an index.** Every list shows how many issues match; counting a project's open issues read the table (14 ms for the large project). `issues (project_id, closed_at)` (migration 0025) counts them from the index alone (1.4 ms).
- **Work out the page's rows only.** An offset still produces every row before the page, the columns worked out by subqueries included: page 300 built the labels and property values of the 15,000 issues it skipped (1,077 ms). The list now picks the page's ids first, then reads those 50 issues with their labels and values (63 ms).
- **Filter properties through the index of their values.** Options, people and boxes are containment tests on `issues.properties` (`@>`), which its GIN index (`jsonb_path_ops`) answers; "no value" is `@?` on the property's path. Ranges of numbers and days compare each issue's value within the project, guarded by its JSON type, days as text in the `C` collation.

## Known limits

- Pages are reached by offset: page 300 of the large project reads the 15,000 issues before it (63 ms). Deep pages are rare; keyset pagination would remove the cost if they became common.
- A range of numbers or days reads every issue of the project the other filters keep: about 45 ms at 40,000 issues, in proportion beyond. An expression index per property would remove it, at the cost of one index per property.
- The member's palette search for two common words ranks and checks the access to every match (27,000 here): 149 ms, up from 58 ms since rows carry their property values and the table grew from 132 to 224 MB.
- Sorting by a column of another table (priority, status, category, people, title) sorts every matching issue of the project: 30 to 60 ms at 40,000 issues, in proportion beyond.
- Searching a word found in half of all issues ranks all of them: about 60 ms at 100,000 issues, in proportion beyond. Words typed one letter at a time wait for typing to pause (300 ms in the list, 200 ms in the palette).
