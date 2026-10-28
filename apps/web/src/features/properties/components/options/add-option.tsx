import { Button, Input } from '@toppo-tracker/ui';
import { PlusIcon } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** The last line of a list of options: a name typed, then added with Enter or the button. */
export function AddOption({
  full,
  max,
  onAdd,
}: {
  /** The list holds as many options as it may. */
  full: boolean;
  max: number;
  onAdd: (name: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');

  function add() {
    if (name.trim()) {
      onAdd(name.trim());
      setName('');
    }
  }

  function addOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the option rather than saving the whole list.
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  }

  if (full) {
    return (
      <p className="px-3 py-2.5 text-sm text-muted-foreground">{t('properties.limit', { max })}</p>
    );
  }
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <PlusIcon aria-hidden="true" className="ml-2 size-4 shrink-0 text-muted-foreground" />
      <Input
        aria-label={t('properties.newOption')}
        placeholder={t('properties.newOption')}
        value={name}
        maxLength={100}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={addOnEnter}
        className="h-9 border-transparent bg-transparent shadow-none"
      />
      <Button type="button" variant="secondary" size="sm" disabled={!name.trim()} onClick={add}>
        {t('properties.add')}
      </Button>
    </div>
  );
}
