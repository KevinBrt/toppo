import { ISSUE_SORT_ORDERS, type IssueSort, type SortOrder } from '@toppo-tracker/shared';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@toppo-tracker/ui';
import { ArrowDownWideNarrowIcon, ArrowUpNarrowWideIcon } from 'lucide-react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { SORT_LABELS } from '../../constants/issue-list.constants.ts';

/**
 * How the list is sorted, as a menu: for phones, whose cards have no column headers. A column
 * comes in its own order; the order can then be turned round.
 */
export function SortMenu({
  sorts,
  sort,
  order,
  onChange,
}: {
  /** The columns it offers. */
  sorts: readonly IssueSort[];
  sort: IssueSort;
  order: SortOrder;
  onChange: (sort: IssueSort, order: SortOrder) => void;
}) {
  const { t } = useI18n();
  const Icon = order === 'asc' ? ArrowUpNarrowWideIcon : ArrowDownWideNarrowIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Icon aria-hidden="true" />
          {t('issues.list.sort', { value: t(SORT_LABELS[sort]) })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(value) => {
            const chosen = sorts.find((candidate) => candidate === value);
            if (chosen) {
              onChange(chosen, ISSUE_SORT_ORDERS[chosen]);
            }
          }}
        >
          {sorts.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(SORT_LABELS[value])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={order}
          onValueChange={(value) => onChange(sort, value === 'asc' ? 'asc' : 'desc')}
        >
          <DropdownMenuRadioItem value="asc">{t('issues.list.ascending')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc">{t('issues.list.descending')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
