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
    {
      text: 'Guide',
      items: [
        { text: 'What Toppo is', link: '/guide/' },
        { text: 'Getting around', link: '/guide/getting-around' },
        { text: 'Projects', link: '/guide/projects' },
        { text: 'Issues', link: '/guide/issues' },
        { text: 'Finding issues', link: '/guide/finding-issues' },
        { text: 'Workflows and statuses', link: '/guide/workflows' },
        { text: 'Properties and fields', link: '/guide/properties' },
        { text: 'Roles and permissions', link: '/guide/roles' },
        { text: 'Members and access', link: '/guide/members' },
        { text: 'Notifications', link: '/guide/notifications' },
        { text: 'Your account', link: '/guide/account' },
      ],
    },
    {
      text: 'Self-hosting',
      items: [
        { text: 'Overview', link: '/self-hosting' },
        { text: 'Install', link: '/self-hosting/install' },
        { text: 'First run', link: '/self-hosting/first-run' },
        { text: 'Configuration', link: '/self-hosting/configuration' },
        { text: 'Email', link: '/self-hosting/email' },
        { text: 'HTTPS behind a reverse proxy', link: '/self-hosting/reverse-proxy' },
        { text: 'Backups and upgrades', link: '/self-hosting/backups-and-upgrades' },
        { text: 'Troubleshooting', link: '/self-hosting/troubleshooting' },
      ],
    },
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
    {
      text: 'Guide',
      items: [
        { text: 'Ce qu’est Toppo', link: '/fr/guide/' },
        { text: 'Se repérer', link: '/fr/guide/getting-around' },
        { text: 'Projets', link: '/fr/guide/projects' },
        { text: 'Tickets', link: '/fr/guide/issues' },
        { text: 'Trouver des tickets', link: '/fr/guide/finding-issues' },
        { text: 'Workflows et statuts', link: '/fr/guide/workflows' },
        { text: 'Propriétés et champs', link: '/fr/guide/properties' },
        { text: 'Rôles et permissions', link: '/fr/guide/roles' },
        { text: 'Membres et accès', link: '/fr/guide/members' },
        { text: 'Notifications', link: '/fr/guide/notifications' },
        { text: 'Votre compte', link: '/fr/guide/account' },
      ],
    },
    {
      text: 'Auto-hébergement',
      items: [
        { text: 'Vue d’ensemble', link: '/fr/self-hosting' },
        { text: 'Installer', link: '/fr/self-hosting/install' },
        { text: 'Premier démarrage', link: '/fr/self-hosting/first-run' },
        { text: 'Configuration', link: '/fr/self-hosting/configuration' },
        { text: 'E-mail', link: '/fr/self-hosting/email' },
        { text: 'HTTPS derrière un reverse proxy', link: '/fr/self-hosting/reverse-proxy' },
        { text: 'Sauvegardes et mises à jour', link: '/fr/self-hosting/backups-and-upgrades' },
        { text: 'Dépannage', link: '/fr/self-hosting/troubleshooting' },
      ],
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
 * French, every page in both. Served by GitHub Pages at toppo-tracker.app. Light only, as the
 * app is.
 */
export default defineConfig({
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
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }]],
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
