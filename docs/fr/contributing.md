# Travailler sur Toppo

Toppo se construit au grand jour, par une petite équipe, et les contributions sont les bienvenues. Son code est sur [GitHub](https://github.com/KevinBrt/toppo), avec les fichiers qui expliquent comment y travailler, en anglais :

- [CONTRIBUTING.md](https://github.com/KevinBrt/toppo/blob/main/CONTRIBUTING.md) : s’installer, faire un changement, ce que vérifie la CI, publier une version.
- [ARCHITECTURE.md](https://github.com/KevinBrt/toppo/blob/main/ARCHITECTURE.md) : de quoi Toppo est fait, et les décisions qui l’expliquent.
- [SECURITY.md](https://github.com/KevinBrt/toppo/blob/main/SECURITY.md) : comment signaler une faille, en privé.
- [ROADMAP.md](https://github.com/KevinBrt/toppo/blob/main/ROADMAP.md) : ce qui est fait, et ce qui vient ensuite.

## En bref

Il vous faut Node.js 24 et Docker :

```sh
git clone https://github.com/KevinBrt/toppo.git && cd toppo
npm ci
npm run setup   # active les hooks git
npm run dev     # base de données + API sur :3000 + application web sur :5173
```

`npm run check` lance tout ce que lance la CI. Pour tout ce qui dépasse une petite correction, ouvrez d’abord une issue pour vous accorder sur l’approche : ce qui peut vivre dans un plugin devrait en général y vivre.

## Cette documentation

Ces pages vivent dans le dossier `docs/` du dépôt, en anglais et en français. Lancez `npm run docs:dev` pour les lire pendant que vous les écrivez ; un changement de comportement met sa page à jour dans la même pull request.
