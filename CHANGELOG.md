# Changelog

## 1.0.0 (2026-10-27)


### Features

* **account:** change one's name and password ([b58e3c7](https://github.com/KevinBrt/toppo/commit/b58e3c7612fcb035087c6c2fe542ac23b50f0afc))
* **attachments:** attach files to issues and comments, checked by the server ([d371771](https://github.com/KevinBrt/toppo/commit/d37177143d77836c9b527a8c22ab48f273c31c6d))
* **comments:** comment on an issue from its timeline ([ea1ddfe](https://github.com/KevinBrt/toppo/commit/ea1ddfe2c3d2d229b18ecc83dfedcfcc29fb0913))
* **comments:** show mentions in color, the picker under the @ ([01913b8](https://github.com/KevinBrt/toppo/commit/01913b824546d5c5add7af15cb6eb50c93415ec5))
* **db:** add projects, workflows and issues ([757f9ca](https://github.com/KevinBrt/toppo/commit/757f9ca750d56c61e852afd00b56d45446fc0b4a))
* **issues:** create, change, move and delete issues through the API ([aa83bd2](https://github.com/KevinBrt/toppo/commit/aa83bd2bfe47e2371d5d14fdecafdbd73e206fd9))
* **issues:** filter, sort, group and search issues on the server ([5a97796](https://github.com/KevinBrt/toppo/commit/5a9779605e659fa5530a04a6523e55b66a4d1b3b))
* **issues:** follow an issue, and act on several issues at once from the list ([4826c99](https://github.com/KevinBrt/toppo/commit/4826c99f44d0ba5c559ba35b911b10eeaeeb350e))
* **issues:** list, report, follow and edit issues in the app ([2b8bda3](https://github.com/KevinBrt/toppo/commit/2b8bda3635e826c29931f3c66e756c1d776aa405))
* **issues:** mark an issue as a duplicate of another, closing it ([1651565](https://github.com/KevinBrt/toppo/commit/1651565343f697d368c3a1513e8bcd639dd06502))
* **jobs:** run background work from a job queue in PostgreSQL ([252b76e](https://github.com/KevinBrt/toppo/commit/252b76e228537b48be902778b16ecfe0ea6dbf7a))
* **labels:** tag issues with labels, one list for the instance ([53bcc56](https://github.com/KevinBrt/toppo/commit/53bcc56cfddc04d6b917ed67b08d02494265dc03))
* **mail:** send email through an SMTP server, invitations and password resets ([d37a990](https://github.com/KevinBrt/toppo/commit/d37a99087d0b5b29d535eeb0d7769730b03a90c3))
* **notifications:** email notifications kind by kind, tell the roles that ask of new issues ([c947094](https://github.com/KevinBrt/toppo/commit/c9470949a06b3e684a2fa9d1edff9dbf9ad5e675))
* **permissions:** check instance permissions on every request ([e86e0b7](https://github.com/KevinBrt/toppo/commit/e86e0b7dcbef4517cc608b82c17347c9918be6ea))
* **projects:** create projects and choose who reaches them ([3dcd74e](https://github.com/KevinBrt/toppo/commit/3dcd74ed66e2099e4fd33e04daef4520087a4200))
* **projects:** manage projects from their own admin pages ([8b3901c](https://github.com/KevinBrt/toppo/commit/8b3901c92b113902ee7e8c71b72cbedbcdb2f17f))
* **properties:** lists of options issues take, defined for the instance ([c197f79](https://github.com/KevinBrt/toppo/commit/c197f798e15db922af160a92836a8b3763eeaae3))
* **properties:** projects hide, require and adapt the fields their issues take ([9b14240](https://github.com/KevinBrt/toppo/commit/9b1424022fbd1fb9abb0d5badb465090506dfe6b))
* **properties:** six more types, and the issue list filtered by them ([66798b0](https://github.com/KevinBrt/toppo/commit/66798b0c7ebe07f0f5c2e5a0f0fc2dce627d83c2))
* **roles:** edit roles and permissions in a matrix ([7eed3dd](https://github.com/KevinBrt/toppo/commit/7eed3dd09cc32b5d62ce1ca57af05cd24f3c0407))
* **search:** forgive typos, read loose references, check access once per project ([38ef8ca](https://github.com/KevinBrt/toppo/commit/38ef8caf4f051f51a09e9c52fde0dc5b5e90fff5))
* **settings:** edit categories, priorities and workflows ([962386d](https://github.com/KevinBrt/toppo/commit/962386df3b030f9d794d1884b9cb9179fb580207))
* **setup:** drop the organization name from the setup wizard ([1cd1f1b](https://github.com/KevinBrt/toppo/commit/1cd1f1b87d7d854572c7c9b8affef62c162a3d34))
* show the version, announce newer ones to admins, choose the language on the account ([9f947aa](https://github.com/KevinBrt/toppo/commit/9f947aa33849557351f44d5369c17e5357bbe8cb))
* test upgrades from each release, document self-hosting, new logo ([8f11c0f](https://github.com/KevinBrt/toppo/commit/8f11c0ff8e5f2932574f87624802df076b26466b))
* **users:** invite and delete members ([9a9650d](https://github.com/KevinBrt/toppo/commit/9a9650d54b70fde05c8e40bec62eb21555ec0f6e))
* **users:** manage members after the admin mockups ([fa7a38f](https://github.com/KevinBrt/toppo/commit/fa7a38ff7f7587f6b06cf797d0a045245cb24a12))
* **web:** search every project from a palette opened with Cmd/Ctrl K ([044dc1e](https://github.com/KevinBrt/toppo/commit/044dc1ea52fa4efebbf4e27546ad19085a1dec46))


### Bug Fixes

* **security:** hide project members from non-managers, trust only the nearest proxy, bind lockfile tarballs, keep install and backup files private ([5e378e3](https://github.com/KevinBrt/toppo/commit/5e378e3515f450f32f7055a43a6d9c5fd7db0868))
* **security:** keep renewals, every-project members and typo corrections within what one reaches ([120e437](https://github.com/KevinBrt/toppo/commit/120e437e4d7d613f3a3f592977a7e70eded07b8f))
* **security:** keep Toppo's rate limits in a table of their own, count an IPv6 client by its /64 ([cdb0f48](https://github.com/KevinBrt/toppo/commit/cdb0f48fa1461124e067db8d54fbd992378e0e5f))
* **security:** put urgent emails first, bound mail sends and the typo word list, count uploads in flight ([711ca3c](https://github.com/KevinBrt/toppo/commit/711ca3c1f247b2eb8adfd69b66d382d2d23624e8))
* **security:** reserve email settings to administrators, bound access to every project, count the setup code as compared ([093a35a](https://github.com/KevinBrt/toppo/commit/093a35ad6306381e082d6af0cb87e29b23fcbd18))
* **security:** turn Markdown footnotes off and parse a text again only when it changes ([8296599](https://github.com/KevinBrt/toppo/commit/8296599ce3413881fca6f3b2f6b99e3c1e25fd7b))
* **setup:** give the administrator's account the language the wizard was used in ([35f5991](https://github.com/KevinBrt/toppo/commit/35f5991ec6369317c2bea81352d743f0c304260a))
* **web:** focus the subject of a new issue, drop the new tab icon of PDFs ([b435847](https://github.com/KevinBrt/toppo/commit/b435847e21565e5643f7505c1fba37740a4effa5))
* **web:** keep the line between rows from flashing dark when rows move ([8126b43](https://github.com/KevinBrt/toppo/commit/8126b430494baa8ac9c55eeb9f2994a3d56820be))
* **web:** let lists and tables use the whole width ([8d3550e](https://github.com/KevinBrt/toppo/commit/8d3550e1300d62218c2cea13453ed1b7e02ca50c))


### Performance Improvements

* **issues:** check the list and search plans on 100,000 issues ([b9a51e6](https://github.com/KevinBrt/toppo/commit/b9a51e65de1e2836c1f265b5befd0672079c13b1))
