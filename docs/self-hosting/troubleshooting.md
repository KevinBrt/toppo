# Troubleshooting

Start with the logs: `docker compose logs toppo` tells what Toppo did and, when it fails, why.

| What happens                               | What to do                                                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The setup code is lost                     | Restart Toppo (`docker compose restart toppo`): it prints a new one until setup is done.                                                                                                                          |
| Toppo does not start                       | The logs say why: an unknown or invalid `TOPPO_*` variable, a database that cannot be reached, a migration that failed (the database is then left as it was).                                                     |
| `/health` answers 503                      | Toppo runs but cannot reach its database: check `docker compose ps` and the logs of `db`.                                                                                                                         |
| Links in emails point to the wrong address | Set `TOPPO_URL` to the address people open, then `docker compose up -d`.                                                                                                                                          |
| No email arrives                           | Send a test message from **Settings › Email**: it says what went wrong, the connection, TLS, the account or the message refused. Check the spam folder, and that the sender address may send through that server. |
| Everyone was signed out after a move       | The `/data` volume, with its secret key, was not moved along: restore it, or set `TOPPO_SECRET` yourself. Enter the mail password again in **Settings › Email**.                                                  |
| Attachments fail behind the proxy          | The proxy refuses large requests: let it accept the size of `TOPPO_ATTACHMENT_MAX_SIZE_MB` (nginx: `client_max_body_size`).                                                                                       |
| Sign-ins are refused as too many           | Behind a reverse proxy, Toppo sees every client at the proxy's address until `TOPPO_TRUST_PROXY=true` ([the client's address](./reverse-proxy#the-client-s-address)).                                             |
| The interface speaks the wrong language    | Each person chooses theirs in **My account › Language**; emails follow it.                                                                                                                                        |

Still stuck? Open an [issue](https://github.com/KevinBrt/toppo/issues) with the version (bottom of the sidebar) and what the logs say. A security problem is reported privately, as [SECURITY.md](https://github.com/KevinBrt/toppo/blob/main/SECURITY.md) explains.
