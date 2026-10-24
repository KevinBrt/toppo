/** The styles of a text area that decide where its text wraps, given to its measuring copy. */
const WRAPPING_STYLES = [
  'box-sizing',
  'width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'line-height',
  'tab-size',
  'text-indent',
  'text-transform',
  'word-spacing',
] as const;

/**
 * Where a character of a text area is drawn, in pixels from the text area's top left corner,
 * as it is scrolled, with the height of its line. Browsers do not tell it: a hidden copy of the
 * text before it, wrapped the same way, does.
 */
export function characterBox(
  field: HTMLTextAreaElement,
  index: number,
): { top: number; left: number; height: number } {
  const style = getComputedStyle(field);
  const copy = document.createElement('div');
  for (const property of WRAPPING_STYLES) {
    copy.style.setProperty(property, style.getPropertyValue(property));
  }
  copy.style.position = 'absolute';
  copy.style.visibility = 'hidden';
  copy.style.top = '0';
  copy.style.left = '0';
  copy.style.whiteSpace = 'pre-wrap';
  copy.style.overflowWrap = 'break-word';
  copy.textContent = field.value.slice(0, index);
  const marker = document.createElement('span');
  // A character of no width, so that the marker has a line to sit on.
  marker.textContent = '​';
  copy.append(marker);
  document.body.append(copy);
  const box = {
    top: marker.offsetTop - field.scrollTop,
    left: marker.offsetLeft - field.scrollLeft,
    height: marker.offsetHeight,
  };
  copy.remove();
  return box;
}
