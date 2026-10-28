import type { AttachmentKind } from '@toppo-tracker/shared';
import { cn } from '@toppo-tracker/ui';

/** The badge of each kind: dark enough for white text. */
const BADGES: Readonly<Record<AttachmentKind, string>> = {
  image: 'bg-badge-blue-foreground',
  pdf: 'bg-danger-hover',
  text: 'bg-badge-gray-foreground',
  spreadsheet: 'bg-badge-green-foreground',
  document: 'bg-badge-blue-foreground',
  presentation: 'bg-badge-orange-foreground',
};

/**
 * The top of a file's card: an image as its own thumbnail, any other file as a sheet drawn for
 * its kind, its type on a badge. Decorative: the card names the file.
 */
export function FilePreview({
  kind,
  typeLabel,
  imageUrl,
}: {
  kind: AttachmentKind;
  /** `PNG`, `CSV`. */
  typeLabel: string;
  /** Where the image shows itself, for images only. */
  imageUrl: string | null;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative h-24 overflow-hidden border-b border-border bg-surface-hover"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <div className="absolute inset-x-6 top-3 bottom-0 rounded-t-md border border-border bg-surface p-2 shadow-xs">
          <SheetContent kind={kind} />
        </div>
      )}
      <span
        className={cn(
          'absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-xs font-bold tracking-wide text-white',
          BADGES[kind],
        )}
      >
        {typeLabel}
      </span>
    </div>
  );
}

/** The cells of a spreadsheet's drawing, below its header row. */
const CELLS = ['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'b3', 'c3'] as const;

/** What the sheet of a kind shows: a grid, a slide, or lines of text. */
function SheetContent({ kind }: { kind: AttachmentKind }) {
  if (kind === 'spreadsheet') {
    return (
      <div className="grid h-full grid-cols-3 gap-px overflow-hidden rounded-sm border border-border bg-border">
        <span className="col-span-3 h-2 bg-badge-green" />
        {CELLS.map((cell) => (
          <span key={cell} className="h-3 bg-surface" />
        ))}
      </div>
    );
  }
  if (kind === 'presentation') {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="h-8 rounded-sm bg-badge-orange" />
        <span className="h-1.5 w-2/3 rounded-full bg-border" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={cn(
          'h-1.5 w-1/2 rounded-full',
          kind === 'pdf' ? 'bg-badge-pink' : 'bg-border-strong',
        )}
      />
      <span className="h-1.5 w-full rounded-full bg-border" />
      <span className="h-1.5 w-5/6 rounded-full bg-border" />
      <span className="h-1.5 w-2/3 rounded-full bg-border" />
    </div>
  );
}
