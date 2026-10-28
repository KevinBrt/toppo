import { Button } from '@toppo-tracker/ui';
import { PaperclipIcon } from 'lucide-react';
import { type DragEvent, type Ref, useRef, useState } from 'react';
import { ACCEPTED_EXTENSIONS } from '../../utils/attachment-files.util.ts';

/** The computer's file picker, hidden: a button or a link opens it. Reports the files chosen. */
export function FileInput({
  ref,
  onFiles,
}: {
  ref: Ref<HTMLInputElement>;
  onFiles: (files: File[]) => void;
}) {
  return (
    <input
      ref={ref}
      type="file"
      multiple
      accept={ACCEPTED_EXTENSIONS}
      hidden
      onChange={(event) => {
        onFiles([...(event.target.files ?? [])]);
        // The same file can be chosen again, once removed.
        event.target.value = '';
      }}
    />
  );
}

/** A button that opens the computer's files. Reports the files chosen. */
export function AttachButton({
  label,
  iconOnly = false,
  disabled = false,
  onFiles,
}: {
  label: string;
  /** The paperclip alone, its label read to screen readers. */
  iconOnly?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        variant="ghost"
        size={iconOnly ? 'icon' : 'sm'}
        disabled={disabled}
        aria-label={iconOnly ? label : undefined}
        onClick={() => picker.current?.click()}
      >
        <PaperclipIcon aria-hidden="true" />
        {iconOnly ? null : label}
      </Button>
      <FileInput ref={picker} onFiles={onFiles} />
    </>
  );
}

const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

/**
 * Lets an element take files dropped on it: `over` while files hover it, then reports them.
 * Anything else dragged is left alone.
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [over, setOver] = useState(false);
  const accept = (event: DragEvent) => {
    if (enabled && carriesFiles(event)) {
      event.preventDefault();
      setOver(true);
    }
  };
  return {
    over,
    handlers: {
      onDragEnter: accept,
      onDragOver: accept,
      onDragLeave: (event: DragEvent) => {
        // Leaving for one of its own children is not leaving.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOver(false);
        }
      },
      onDrop: (event: DragEvent) => {
        if (enabled && carriesFiles(event)) {
          event.preventDefault();
          setOver(false);
          onFiles([...event.dataTransfer.files]);
        }
      },
    },
  };
}
