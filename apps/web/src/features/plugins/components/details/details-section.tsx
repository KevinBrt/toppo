import { type ReactNode, useId } from 'react';

/** A block of a plugin's page: a titled card, named after its title for screen readers. */
export function DetailsSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string | undefined;
  /** Shown before the title, saying nothing more: a plugin's logo. */
  icon?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6"
    >
      <div>
        <h2
          id={titleId}
          className="flex items-center gap-3 text-base font-semibold text-foreground"
        >
          {icon}
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
