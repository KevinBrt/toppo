import type { MembersQuery, RoleBadge } from '@toppo-tracker/shared';
import { cn, Input } from '@toppo-tracker/ui';
import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

interface MemberFiltersProps {
  roles: readonly RoleBadge[];
  /** Rows matching the search, by role id, as the server counted them. */
  byRole: Readonly<Record<string, number>>;
  query: MembersQuery;
  onChange: (query: MembersQuery) => void;
}

/**
 * One tab per role with its count, and a search box. They only report the filter: the server
 * applies it. Tabs scroll sideways on phones.
 */
export function MemberFilters({ roles, byRole, query, onChange }: MemberFiltersProps) {
  const { t } = useI18n();
  const search = query.search ?? '';
  const [typed, setTyped] = useState(search);

  // Follows the address bar too: back and forward change the search.
  useEffect(() => setTyped(search), [search]);

  useEffect(() => {
    if (typed.trim() === search) {
      return;
    }
    const timer = setTimeout(
      () => onChange({ role: query.role, search: typed.trim() || undefined }),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [typed, search, query.role, onChange]);

  const tabs = [
    {
      roleId: undefined,
      label: t('members.all'),
      count: Object.values(byRole).reduce((sum, count) => sum + count, 0),
    },
    ...roles.map((role) => ({ roleId: role.id, label: role.name, count: byRole[role.id] ?? 0 })),
  ];

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 sm:flex-row sm:items-center sm:justify-between">
      {/* min-w-0: a fieldset otherwise refuses to shrink, and the tabs could not scroll. */}
      <fieldset className="-mb-px flex min-w-0 gap-5 overflow-x-auto">
        <legend className="sr-only">{t('members.filterLabel')}</legend>
        {tabs.map((tab) => {
          const selected = query.role === tab.roleId;
          return (
            <button
              key={tab.roleId ?? 'all'}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ role: tab.roleId, search: query.search })}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span className="rounded-full bg-surface-muted px-1.5 text-xs text-muted-foreground">
                {tab.count}
              </span>
            </button>
          );
        })}
      </fieldset>
      <div className="relative pb-3 sm:w-64 sm:py-2">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-5 left-3 size-4 -translate-y-1/2 text-muted-foreground sm:top-1/2"
        />
        <Input
          type="search"
          aria-label={t('members.search')}
          value={typed}
          maxLength={100}
          placeholder={t('members.search')}
          onChange={(event) => setTyped(event.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
