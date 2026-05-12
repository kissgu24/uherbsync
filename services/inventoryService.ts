import type { CategoryItem } from '../db/db';

export type DepletionTimeline = {
  daysLeft: number;
  notifyAt14Days: Date | null;
  notifyAt7Days: Date | null;
  notifyAtDepleted: Date | null;
};

/**
 * Returns 9:00 AM local time, N days from today.
 * Returns null if that moment has already passed — prevents retroactive scheduling.
 */
function makeDate(daysFromToday: number): Date | null {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(9, 0, 0, 0);
  return d > new Date() ? d : null;
}

/**
 * Computes when each low-stock threshold will be crossed given the current
 * inventory state.  The anti-spam rule is implicit: makeDate() returns null
 * for any threshold already in the past, so retroactive notifications are
 * never scheduled.
 *
 * Examples (daysLeft → scheduled dates):
 *   20  →  14-day at +6d, 7-day at +13d, depleted at +20d
 *   10  →  14-day null (already crossed), 7-day at +3d, depleted at +10d
 *    5  →  14-day null, 7-day null, depleted at +5d
 *    0  →  all null (today 9AM is past if after 09:00, otherwise depleted fires once)
 */
export function calcDepletionTimeline(item: CategoryItem): DepletionTimeline {
  if (item.dailyDose <= 0) {
    return { daysLeft: Infinity, notifyAt14Days: null, notifyAt7Days: null, notifyAtDepleted: null };
  }

  const totalRemaining = item.subItems
    .filter(s => s.isActive)
    .reduce((sum, s) => sum + s.remaining, 0);

  const daysLeft = Math.floor(totalRemaining / item.dailyDose);

  return {
    daysLeft,
    notifyAt14Days:   makeDate(daysLeft - 14),
    notifyAt7Days:    makeDate(daysLeft - 7),
    notifyAtDepleted: makeDate(daysLeft),
  };
}
