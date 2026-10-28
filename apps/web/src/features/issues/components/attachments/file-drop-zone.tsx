import { cn } from '@toppo-tracker/ui';
import { UploadIcon } from 'lucide-react';
import { useRef } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { formatFileSize } from '../../../../shared/i18n/sizes.util.ts';
import { FileInput, useFileDrop } from './attach-button.tsx';

/**
 * Where files are dropped, or picked from the computer by the link it holds, with the types and
 * the size accepted. Reports the files chosen.
 */
export function FileDropZone({
  maxFileSize,
  disabled = false,
  onFiles,
}: {
  maxFileSize: number;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const { t, locale } = useI18n();
  const picker = useRef<HTMLInputElement>(null);
  const drop = useFileDrop(onFiles, !disabled);

  return (
    <div
      {...drop.handlers}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-muted px-4 py-7 text-center transition-colors',
        drop.over && 'border-primary bg-primary-subtle',
      )}
    >
      <span
        aria-hidden="true"
        className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground"
      >
        <UploadIcon className="size-5" />
      </span>
      <p className="text-sm text-foreground">
        {drop.over ? (
          t('issues.attachments.dropHere')
        ) : (
          <>
            {t('issues.attachments.drop')}{' '}
            <button
              type="button"
              disabled={disabled}
              onClick={() => picker.current?.click()}
              className="rounded-sm font-medium text-primary underline underline-offset-4 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
            >
              {t('issues.attachments.browse')}
            </button>
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('issues.attachments.accepted', { size: formatFileSize(maxFileSize, locale) })}
      </p>
      <FileInput ref={picker} onFiles={onFiles} />
    </div>
  );
}
