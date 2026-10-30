import { useQuery } from '@tanstack/react-query';
import { Button, Dialog, DialogContent, Input } from '@toppo-tracker/ui';
import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlainMessageKey } from '../../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../../shared/i18n/i18n-provider.tsx';
import type { PickedItem, ScreenOverlay } from '../../../models/plugin-overlay.model.ts';
import { PluginsQueries } from '../../../queries/plugins.queries.ts';
import { AskedBy } from './asked-by.tsx';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

/**
 * Toppo's search for a plugin's screen: issues, or people, where the plugin acts that the person
 * sees, by what they type. An issue or someone is picked at once; several people are chosen,
 * then given. Answers what was picked (people as a list), `null` when the person dismissed it.
 */
export function PickerOverlay({
  pluginSlug,
  overlay,
  onAnswer,
}: {
  pluginSlug: string;
  overlay: Extract<ScreenOverlay, { kind: 'pick' }>;
  onAnswer: (picked: unknown) => void;
}) {
  const { t } = useI18n();
  const { of, multiple, projectId } = overlay.request;
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<readonly PickedItem[]>([]);
  const found = useQuery(PluginsQueries.pick(pluginSlug, of, search, projectId));

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const several = of === 'people' && multiple;
  const isChosen = (item: PickedItem) => chosen.some(({ id }) => id === item.id);
  function pick(item: PickedItem) {
    if (!several) {
      onAnswer(of === 'people' ? [item.value] : item.value);
      return;
    }
    setChosen(isChosen(item) ? chosen.filter(({ id }) => id !== item.id) : [...chosen, item]);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onAnswer(null)}>
      <DialogContent
        title={t(titleOf(of, several))}
        closeLabel={t('plugins.close')}
        className="sm:max-w-md"
      >
        <div className="flex flex-col gap-3">
          <AskedBy plugin={overlay.plugin} />
          {/* The first thing the dialog focuses as it opens: it opens to be typed in. */}
          <Input
            aria-label={t('plugins.overlays.search')}
            value={typed}
            placeholder={t(
              of === 'issue' ? 'plugins.overlays.searchIssues' : 'plugins.overlays.searchPeople',
            )}
            onChange={(event) => setTyped(event.target.value)}
          />
          <Found
            items={found.data}
            loading={found.isPending}
            failed={found.isError}
            several={several}
            isChosen={isChosen}
            onPick={pick}
          />
          {several ? (
            <Button className="self-end" onClick={() => onAnswer(chosen.map(({ value }) => value))}>
              {t('plugins.overlays.choose', { count: chosen.length })}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function titleOf(of: 'issue' | 'people', several: boolean): PlainMessageKey {
  if (of === 'issue') {
    return 'plugins.overlays.pickIssue';
  }
  return several ? 'plugins.overlays.pickPeople' : 'plugins.overlays.pickPerson';
}

/** What shows while nothing is found: the search under way, failed, or done in vain. */
function emptyOf(loading: boolean, failed: boolean): PlainMessageKey {
  if (loading) {
    return 'plugins.overlays.searching';
  }
  return failed ? 'errors.unexpected' : 'plugins.overlays.noneFound';
}

/** What the search found, each a button: picked, or chosen among several. */
function Found({
  items,
  loading,
  failed,
  several,
  isChosen,
  onPick,
}: {
  items: readonly PickedItem[] | undefined;
  loading: boolean;
  failed: boolean;
  several: boolean;
  isChosen: (item: PickedItem) => boolean;
  onPick: (item: PickedItem) => void;
}) {
  const { t } = useI18n();
  if (loading || failed || !items || items.length === 0) {
    return (
      <p role="status" className="py-3 text-sm text-muted-foreground">
        {t(emptyOf(loading, failed))}
      </p>
    );
  }
  return (
    <ul
      aria-label={t('plugins.overlays.found')}
      className="-mx-1 flex max-h-72 flex-col overflow-y-auto"
    >
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            {...(several ? { 'aria-pressed': isChosen(item) } : {})}
            onClick={() => onPick(item)}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none hover:bg-surface-hover focus-visible:bg-surface-hover pointer-coarse:min-h-11"
          >
            {several ? (
              <CheckIcon
                aria-hidden="true"
                className={`size-4 shrink-0 text-primary ${isChosen(item) ? '' : 'invisible'}`}
              />
            ) : null}
            {item.hint ? (
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.hint}</span>
            ) : null}
            <span className="min-w-0 truncate">{item.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
