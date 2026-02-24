export function cacheKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .map((part) => String(part))
    .join(':');
}

export function cacheTtlMs(ttlSec: number): number {
  return Math.max(1, ttlSec) * 1000;
}
