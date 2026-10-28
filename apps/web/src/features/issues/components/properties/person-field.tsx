import type { UserRef } from '@toppo-tracker/shared';
import { cn } from '@toppo-tracker/ui';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PersonDialog } from '../fields/person-dialog.tsx';
import { PersonName } from '../fields/person-name.tsx';

/**
 * Someone a person property names, shown as a button that opens the people of the project to
 * choose another, or nobody. Given an `id`, it is the control of a form's field.
 */
export function PersonField({
  label,
  person,
  projectKey,
  placeholder,
  id,
  describedBy,
  className,
  onChoose,
}: {
  /** The property: titles the dialog, and names the button. */
  label: string;
  person: UserRef | null;
  projectKey: string;
  /** Shown while nobody is named. */
  placeholder: string;
  id?: string;
  describedBy?: string | undefined;
  className: string;
  onChoose: (person: UserRef | null) => void;
}) {
  const { t } = useI18n();
  const [choosing, setChoosing] = useState(false);
  const shown = person ? (person.name ?? t('issues.deletedUser')) : placeholder;

  return (
    <>
      <button
        type="button"
        // Read with whom it names, "Reviewer, Ada Lovelace", even where a form's label targets it.
        aria-label={`${label}, ${shown}`}
        {...(id === undefined ? {} : { id })}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        onClick={() => setChoosing(true)}
        className={cn('flex items-center justify-between gap-2 text-left', className)}
      >
        <span className="min-w-0">
          {person ? (
            <PersonName person={person} />
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <PersonDialog
        projectKey={projectKey}
        title={label}
        current={person}
        open={choosing}
        onOpenChange={setChoosing}
        onChoose={onChoose}
      />
    </>
  );
}
