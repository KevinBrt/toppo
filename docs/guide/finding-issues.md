# Finding issues

## The issue list

**Issues** lists a project's issues, 50 a page: its open issues, the newest first, unless you choose otherwise. Switch project from the top bar. What the list shows grows with the screen: the key, subject and status always, then the priority, the last change and the assignee, then the requester and the category. The properties set to show in the list appear beside the subject, with the issue's labels.

Every choice below is kept in the page's address: copy it to share exactly what you see, or bookmark it. Toppo has no saved views of its own; the address is the view.

## Filters

The toolbar narrows the list, left to right:

- **Search issues**: words of the subject or the description (see [search](#search)).
- **State**: **Open** (the default), **Closed** or **All**. An issue is closed while its status closes it.
- **Status**, **Priority**, **Category**, **Labels**: tick one value or several.
- **Assignee**: **Me**, **Unassigned**, or people. **Requester**: **Me**, or people, for those who see every issue of the project.
- **+ Property**: a filter on one of the project's properties. Lists, multi-selects and people offer their values and **None**; a box is **Ticked** or **Not ticked**; numbers and dates take a range, **From** and **To**, either end left empty if you like. Lines of text are not filtered.

Values of one filter add up (this status _or_ that one); different filters narrow each other (this status _and_ this assignee). **Clear the filters** goes back to the open issues, keeping the sort.

## Sorting and grouping

Click a column header to sort by it, again to reverse: by key, subject, requester, assignee, category, priority, status or last change. Statuses and categories sort in the order the settings give them, priorities from the most urgent, people by name, the unassigned last. On a phone, the **Sort** menu does the same.

**Group** gathers the issues by **Status**, **Priority** or **Assignee**, each group with its count. Issues are sorted within each group.

## Search

The search reads the subject and the description of the issues you may see:

- **Words, wherever they start**: `crash sav` finds "Crash on save"; every word typed must be there. Case and accents do not count.
- **Inside the subject**: part of a word or a path, such as `/api/login`.
- **Typos**: a word no issue has is read as the closest ones the project's issues do have (`paiment` finds "payment"), one letter wrong in a short word, two in a longer one. Only in projects where you see every issue.
- **Keys**, however they are typed: `WEB-42`, `web 42`, `web42`, `#42` or `42`.

In the list, the search keeps to the project and to the sort you chose. The [command palette](./getting-around#the-command-palette) searches every project you see and ranks what it finds: the issue named by its key first, then the words as typed, then the typos.

## Many issues at once

Tick issues in the list, or the whole page, and a bar offers what to change for all of them: the status, priority, category or assignee, a label to add or remove, or deleting them, each offered if you hold the permission it takes on one issue. Each action says what will happen and asks you to confirm; it applies to 100 issues at most.

Each issue takes the change as if it were made on it alone: its history records it, and its followers are told. Those that may not take it (a status their workflow does not allow from theirs, an issue deleted meanwhile) are named afterwards, with the reason, and stay ticked.
