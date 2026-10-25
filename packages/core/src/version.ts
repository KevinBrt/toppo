/** `major.minor.patch` as numbers, or `null` for anything else. */
function partsOf(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/**
 * Whether `candidate` is a later version than `current`, part by part: `0.10.0` comes after
 * `0.9.3`. A version that does not read as `major.minor.patch` is never newer.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = partsOf(candidate);
  const now = partsOf(current);
  if (!(next && now)) {
    return false;
  }
  for (let part = 0; part < 3; part += 1) {
    const difference = (next[part] ?? 0) - (now[part] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return false;
}
