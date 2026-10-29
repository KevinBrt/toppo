import { type DefaultTheme, defineConfig } from 'vitepress';

const REPOSITORY = 'https://github.com/KevinBrt/toppo';

/** The guide, self-hosting and contributing, in English. */
const ENGLISH: DefaultTheme.Config = {
  nav: [
    { text: 'Guide', link: '/guide/' },
    { text: 'Self-hosting', link: '/self-hosting' },
    { text: 'Contributing', link: '/contributing' },
  ],
  sidebar: [
    { text: 'Guide', items: [{ text: 'What Toppo is', link: '/guide/' }] },
    { text: 'Self-hosting', items: [{ text: 'Install and run Toppo', link: '/self-hosting' }] },
    {
      text: 'Contributing',
      items: [
        { text: 'Working on Toppo', link: '/contributing' },
        { text: 'Performance of the issue list', link: '/performance' },
      ],
    },
  ],
  editLink: { pattern: `${REPOSITORY}/edit/main/docs/:path`, text: 'Improve this page' },
};

const FRENCH: DefaultTheme.Config = {
  nav: [
    { text: 'Guide', link: '/fr/guide/' },
    { text: 'Auto-hébergement', link: '/fr/self-hosting' },
    { text: 'Contribuer', link: '/fr/contributing' },
  ],
  sidebar: [
    { text: 'Guide', items: [{ text: 'Ce qu’est Toppo', link: '/fr/guide/' }] },
    {
      text: 'Auto-hébergement',
      items: [{ text: 'Installer et faire tourner Toppo', link: '/fr/self-hosting' }],
    },
    {
      text: 'Contribuer',
      items: [
        { text: 'Travailler sur Toppo', link: '/fr/contributing' },
        { text: 'Performances de la liste des tickets', link: '/fr/performance' },
      ],
    },
  ],
  editLink: { pattern: `${REPOSITORY}/edit/main/docs/:path`, text: 'Améliorer cette page' },
  outline: { label: 'Sur cette page' },
  docFooter: { prev: 'Page précédente', next: 'Page suivante' },
  lastUpdated: { text: 'Mis à jour le' },
  returnToTopLabel: 'Revenir en haut',
  sidebarMenuLabel: 'Menu',
  langMenuLabel: 'Langue',
  notFound: {
    title: 'Page introuvable',
    quote: 'Cette page n’existe pas, ou plus.',
    linkText: 'Retour à l’accueil',
  },
};

/**
 * Toppo's documentation: what people, administrators and contributors need, in English and in
 * French, every page in both. Served by GitHub Pages under `/toppo/`. Light only, as the app is.
 */
export default defineConfig({
  base: '/toppo/',
  title: 'Toppo',
  description: 'Modern issue tracking. Self-hosted. Free forever, no strings attached.',
  cleanUrls: true,
  lastUpdated: true,
  appearance: false,
  outDir: 'dist',
  // The plugins' pages come with the plugin system; its design notes are for contributors.
  srcExclude: ['plugins/**', 'README.md'],
  // The README's screenshots, served as they are.
  vite: { publicDir: 'images' },
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/toppo/logo.svg' }]],
  locales: {
    root: { label: 'English', lang: 'en', themeConfig: ENGLISH },
    fr: {
      label: 'Français',
      lang: 'fr',
      description:
        'Le suivi de tickets moderne. Auto-hébergé. Gratuit pour toujours, sans conditions.',
      themeConfig: FRENCH,
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: REPOSITORY }],
    search: {
      provider: 'local',
      options: {
        locales: {
          fr: {
            translations: {
              button: { buttonText: 'Rechercher', buttonAriaLabel: 'Rechercher' },
              modal: {
                noResultsText: 'Aucun résultat pour',
                resetButtonTitle: 'Effacer la recherche',
                footer: { selectText: 'choisir', navigateText: 'naviguer', closeText: 'fermer' },
              },
            },
          },
        },
      },
    },
  },
});
