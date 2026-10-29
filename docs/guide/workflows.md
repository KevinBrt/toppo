# Workflows and statuses

A **workflow** is the list of statuses an issue goes through, and the moves allowed between them. The instance has one, which every project follows; a project may take a copy of its own and adapt it. Both are managed by whoever holds _Instance settings_ or, for a project, _Project settings_.

## Statuses

**Settings › Statuses** shows the organization's workflow. A status has:

- a **name**, 40 characters at most;
- a **color**, among eight;
- **Closes the issue**: an issue is closed while its status closes it. Moving to such a status closes it, moving back to another reopens it.

One status is the **initial status**, where every new issue starts: it cannot close issues. **Make it the initial status**, in a status's menu, changes it. Drag the statuses to order them: menus and the sort by status follow that order. A workflow holds 20 statuses at most.

On a fresh instance, the workflow is:

| Status      | Color  | Closes the issue | Moves to                     |
| ----------- | ------ | ---------------- | ---------------------------- |
| New         | cyan   |                  | To do, In progress, Resolved |
| To do       | blue   |                  | In progress, Resolved        |
| In progress | violet |                  | To do, Waiting, Resolved     |
| Waiting     | amber  |                  | In progress, Resolved        |
| Resolved    | green  | yes              | To do                        |

New is the initial status. Rename, recolor and reorder them as your team speaks.

## How issues move

**How issues move** is either:

- **Defined**: a grid of the moves allowed, from each status (rows) to each other (columns). An issue's status menu offers only those, and Toppo refuses any other move, from anyone, administrators included.
- **Free**: any status may follow any other. The moves you ticked are kept, for when you go back to **Defined**.

Changes wait in a bar at the bottom of the page until you **Save** them, all together, or **Discard** them.

## Removing a status

**Remove**, in a status's menu, takes it out of the workflow. When issues have it, Toppo asks which status they move to; each moved issue records the change in its history, and nobody is notified. The initial status, and the last status left, cannot be removed.

## A project's own workflow

In a project's **Statuses** tab, a project first follows the organization's workflow, shown read-only, and changes with it. **Customize for this project** gives it a copy:

- add statuses of its own, reorder them, remove the ones it does not use, choose its initial status, and set its own moves;
- the organization's statuses keep their name, color and closing: these change in **Settings › Statuses**, for every project at once.

A status added later to the organization's workflow does not appear in projects that customized theirs: add it there too if they need it.

**Go back to the organization's workflow** drops the copy. For each status the organization does not have, Toppo asks where its issues go.
