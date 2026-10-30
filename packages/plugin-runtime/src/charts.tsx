import type { BarChartProps, LineChartProps, MeterProps } from '@toppo-tracker/plugin-ui';
import { TriangleAlertIcon } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useScreen } from './hooks.ts';
import { RUNTIME_WORDS } from './screen-context.ts';

/*
 * Charts of plugins' screens, drawn quiet: one series each, in Toppo's accent, thin marks from a
 * single baseline, values in the text's colors. What is past its limit says so with an icon and
 * a word, never by its color alone; every figure is in a table screen readers read.
 */

/** How a figure reads: as the screen says, or as numbers read in the person's language. */
function useFormat(format: ((value: number) => string) | undefined): (value: number) => string {
  const { locale } = useScreen();
  return (
    format ?? ((value) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value))
  );
}

function OverLimit() {
  const { locale } = useScreen();
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-danger">
      <TriangleAlertIcon aria-hidden="true" className="size-3.5" />
      {RUNTIME_WORDS[locale].over}
    </span>
  );
}

/** The figures of a chart, for screen readers: the drawing itself says nothing more. */
function ChartTable({
  title,
  rows,
  limits,
}: {
  title: string;
  rows: readonly { key: string; label: string; value: string; limit?: string | undefined }[];
  limits: boolean;
}) {
  const { locale } = useScreen();
  const words = RUNTIME_WORDS[locale];
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">{words.name}</th>
          <th scope="col">{words.value}</th>
          {limits ? <th scope="col">{words.limit}</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
            {limits ? <td>{row.limit ?? ''}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty() {
  const { locale } = useScreen();
  return <p className="text-sm text-muted-foreground">{RUNTIME_WORDS[locale].noRows}</p>;
}

/** Where a figure falls on a scale from 0 to `top`, in percent. */
const share = (value: number, top: number) =>
  top > 0 ? Math.max(0, Math.min(1, value / top)) * 100 : 0;

export function BarChart({ title, bars, format }: BarChartProps) {
  const read = useFormat(format);
  const { locale } = useScreen();
  const of = RUNTIME_WORDS[locale].of;
  // One scale for every bar, limits included: bars compare with each other, and with them.
  const top = Math.max(0, ...bars.flatMap(({ value, limit }) => [value, limit ?? 0]));
  const limits = bars.some(({ limit }) => limit !== undefined && limit !== null);
  return (
    <figure className="m-0 flex flex-col gap-3">
      <ChartTable
        title={title}
        limits={limits}
        rows={bars.map(({ key, label, value, limit }) => ({
          key,
          label,
          value: read(value),
          limit: limit === undefined || limit === null ? undefined : read(limit),
        }))}
      />
      {bars.length === 0 ? <Empty /> : null}
      <ul aria-hidden="true" className="m-0 flex list-none flex-col gap-3 p-0">
        {bars.map(({ key, label, value, limit }) => {
          const bounded = limit !== undefined && limit !== null;
          const over = bounded && value > limit;
          return (
            <li key={key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-foreground">{label}</span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {over ? <OverLimit /> : null}
                  <span className="tabular-nums">
                    {bounded ? `${read(value)} ${of} ${read(limit)}` : read(value)}
                  </span>
                </span>
              </div>
              <div className="relative h-3">
                <div
                  className={`h-full rounded-r-[4px] ${over ? 'bg-danger' : 'bg-primary'}`}
                  style={{ width: `${share(value, top)}%` }}
                />
                {bounded ? (
                  <div
                    className="absolute -top-1 -bottom-1 w-0.5 bg-muted-foreground"
                    style={{ left: `calc(${share(limit, top)}% - 1px)` }}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** The width of an element as it is drawn, followed as it changes. */
function useWidth(element: { readonly current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const observed = element.current;
    if (!observed) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(observed);
    return () => observer.disconnect();
  }, [element]);
  return width;
}

/** The top of a scale with clean ticks: 1, 2, 2.5 or 5 times a power of ten, at least `max`. */
function cleanTop(max: number): number {
  if (max <= 0) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= max) ?? 10;
  return step * power;
}

const HEIGHT = 168;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

/** Where each of `count` points falls in a plot `width` wide, on a scale from 0 to `top`. */
function geometry(width: number, count: number, top: number) {
  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  return {
    plotHeight,
    step: count <= 1 ? 0 : plotWidth / (count - 1),
    x: (index: number) =>
      PAD.left + (count <= 1 ? plotWidth / 2 : (index * plotWidth) / (count - 1)),
    y: (value: number) => PAD.top + plotHeight - (share(value, top) / 100) * plotHeight,
  };
}

type Geometry = ReturnType<typeof geometry>;

/** The arrows that move along the points, by how far. */
const MOVES: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

export function LineChart({ title, points, format }: LineChartProps) {
  const read = useFormat(format);
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const [at, setAt] = useState<number | null>(null);
  const top = cleanTop(Math.max(0, ...points.map(({ value }) => value)));
  const plot = geometry(width, points.length, top);
  const last = points.length - 1;
  const shown = at === null ? undefined : points[at];
  const toward = (index: number) => setAt(Math.max(0, Math.min(last, index)));

  function point(event: PointerEvent<HTMLDivElement>) {
    const left = event.currentTarget.getBoundingClientRect().left;
    toward(Math.round((event.clientX - left - PAD.left) / (plot.step || 1)));
  }

  function key(event: KeyboardEvent<HTMLDivElement>) {
    const move = MOVES[event.key];
    if (move !== undefined) {
      event.preventDefault();
      toward((at ?? last) + move);
    }
  }

  return (
    <figure className="m-0 flex flex-col gap-2">
      <ChartTable
        title={title}
        limits={false}
        rows={points.map(({ key: id, label, value }) => ({ key: id, label, value: read(value) }))}
      />
      {points.length === 0 ? (
        <Empty />
      ) : (
        // Its figures are in the table above: the drawing is for the eye, and the keyboard.
        <div
          ref={box}
          role="img"
          aria-label={title}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: arrows move along the points, as the pointer does.
          tabIndex={0}
          className="relative outline-none focus-visible:outline-2 focus-visible:outline-ring"
          onPointerMove={point}
          onPointerLeave={() => setAt(null)}
          onFocus={() => setAt(last)}
          onBlur={() => setAt(null)}
          onKeyDown={key}
        >
          {width > 0 ? (
            <LinePlot plot={plot} width={width} points={points} top={top} at={at} read={read} />
          ) : (
            <div style={{ height: HEIGHT }} />
          )}
          {shown && at !== null ? (
            <Tooltip left={plot.x(at)} top={plot.y(shown.value)} width={width}>
              <span className="font-semibold text-foreground tabular-nums">
                {read(shown.value)}
              </span>
              <span className="text-muted-foreground">{shown.label}</span>
            </Tooltip>
          ) : null}
        </div>
      )}
    </figure>
  );
}

/**
 * The line itself: hairline gridlines at clean ticks, the first and last labels, a 2px line, and
 * the point under the pointer (the last one otherwise) ringed with the surface.
 */
function LinePlot({
  plot,
  width,
  points,
  top,
  at,
  read,
}: {
  plot: Geometry;
  width: number;
  points: LineChartProps['points'];
  top: number;
  at: number | null;
  read: (value: number) => string;
}) {
  const last = points.length - 1;
  const marked = at ?? last;
  const path = points
    .map(({ value }, index) => `${index === 0 ? 'M' : 'L'}${plot.x(index)},${plot.y(value)}`)
    .join(' ');
  return (
    <svg width={width} height={HEIGHT} aria-hidden="true" className="block overflow-visible">
      {[0, top / 2, top].map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={plot.y(tick)}
            y2={plot.y(tick)}
            className="stroke-border"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 8}
            y={plot.y(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground text-xs tabular-nums"
          >
            {read(tick)}
          </text>
        </g>
      ))}
      <text
        x={plot.x(0)}
        y={HEIGHT - 8}
        textAnchor={last === 0 ? 'middle' : 'start'}
        className="fill-muted-foreground text-xs"
      >
        {points[0]?.label}
      </text>
      {last > 0 ? (
        <text
          x={plot.x(last)}
          y={HEIGHT - 8}
          textAnchor="end"
          className="fill-muted-foreground text-xs"
        >
          {points[last]?.label}
        </text>
      ) : null}
      {at === null ? null : (
        <line
          x1={plot.x(at)}
          x2={plot.x(at)}
          y1={PAD.top}
          y2={PAD.top + plot.plotHeight}
          className="stroke-muted-foreground"
          strokeWidth={1}
        />
      )}
      <path
        d={path}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={plot.x(marked)}
        cy={plot.y(points[marked]?.value ?? 0)}
        r={4}
        className="fill-primary stroke-surface"
        strokeWidth={2}
      />
    </svg>
  );
}

/** A figure's readout above its point, kept within the chart. */
function Tooltip({
  left,
  top,
  width,
  children,
}: {
  left: number;
  top: number;
  width: number;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute flex -translate-y-full flex-col rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-sm"
      style={{
        left: Math.max(0, Math.min(left - 48, width - 96)),
        top: Math.max(0, top - 10),
        minWidth: 96,
      }}
    >
      {children}
    </div>
  );
}

export function Meter({ label, value, max, format }: MeterProps) {
  const read = useFormat(format);
  const { locale } = useScreen();
  const over = value > max;
  const text = `${read(value)} ${RUNTIME_WORDS[locale].of} ${read(max)}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-foreground">{label}</span>
        <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
          {over ? <OverLimit /> : null}
          <span>{text}</span>
        </span>
      </div>
      {/* Read by screen readers; the bar under it is drawn for the eye, the same in every browser. */}
      <meter className="sr-only" aria-label={label} min={0} max={max} value={value}>
        {text}
      </meter>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-primary-subtle">
        <div
          className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-primary'}`}
          style={{ width: `${share(value, max)}%` }}
        />
      </div>
    </div>
  );
}
