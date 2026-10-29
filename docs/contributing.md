# Working on Toppo

Toppo is built in the open, by a small team, and contributions are welcome. Its code lives on [GitHub](https://github.com/KevinBrt/toppo), with the files that explain how to work on it:

- [CONTRIBUTING.md](https://github.com/KevinBrt/toppo/blob/main/CONTRIBUTING.md): setting up, making a change, what CI checks, releasing.
- [ARCHITECTURE.md](https://github.com/KevinBrt/toppo/blob/main/ARCHITECTURE.md): what Toppo is made of, and the decisions behind it.
- [SECURITY.md](https://github.com/KevinBrt/toppo/blob/main/SECURITY.md): how to report a vulnerability, privately.
- [ROADMAP.md](https://github.com/KevinBrt/toppo/blob/main/ROADMAP.md): what is done, and what comes next.

## In short

You need Node.js 24 and Docker:

```sh
git clone https://github.com/KevinBrt/toppo.git && cd toppo
npm ci
npm run setup   # enable git hooks
npm run dev     # database + API on :3000 + web app on :5173
```

`npm run check` runs everything CI runs. For anything beyond a small fix, open an issue first to agree on the approach: features that can live in a plugin usually should.

## This documentation

These pages live in the repository's `docs/` folder, in English and in French. Run `npm run docs:dev` to read them as you write them; a change of behaviour updates its page in the same pull request.
