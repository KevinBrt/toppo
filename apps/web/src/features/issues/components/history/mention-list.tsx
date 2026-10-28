import { useQuery } from '@tanstack/react-query';
import { Avatar, cn, toneClassName } from '@toppo-tracker/ui';
import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { Mentionable, MentionQuery } from '../../models/mention.model.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { characterBox } from '../../utils/caret.util.ts';
import { insertMention, mentionQueryAt, mentionsIn } from '../../utils/mentions.util.ts';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 200;

/** The list's width (`w-72`), to keep it inside the text area's width. */
const LIST_WIDTH_PX = 288;

/** Between the line of the `@` and the list. */
const LIST_OFFSET_PX = 4;

const sameQuery = (a: MentionQuery | null, b: MentionQuery | null) =>
  a?.start === b?.start && a?.search === b?.search;

/**
 * Lets a comment's text name people: typing `@` and the start of a name offers those the comment
 * may name, just under the `@`, picked with the arrows and Enter, or a tap. Spread `field` on the
 * text area and show `list` beside it, both in a `relative` box that starts where the text area
 * does; `mentions()` answers whom the text names on sending.
 */
export function useMentions({
  issueKey,
  value,
  onChange,
}: {
  issueKey: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const listId = useId();
  const titleId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const caretAfterPick = useRef<number | null>(null);
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Mentionable[]>([]);
  const people = useQuery({
    ...IssuesQueries.mentionable(issueKey, search ?? ''),
    enabled: search !== null,
  });
  const options = query && search !== null ? (people.data ?? []) : [];
  const open = options.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query ? query.search.trim() : null), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // A name picked: the caret goes after it, once the text shows it.
  useLayoutEffect(() => {
    if (caretAfterPick.current !== null) {
      ref.current?.setSelectionRange(caretAfterPick.current, caretAfterPick.current);
      caretAfterPick.current = null;
    }
  });

  const follow = (field: HTMLTextAreaElement) => {
    const caret = field.selectionStart;
    const next = caret === field.selectionEnd ? mentionQueryAt(field.value, caret) : null;
    if (sameQuery(query, next)) {
      return;
    }
    if (next && next.start !== query?.start) {
      const at = characterBox(field, next.start);
      setAnchor({
        top: at.top + at.height + LIST_OFFSET_PX,
        left: Math.max(0, Math.min(at.left, field.offsetWidth - LIST_WIDTH_PX)),
      });
    }
    setQuery(next);
    setActive(0);
  };

  const pick = (person: Mentionable) => {
    if (!query) {
      return;
    }
    const next = insertMention(value, query, person.name);
    caretAfterPick.current = next.caret;
    setPicked([...picked, person]);
    setQuery(null);
    onChange(next.text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) {
      return;
    }
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      setActive((active + move + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const person = options[active];
      if (person) {
        event.preventDefault();
        pick(person);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setQuery(null);
    }
  };

  const field = {
    ref,
    'aria-autocomplete': 'list' as const,
    'aria-controls': open ? listId : undefined,
    'aria-activedescendant': open ? `${listId}-${active}` : undefined,
    onChange: (event: SyntheticEvent<HTMLTextAreaElement>) => {
      onChange(event.currentTarget.value);
      follow(event.currentTarget);
    },
    onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => follow(event.currentTarget),
    onBlur: () => setQuery(null),
    onKeyDown,
  };

  const list: ReactNode = open ? (
    <div
      style={anchor}
      className="absolute z-10 w-72 max-w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
    >
      <p id={titleId} className="px-3 pt-3 pb-1.5 text-sm font-semibold text-muted-foreground">
        {t('issues.comments.mentionTitle')}
      </p>
      <div
        id={listId}
        role="listbox"
        aria-labelledby={titleId}
        className="max-h-72 overflow-y-auto px-1.5 pb-1.5"
      >
        {options.map((person, index) => (
          <div
            key={person.id}
            id={`${listId}-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === active}
            onMouseMove={() => setActive(index)}
            // The text area keeps the focus, so that typing goes on.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(person)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                pick(person);
              }
            }}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5',
              index === active && 'bg-primary-subtle',
            )}
          >
            <Avatar name={person.name} className={cn('size-9', toneClassName(person.role.color))} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {person.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {person.role.name}
              </span>
            </span>
          </div>
        ))}
      </div>
      {/* The keys, for those who type: on a touch screen, a tap picks. */}
      <p
        aria-hidden="true"
        className="border-t border-border px-3 py-2 text-xs text-muted-foreground pointer-coarse:hidden"
      >
        {t('issues.comments.mentionKeys')}
      </p>
    </div>
  ) : null;

  return {
    field,
    list,
    /** Whom the text names, among the people picked: by id, once each. */
    mentions: (text: string) => mentionsIn(text, picked),
    /** Forgets the people picked, once the text is sent. */
    reset: () => setPicked([]),
  };
}
