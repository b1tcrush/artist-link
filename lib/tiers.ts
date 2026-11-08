export type Tier = 'u100' | '1k' | '10k' | '100k';
export const TOS_VERSION = '2026-11-03';
export const GENRES = ['Plugg', 'Pluggnb', 'Rage', 'Trap', 'Drill', 'Jerk', 'Boom Bap', 'Cloud Rap', 'Other'];

// Bands (adjust to taste): Under 100 = 0-99 (including artists Last.fm doesn't know)
// 1K = 100-9,999 | 10K = 10,000-99,999 | 100K = 100,000+
export function tierFor(listeners: number): Tier {
  if (listeners >= 100_000) return '100k';
  if (listeners >= 10_000) return '10k';
  if (listeners >= 100) return '1k';
  return 'u100';
}

export function tierLabel(tier: string): string {
  return tier === 'u100' ? 'Under 100' : tier.toUpperCase();
}
