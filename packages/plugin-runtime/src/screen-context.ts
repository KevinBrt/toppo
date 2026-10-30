import type { ScreenContext } from '@toppo-tracker/plugin-sdk/protocol';
import { createContext, useContext } from 'react';
import type { Bridge } from './bridge.ts';

/** The screen's context, as Toppo last told it, and the bridge to Toppo. */
export interface ScreenSession {
  context: ScreenContext;
  bridge: Bridge;
}

export const ScreenSessionContext = createContext<ScreenSession | null>(null);

export function useScreenSession(): ScreenSession {
  const session = useContext(ScreenSessionContext);
  if (!session) {
    throw new Error('A screen draws once Toppo told it where it is');
  }
  return session;
}

/** Words of the runtime's own, in each language Toppo speaks. */
export const RUNTIME_WORDS = {
  en: {
    someone: 'Someone',
    failed: 'This screen could not be shown.',
    hours: 'Hours',
    minutes: 'Minutes',
    noRows: 'Nothing to show.',
    over: 'Over',
    of: 'of',
    name: 'Name',
    value: 'Value',
    limit: 'Limit',
  },
  fr: {
    someone: 'Quelqu’un',
    failed: 'Cet écran n’a pas pu s’afficher.',
    hours: 'Heures',
    minutes: 'Minutes',
    noRows: 'Rien à afficher.',
    over: 'Dépassé',
    of: 'sur',
    name: 'Nom',
    value: 'Valeur',
    limit: 'Limite',
  },
} as const;

/** Minutes as people read them: "6 h 40", "6 h", "40 min", hours grouped as in `locale`. */
export function formatDuration(minutes: number, locale: 'en' | 'fr'): string {
  const whole = Math.round(Math.abs(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const sign = minutes < 0 && whole > 0 ? '−' : '';
  if (hours === 0) {
    return `${sign}${rest} min`;
  }
  const spoken = new Intl.NumberFormat(locale).format(hours);
  return `${sign}${spoken} h${rest === 0 ? '' : ` ${String(rest).padStart(2, '0')}`}`;
}
