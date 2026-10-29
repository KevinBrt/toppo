# Roles and permissions

What each person may do comes from their **role**, made of permissions you choose. Toppo never checks a role's name: rename roles as your organization speaks, change what they allow, or create your own. They are managed in **Settings › Roles and permissions**, by administrators.

## The roles to start with

| Role              | What it allows                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Administrator** | Everything, now and to come. It cannot be changed or deleted, and Toppo always keeps one active administrator.         |
| **Team**          | Sees every issue of the projects it reaches; creates, edits and assigns issues, and comments. Told of every new issue. |
| **Requester**     | Sees only the issues it reported; reports issues and comments. For your customers or the rest of your organization.    |

Team and Requester are a starting point: change them, rename them or delete them.

## The permissions

The matrix shows every role side by side (one at a time on a phone). Changes wait in a bar until you **Save** them, all together.

**Issues**, **Conversation** and **Project** apply in each project the person reaches:

| Permission          | What it allows                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| _See issues_        | **None**, **Their own** (the issues they reported) or **All**                                              |
| _Create issues_     | Report issues                                                                                              |
| _Edit issues_       | Change an issue's subject, description, status, priority, category, labels and properties; mark duplicates |
| _Assign issues_     | Choose who an issue is assigned to, and fill the properties of the Person type                             |
| _Delete issues_     | Delete issues for good                                                                                     |
| _Comment_           | Write comments, and edit one's own                                                                         |
| _Moderate comments_ | Delete anyone's comments                                                                                   |
| _Project settings_  | Rename or archive a project, adapt its workflow and its properties                                         |
| _Project access_    | Choose who reaches a project, and with which role                                                          |

**Organisation** applies to the whole instance:

| Permission          | What it allows                                                             |
| ------------------- | -------------------------------------------------------------------------- |
| _Manage members_    | Invite people, change their role, deactivate or delete them                |
| _Create projects_   | Create projects                                                            |
| _Delete projects_   | Delete projects for good                                                   |
| _Instance settings_ | The organization's workflow, properties, priorities, categories and labels |
| _Email settings_    | The mail server (administrators only)                                      |
| _Manage roles_      | This screen (administrators only)                                          |

**New issues**, under **Notifications**, is no permission: it tells the role's members of every new issue they can see.

## A role in a project

Each person has a role of their own, which gives them its organisation permissions everywhere, and its project permissions in every project they reach. A project may give them another role: it replaces their project permissions there, and only there. A requester can be a full member of one project, for instance. See [members and access](./members#project-access).

## Creating and deleting roles

**New role** asks for a name and a color; a new role allows nothing until you tick its permissions. An instance holds 20 roles. A role cannot be deleted while a member, an invitation or a project still uses it: the dialog says which.

## Never more than you hold

Whoever gives access cannot give more than they hold: in a project, you only give, or change the role of someone holding, a role whose project permissions you hold there yourself. Only administrators give the Administrator role, or act on an administrator. Nobody changes their own role.
