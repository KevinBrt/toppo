# Email

Toppo sends invitations, password resets and notifications through your mail server: enter its host, port, security (STARTTLS, TLS, or none for a relay on your own network), account and sender address in **Settings › Email**, then send yourself a test message from the same page: when it fails, it says why (the connection, TLS, the account, or the message refused).

Without email, Toppo works, but invitation links must be passed on by hand, notifications stay in the bell, and **a forgotten password cannot be reset**: set email up before someone needs it.

Each email is written in the language its recipient chose in **My account › Language**. Emails someone waits for, such as a password reset or an invitation, leave before notifications.

The mail password is encrypted with the secret key kept in the `/data` volume. Restored without that volume, Toppo cannot read it any more: enter it again in **Settings › Email**.
