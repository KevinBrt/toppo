# Issues

An issue is something to do or to answer: a bug, a request, a question. It has a key (`WEB-42`), a subject, a description, and the fields that sort it: its status, priority, category, labels, assignee and the project's properties. The person who reported it is its **requester**.

## Reporting an issue

In **Issues**, choose the project in the top bar, then click **New issue**. It takes the permission _Create issues_.

- **Subject**: required, 200 characters at most.
- **Description**: optional, written in [Markdown](#the-description), 50,000 characters at most.
- **Attachments**: files to send with it, dropped on the form or chosen.
- **Properties**: the priority and the category, preset to their defaults unless the project requires you to choose; and the properties the project asks when an issue is reported, some of them required.

**Create the issue** opens it. It starts in the workflow's initial status, unassigned: its assignee and labels are set on the issue itself.

## The issue page

The header holds the subject, who opened it and when, its status and **Follow**. The status menu only offers the statuses the workflow allows next. **More actions** marks it as a duplicate or deletes it.

The **Properties** panel shows and changes its status, priority, assignee, category, labels and properties. A change shows at once; if Toppo refuses it, it is put back with the reason.

| To change                                         | It takes                                             |
| ------------------------------------------------- | ---------------------------------------------------- |
| The subject, the description, the request's files | Being its requester, or _Edit issues_                |
| Status, priority, category, labels, properties    | _Edit issues_, even on an issue you reported         |
| The assignee, a property of the Person type       | _Assign issues_; the assignee must reach the project |

## The description

The description is written in Markdown, shown as it will read: bold, italics, lists, links, code, quotes, tables and headings. The toolbar and the usual shortcuts (`**`, `-`, `#`) write it for you.

Links start with `https://`, `http://` or `mailto:`. HTML is not interpreted, and images are never loaded: they show as links. Attach a picture as a file rather.

## Comments

Write in the box above the activity, then **Send**. It takes the permission _Comment_. A comment is plain text, line breaks kept, 20,000 characters at most, with files if you like.

- **@name** mentions someone: the list offers the people who can see the issue. A mentioned person is notified, whether or not they follow the issue. A comment mentions 20 people at most.
- The **…** menu of a comment edits it (its author) or deletes it (its author, or whoever holds _Moderate comments_). A deleted comment leaves no trace.

## Attachments

Drop files on an issue or a comment, or click **Attach files**: images (PNG, JPEG, WebP), PDF, text and logs, CSV, Word, Excel, PowerPoint and their OpenDocument counterparts. Each one is checked by the server, up to 20 MB by default, 20 files on the request and 20 on each comment.

Images and text files open in the app, PDFs in the browser's own viewer; every file can be downloaded. A file is removed by whoever attached it or by whoever holds _Edit issues_; a comment's files, by whoever may delete the comment.

## The activity

Under the description, comments and changes follow each other, newest first: who changed what, and when. Changes made together show as one entry, with their **Details**. The history records the subject, the description (that it was edited, not its old text), every field, duplicate marks, comments and files attached.

## Following an issue

Its requester, its assignee and those who comment follow an issue on their own; anyone who sees it may **Follow** it, or **Unfollow** it for good. Followers are told of its comments, of its status and of who it is assigned to: see [notifications](./notifications).

## Duplicates

When two issues tell the same thing, open the later one, then **More actions › Mark as a duplicate…**. Choose the original, in any project you see, by its key or the words of its subject, and the closing status to give it. The duplicate is closed, both issues show the link, and its requester follows the original, so that they hear of it. **Not a duplicate** removes the mark and leaves the status as it is. It takes _Edit issues_.

## Deleting an issue

**More actions › Delete the issue** removes it and its history for good, and its number is never given again. It takes _Delete issues_. Nobody is told.

## My issues

**My issues** lists the issues assigned to you in every active project, open and closed, the most urgent first, then the newest.
