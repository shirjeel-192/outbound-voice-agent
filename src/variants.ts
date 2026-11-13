// A/B testing of voices (or prompts, or anything else a call can vary on).

export interface Variant { id: string; weight: number }

/** Weighted random pick. Zero or negative weights never win. `rng` is injectable for tests. */
export function pickVariant(variants: Variant[], rng: () => number = Math.random): string | null {
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const v of variants) {
    r -= Math.max(0, v.weight);
    if (r < 0) return v.id;
  }
  return variants.findLast(v => v.weight > 0)?.id ?? null;
}

/**
 * Sticky assignment. A lead keeps the variant it was first given, across every retry and callback,
 * so a contact never hears two different voices and each result counts for exactly one arm.
 */
export function assignVariant(current: string | null, variants: Variant[], rng: () => number = Math.random): string | null {
  return current ?? pickVariant(variants, rng);
}
