# Properties and fields

Beyond its status, an issue is described by fields: a **priority**, a **category**, **labels**, and the **properties** your team adds, such as a version, a platform, a due date or an estimate. They are managed in **Settings › Issue properties**, by whoever holds _Instance settings_; each project adapts them in its own **Properties** tab, with _Project settings_.

The rule is the same as for [workflows](./workflows): the instance sets the defaults, and each project adapts what it needs, one property at a time. Priorities, categories and labels are the exception: one list for the whole instance.

## Priorities

Four levels, from low to urgent, each with its bars and its color: **Low**, **Normal**, **High** and **Urgent**. Their number and colors are fixed, so that "urgent" reads the same everywhere; rename them as your team says them, and choose the one new issues get. Normal is the default.

## Categories

What kind of issue it is: **Bug**, **Request** or **Question** on a fresh instance, Request being the default. An instance has 1 to 20 categories, each with a name, a color and an order, and one of them by default. A category stays as long as issues have it.

## Labels

Free tags, as many per issue as you like: a component, a customer, a sprint. Each has a name and a color, 100 at most; a fresh instance has none. Removing a label takes it off its issues, whose history keeps its name. Labels are the same in every project.

## Properties

**New property** adds one, of one of seven types:

| Type             | Holds                           |
| ---------------- | ------------------------------- |
| **List**         | One option of a list            |
| **Multi-select** | Several options of a list       |
| **Text**         | A line, 500 characters at most  |
| **Number**       | A number, decimals allowed      |
| **Date**         | A calendar day                  |
| **Person**       | Someone who reaches the project |
| **Checkbox**     | Ticked or not                   |

A property keeps its type: to change it, create another one. Each property also chooses:

- **Shown in the issue list**: its value appears beside each issue's subject.
- **Asked when an issue is reported**: it is on the form of a new issue.
- **Required**: it must be filled when an issue is reported (only for a property asked then; never for a checkbox).

Lists and multi-selects hold 1 to 100 options, each with a name and a color. Removing an option takes it off its issues; their history keeps its name. **Delete the property** removes its values from every issue, each change recorded in their history.

An instance holds 20 properties, and each project 20 more of its own. Every issue can be filtered by its properties, except lines of text: see [filters](./finding-issues#filters).

## In a project

A project's **Properties** tab lists the organization's fields, then its own.

- **Priority and category** may be **Hidden in this project** (its issues keep the default) or **Required at creation** (nothing is preselected: whoever reports chooses).
- **An organization property** may be **Hidden in this project**: it leaves the project's forms, list and issues, and its values wait, untouched. A list or multi-select may take **Options of its own**, starting as a copy of the organization's; going back to the organization's options takes the project's own off its issues. Its name and settings stay the organization's.
- **This project's own** properties are created, set and deleted as the organization's are, and exist in this project only.
