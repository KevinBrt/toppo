import type { Locale } from '@toppo-tracker/shared';
import type { PlainMessageKey, Translate } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PERMISSION_MESSAGES } from '../../constants/permission-messages.constants.ts';
import type { MatrixRow, MatrixSection } from '../../utils/permission-matrix.util.ts';

function messagesOf(row: Exclude<MatrixRow, { kind: 'pluginPermission' }>): {
  label: PlainMessageKey;
  description: PlainMessageKey;
} {
  switch (row.kind) {
    case 'issueVisibility':
      return { label: 'roles.visibility.label', description: 'roles.visibility.description' };
    case 'notifyNewIssues':
      return {
        label: 'roles.notifyNewIssues.label',
        description: 'roles.notifyNewIssues.description',
      };
    case 'permission':
      return PERMISSION_MESSAGES[row.permission];
  }
}

/** A key for a row, the same in both layouts of the matrix. */
export function rowKey(row: MatrixRow): string {
  return row.kind === 'permission' || row.kind === 'pluginPermission' ? row.permission : row.kind;
}

/** A key for a section, the same in both layouts of the matrix. */
export function sectionKey(section: MatrixSection): string {
  return section.kind === 'plugin' ? `plugin-${section.slug}` : section.section;
}

/** What a section is called, a plugin's in the language shown, and the line under it. */
export function sectionText(
  section: MatrixSection,
  t: Translate,
  locale: Locale,
): { title: string; detail: string } {
  return section.kind === 'plugin'
    ? { title: section.name[locale], detail: t('roles.pluginSection') }
    : { title: t(`roles.sections.${section.section}`), detail: t(`roles.scope.${section.scope}`) };
}

/**
 * What a row allows, in words a person reads: Toppo's own, or a plugin's in the language shown,
 * with where it applies as its line of help.
 */
export function useRowText(): (row: MatrixRow) => { label: string; description: string } {
  const { t, locale } = useI18n();
  return (row) => {
    if (row.kind === 'pluginPermission') {
      return { label: row.label[locale], description: t(`roles.scope.${row.scope}`) };
    }
    const { label, description } = messagesOf(row);
    return { label: t(label), description: t(description) };
  };
}

/** What a row of the matrix allows, and a line of help. */
export function RowLabel({ row }: { row: MatrixRow }) {
  const { label, description } = useRowText()(row);

  return (
    <>
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <span className="block text-xs font-normal text-muted-foreground">{description}</span>
    </>
  );
}
