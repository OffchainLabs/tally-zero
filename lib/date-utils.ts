/**
 * Date and time formatting utilities for the TallyZero application
 */

/** Milliseconds in one second */
export const MS_PER_SECOND = 1000;
/** Milliseconds in one minute */
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
/** Milliseconds in one hour */
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
/** Milliseconds in one day */
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Seconds in one minute */
export const SECONDS_PER_MINUTE = 60;
/** Seconds in one hour */
export const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
/** Seconds in one day */
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/**
 * Format a timestamp to a relative time string
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Relative time string (e.g., "Today", "Yesterday", "3 days ago", "Dec 25, 2024")
 *
 * @example
 * formatRelativeTimestamp(Date.now() / 1000) // "Today"
 * formatRelativeTimestamp(Date.now() / 1000 - 86400) // "Yesterday"
 */
export function formatRelativeTimestamp(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp * MS_PER_SECOND);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / MS_PER_DAY);

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
}

/**
 * Format an ETA timestamp string to a human-readable date/time
 *
 * @param eta - Unix timestamp as string (in seconds)
 * @returns Formatted date/time string or empty string if invalid
 *
 * @example
 * formatEtaTimestamp("1735084800") // "Dec 25, 2024, 12:00 AM"
 */
export function formatEtaTimestamp(eta?: string): string {
  if (!eta) return "";
  const timestamp = parseInt(eta, 10);
  if (isNaN(timestamp)) return "";
  const date = new Date(timestamp * MS_PER_SECOND);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a date relative to the current time (for future dates)
 *
 * @param date - Date to format
 * @returns Formatted string like "Today at 2:00 PM", "Tomorrow at...", "Mon, Dec 25", etc.
 *
 * @example
 * formatDateShort(new Date()) // "Today at 2:00 PM"
 */
export function formatDateShort(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / MS_PER_DAY);

  // If in the past
  if (diffDays < 0) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // If today
  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  // If tomorrow
  if (diffDays === 1) {
    return `Tomorrow at ${date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  // Within a week
  if (diffDays < 7) {
    return `${date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })}`;
  }

  // Further out
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Format a date range as a compact string
 *
 * @param minDate - Start date
 * @param maxDate - End date
 * @returns Formatted range like "Dec 16" (same day), "Dec 16-18" (same month), "Dec 16 - Jan 2"
 */
export function formatDateRange(minDate: Date, maxDate: Date): string {
  const minStr = formatDateShort(minDate);
  const maxStr = formatDateShort(maxDate);

  if (minDate.toDateString() === maxDate.toDateString()) {
    return minStr;
  }

  // Simplify if same month
  const sameMonth =
    minDate.getMonth() === maxDate.getMonth() &&
    minDate.getFullYear() === maxDate.getFullYear();

  if (sameMonth) {
    const month = minDate.toLocaleDateString(undefined, { month: "short" });
    const minDay = minDate.getDate();
    const maxDay = maxDate.getDate();
    return `${month} ${minDay}-${maxDay}`;
  }

  return `${minStr} - ${maxStr}`;
}

export interface EstimatedTimeRange {
  minDate: Date;
  maxDate: Date;
}

/**
 * Format an estimated completion time range
 *
 * @param range - Object with minDate and maxDate
 * @returns Human-readable string like "~3 days from now", "Dec 16-18"
 */
export function formatEstimatedCompletion(range: EstimatedTimeRange): string {
  const now = new Date();
  const minDiffMs = range.minDate.getTime() - now.getTime();
  const maxDiffMs = range.maxDate.getTime() - now.getTime();
  const minDiffDays = Math.ceil(minDiffMs / MS_PER_DAY);
  const maxDiffDays = Math.ceil(maxDiffMs / MS_PER_DAY);

  // If both dates are in the past
  if (maxDiffDays <= 0) {
    return "Expected soon";
  }

  // If dates are the same (no range needed)
  const isSameDay =
    range.minDate.toDateString() === range.maxDate.toDateString();

  // For near-term dates, show relative days
  if (maxDiffDays < 7) {
    if (minDiffDays <= 0) {
      return `Expected soon - ${maxDiffDays} days`;
    }
    if (isSameDay || minDiffDays === maxDiffDays) {
      return `~${minDiffDays} days from now`;
    }
    return `~${minDiffDays}-${maxDiffDays} days from now`;
  }

  // For longer-term dates, show calendar dates
  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year:
        date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });

  if (isSameDay) {
    return formatDate(range.minDate);
  }

  // Check if same month and year
  const sameMonth =
    range.minDate.getMonth() === range.maxDate.getMonth() &&
    range.minDate.getFullYear() === range.maxDate.getFullYear();

  if (sameMonth) {
    // Show "Dec 16-18" format
    const month = range.minDate.toLocaleDateString(undefined, {
      month: "short",
    });
    const minDay = range.minDate.getDate();
    const maxDay = range.maxDate.getDate();
    const year =
      range.minDate.getFullYear() !== new Date().getFullYear()
        ? `, ${range.minDate.getFullYear()}`
        : "";
    return `${month} ${minDay}-${maxDay}${year}`;
  }

  // Different months - show full range
  return `${formatDate(range.minDate)} - ${formatDate(range.maxDate)}`;
}

/**
 * Format a date for Google Calendar URL
 *
 * @param date - Date to format
 * @returns String in YYYYMMDDTHHmmssZ format
 */
export function formatDateForGoogleCalendar(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * Create a Google Calendar event URL
 *
 * @param title - Event title
 * @param startDate - Event start date
 * @param details - Event description
 * @returns Google Calendar URL
 */
export function createGoogleCalendarUrl(
  title: string,
  startDate: Date,
  details: string
): string {
  const endDate = new Date(startDate.getTime() + MS_PER_HOUR);
  const encodedTitle = encodeURIComponent(title);
  const encodedDetails = encodeURIComponent(details);
  const dates = `${formatDateForGoogleCalendar(startDate)}/${formatDateForGoogleCalendar(endDate)}`;

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${dates}&details=${encodedDetails}`;
}
