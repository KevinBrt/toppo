import type { PlainMessageKey } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PERMISSION_MESSAGES } from '../../constants/permission-messages.constants.ts';
import type { MatrixRow } from '../../utils/permission-matrix.util.ts';

function messagesOf(row: MatrixRow): { label: PlainMessageKey; description: PlainMessageKey } {
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
  return row.kind === 'permission' ? row.permission : row.kind;
}

/** What a row of the matrix allows, and a line of help. */
export function RowLabel({ row }: { row: MatrixRow }) {
  const { t } = useI18n();
  const { label, description } = messagesOf(row);

  return (
    <>
      <span className="block text-sm font-medium text-foreground">{t(label)}</span>
      <span className="block text-xs font-normal text-muted-foreground">{t(description)}</span>
    </>
  );
}
