export type Tier = '1k' | '10k' | '100k';
export const TOS_VERSION = '2026-11-03';
export const GENRES = ['Plugg', 'Pluggnb', 'Rage', 'Trap', 'Drill', 'Jerk', 'Boom Bap', 'Cloud Rap', 'Other'];

// Bands (adjust to taste): 1K = 100-9,999 | 10K = 10,000-99,999 | 100K = 100,000+
// Below 100 returns null (not eligible yet).
export function tierFor(listeners: number): Tier | null {
  if (listeners >= 100_000) return '100k';
  if (listeners >= 10_000) return '10k';
  if (listeners >= 100) return '1k';
  return null;
}
