# Projects

Every issue belongs to a project: a product, a client, a team. A project has a name, a color and a **key**, which starts the number of each of its issues: the project `WEB` holds `WEB-1`, `WEB-2`…

## Creating a project

In **Projects**, click **New project**. It takes the permission _Create projects_, which only the Administrator role holds by default.

- **Name**: 80 characters at most.
- **Key**: 2 to 10 capital letters or digits, starting with a letter, and unique in the instance. Toppo proposes one from the name (`Website` gives `WEB`, `Customer portal` gives `CP`) until you type your own.
- **Description**: optional, 1,000 characters at most, shown to the project's members.

You reach the project with your own role, and Toppo opens its settings. Nobody else reaches it yet: give others [access](./members#project-access).

The key can change until the project's first issue exists, never after: an issue's key, once written in an email or a commit, must keep pointing to it. Numbers are never reused either, even after an issue is deleted.

## A project's settings

Open **Projects**, then a project. Its tabs show to those who hold the permission each needs:

| Tab            | Permission         | What it holds                                                                                            |
| -------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| **General**    | _Project settings_ | Name, key, color, description; archiving and deleting                                                    |
| **Access**     | _Project access_   | Who reaches the project, and with which role: see [members and access](./members#project-access)         |
| **Statuses**   | _Project settings_ | The organization's workflow, or the project's own: see [workflows](./workflows#a-project-s-own-workflow) |
| **Properties** | _Project settings_ | Which fields the project's issues have: see [properties](./properties#in-a-project)                      |

The **Projects** screen lists the projects you manage, active or archived, and searches them by key or name.

## Archiving a project

In **General › Danger zone**, **Archive** puts a finished project away. An archived project is read-only: its issues stay, can be opened and read, but nothing changes in it any more. It leaves the project switcher, **My issues** and the search. **Unarchive** brings it back as it was.

## Deleting a project

In **General › Danger zone**, **Delete** removes the project, its issues and their history, for good. It takes the permission _Delete projects_ and asks you to type the project's key to confirm. Archive rather than delete what you may want to read again.
