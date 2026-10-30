import type { MenuProps } from '@toppo-tracker/plugin-ui';
import * as Toppo from '@toppo-tracker/ui';
import { ChevronDownIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useScreenSession } from './screen-context.ts';

/**
 * A button whose menu Toppo draws over the page, beside it: a frame cannot draw past its edges,
 * and a menu would be cut there. The item chosen is handed to `onSelect`; focus comes back here.
 */
export function Menu({ label, items, onSelect }: MenuProps) {
  const { bridge } = useScreenSession();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  async function show() {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setOpen(true);
    try {
      const chosen = await bridge.menu(
        { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        items,
      );
      if (chosen !== null) {
        onSelect(chosen);
      }
    } catch {
      // Toppo refused to draw it (another one is open): nothing was chosen.
    } finally {
      setOpen(false);
      button.current?.focus();
    }
  }

  return (
    <Toppo.Button
      ref={button}
      variant="secondary"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => void show()}
    >
      {label}
      <ChevronDownIcon aria-hidden="true" />
    </Toppo.Button>
  );
}
