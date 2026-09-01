/**
 * Pure helpers for the Security Council snapshot. Kept free of `server-only`
 * imports so the cadence maths stays unit-testable.
 */

import { SECONDS_PER_DAY } from "@/lib/date-utils";

/** Mean Gregorian month, used only to name a month count from a duration. */
const AVERAGE_MONTH_SECONDS = 30.436875 * SECONDS_PER_DAY;

/**
 * Derives the election cadence in months from the start timestamps of the two
 * upcoming elections, which are always one cadence apart (they alternate
 * cohorts).
 *
 * The cadence is a governance parameter (`setCadence`), so it is read off the
 * chain rather than hardcoded: it returned 6 under the original half-yearly
 * schedule and returns 12 under the yearly schedule the executed "Security
 * Council Election Process Improvements" AIP installed, and it will follow any
 * later `setCadence` vote with no code change. Returns null when either
 * timestamp is missing, so callers can drop the interval from their copy
 * instead of guessing.
 */
export function deriveCadenceMonths(
  firstElectionStart: number | null,
  secondElectionStart: number | null
): number | null {
  if (!firstElectionStart || !secondElectionStart) return null;
  if (firstElectionStart <= 0 || secondElectionStart <= 0) return null;

  const gapSeconds = Math.abs(secondElectionStart - firstElectionStart);
  const months = Math.round(gapSeconds / AVERAGE_MONTH_SECONDS);
  return months > 0 ? months : null;
}

const MONTHS_PER_YEAR = 12;

function formatInterval(months: number): string {
  return months === 1 ? "month" : `${months} months`;
}

function formatTermLength(months: number): string {
  if (months % MONTHS_PER_YEAR === 0) {
    return `${months / MONTHS_PER_YEAR}-year`;
  }
  return `${months}-month`;
}

/**
 * The sentence describing how often elections run and how long a member's term
 * therefore lasts. Each election replaces one of the two cohorts, so a term
 * spans two cadences.
 *
 * Phrased as "now" on purpose: the cadence has already changed once, and past
 * elections kept the schedule they were actually held on. The sentence
 * describes the schedule from here on, never the history.
 */
export function describeElectionCadence(months: number | null): string {
  if (!months) {
    return "Each election replaces one cohort, so a member's term spans two election cycles.";
  }

  return `Elections are now held every ${formatInterval(months)} and replace one cohort, so a member serves a ${formatTermLength(months * 2)} term.`;
}
