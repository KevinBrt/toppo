# First run

1. Read the setup code in the logs:

   ```sh
   docker compose logs toppo | grep "setup code"
   ```

   The line looks like `Toppo is not set up yet: open http://localhost:3000 and enter the setup code ABCD-EFGH-JKLM`. A new code is printed at each start until setup is done.

2. Open Toppo, enter the code and create the first administrator account.
3. Set up [email](./email) in **Settings › Email**.
4. Invite your team from **Settings › Members**: each person gets a personal link, valid for 7 days, sent by email when it is set up, or that you send them yourself. They choose their name and password when they open it.
5. Adjust what each role allows in **Settings › Roles and permissions**. Administrator, Team and Requester are only a starting point: rename them, change them or create your own.

The code exists so that nobody else can claim a fresh instance reachable from the network. Once the first administrator exists, the wizard is closed for good. For automated deployments, preset the code with `TOPPO_SETUP_CODE`: 12 letters or digits at least, dashes and spaces aside.

Lost the code? Restart Toppo (`docker compose restart toppo`): it prints a new one until setup is done.
