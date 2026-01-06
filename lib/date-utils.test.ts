import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  createGoogleCalendarUrl,
  formatDateForGoogleCalendar,
  formatDateRange,
  formatDateShort,
  formatEstimatedCompletion,
  formatEtaTimestamp,
  formatRelativeTimestamp,
} from "./date-utils";

describe("date-utils", () => {
  // Mock current time for consistent testing
  const mockNow = new Date("2024-12-15T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("time constants", () => {
    describe("millisecond constants", () => {
      it("MS_PER_SECOND equals 1000", () => {
        expect(MS_PER_SECOND).toBe(1000);
      });

      it("MS_PER_MINUTE equals 60000", () => {
        expect(MS_PER_MINUTE).toBe(60 * 1000);
        expect(MS_PER_MINUTE).toBe(60000);
      });

      it("MS_PER_HOUR equals 3600000", () => {
        expect(MS_PER_HOUR).toBe(60 * 60 * 1000);
        expect(MS_PER_HOUR).toBe(3600000);
      });

      it("MS_PER_DAY equals 86400000", () => {
        expect(MS_PER_DAY).toBe(24 * 60 * 60 * 1000);
        expect(MS_PER_DAY).toBe(86400000);
      });
    });

    describe("seconds constants", () => {
      it("SECONDS_PER_MINUTE equals 60", () => {
        expect(SECONDS_PER_MINUTE).toBe(60);
      });

      it("SECONDS_PER_HOUR equals 3600", () => {
        expect(SECONDS_PER_HOUR).toBe(60 * 60);
        expect(SECONDS_PER_HOUR).toBe(3600);
      });

      it("SECONDS_PER_DAY equals 86400", () => {
        expect(SECONDS_PER_DAY).toBe(24 * 60 * 60);
        expect(SECONDS_PER_DAY).toBe(86400);
      });
    });

    describe("constant relationships", () => {
      it("MS_PER_DAY equals SECONDS_PER_DAY * MS_PER_SECOND", () => {
        expect(MS_PER_DAY).toBe(SECONDS_PER_DAY * MS_PER_SECOND);
      });

      it("MS_PER_HOUR equals SECONDS_PER_HOUR * MS_PER_SECOND", () => {
        expect(MS_PER_HOUR).toBe(SECONDS_PER_HOUR * MS_PER_SECOND);
      });
    });
  });

  describe("formatRelativeTimestamp", () => {
    it("returns empty string for undefined", () => {
      expect(formatRelativeTimestamp(undefined)).toBe("");
    });

    it("returns empty string for 0", () => {
      expect(formatRelativeTimestamp(0)).toBe("");
    });

    it('returns "Today" for today', () => {
      const todayTimestamp = Math.floor(mockNow.getTime() / 1000);
      expect(formatRelativeTimestamp(todayTimestamp)).toBe("Today");
    });

    it('returns "Yesterday" for yesterday', () => {
      const yesterdayTimestamp =
        Math.floor(mockNow.getTime() / 1000) - 24 * 60 * 60;
      expect(formatRelativeTimestamp(yesterdayTimestamp)).toBe("Yesterday");
    });

    it('returns "X days ago" for recent days', () => {
      const threeDaysAgo =
        Math.floor(mockNow.getTime() / 1000) - 3 * 24 * 60 * 60;
      expect(formatRelativeTimestamp(threeDaysAgo)).toBe("3 days ago");
    });

    it("returns formatted date for older dates", () => {
      const twoWeeksAgo =
        Math.floor(mockNow.getTime() / 1000) - 14 * 24 * 60 * 60;
      const result = formatRelativeTimestamp(twoWeeksAgo);
      // Check it contains month and day
      expect(result).toMatch(/\w+ \d+, \d{4}/);
    });
  });

  describe("formatEtaTimestamp", () => {
    it("returns empty string for undefined", () => {
      expect(formatEtaTimestamp(undefined)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(formatEtaTimestamp("")).toBe("");
    });

    it("returns empty string for invalid number", () => {
      expect(formatEtaTimestamp("not-a-number")).toBe("");
    });

    it("formats valid timestamp", () => {
      // Dec 25, 2024 00:00:00 UTC
      const result = formatEtaTimestamp("1735084800");
      expect(result).toMatch(/Dec 25, 2024/);
    });
  });

  describe("formatDateShort", () => {
    it('formats same time with "Today at" prefix', () => {
      // Same time as mock now
      const today = new Date(mockNow);
      const result = formatDateShort(today);
      expect(result).toMatch(/Today at/);
    });

    it('formats 1 day ahead with "Tomorrow at" prefix', () => {
      // Exactly 24 hours from now
      const tomorrow = new Date(mockNow.getTime() + 24 * 60 * 60 * 1000);
      const result = formatDateShort(tomorrow);
      expect(result).toMatch(/Tomorrow at/);
    });

    it("formats dates within a week with weekday", () => {
      const inFourDays = new Date(mockNow);
      inFourDays.setDate(inFourDays.getDate() + 4);
      const result = formatDateShort(inFourDays);
      // Should have weekday abbreviation
      expect(result).toMatch(/\w{3}, \w{3} \d+/);
    });

    it("formats past dates with date and time", () => {
      const yesterday = new Date(mockNow);
      yesterday.setDate(yesterday.getDate() - 2);
      const result = formatDateShort(yesterday);
      expect(result).toMatch(/\w{3} \d+/);
    });
  });

  describe("formatDateRange", () => {
    it("returns single date format for same day", () => {
      const date = new Date(mockNow);
      const result = formatDateRange(date, date);
      expect(result).toMatch(/Today at/);
    });

    it("formats same month range compactly", () => {
      const minDate = new Date("2024-12-16T12:00:00Z");
      const maxDate = new Date("2024-12-20T12:00:00Z");
      const result = formatDateRange(minDate, maxDate);
      expect(result).toBe("Dec 16-20");
    });

    it("formats different month range with both dates", () => {
      const minDate = new Date("2024-12-28T12:00:00Z");
      const maxDate = new Date("2025-01-05T12:00:00Z");
      const result = formatDateRange(minDate, maxDate);
      expect(result).toContain("-");
    });
  });

  describe("formatEstimatedCompletion", () => {
    it('returns "Expected soon" for past dates', () => {
      const pastDate = new Date(mockNow);
      pastDate.setDate(pastDate.getDate() - 1);
      const result = formatEstimatedCompletion({
        minDate: pastDate,
        maxDate: pastDate,
      });
      expect(result).toBe("Expected soon");
    });

    it("returns relative days for near-term dates", () => {
      const minDate = new Date(mockNow);
      minDate.setDate(minDate.getDate() + 3);
      const maxDate = new Date(mockNow);
      maxDate.setDate(maxDate.getDate() + 5);
      const result = formatEstimatedCompletion({ minDate, maxDate });
      expect(result).toMatch(/~\d+-\d+ days from now/);
    });

    it("returns calendar dates for longer-term dates", () => {
      const minDate = new Date("2024-12-25T12:00:00Z");
      const maxDate = new Date("2024-12-27T12:00:00Z");
      const result = formatEstimatedCompletion({ minDate, maxDate });
      expect(result).toBe("Dec 25-27");
    });
  });

  describe("formatDateForGoogleCalendar", () => {
    it("formats date in correct format", () => {
      const date = new Date("2024-12-25T15:30:00Z");
      const result = formatDateForGoogleCalendar(date);
      expect(result).toBe("20241225T153000Z");
    });
  });

  describe("createGoogleCalendarUrl", () => {
    it("creates valid Google Calendar URL", () => {
      const date = new Date("2024-12-25T15:30:00Z");
      const result = createGoogleCalendarUrl(
        "Test Event",
        date,
        "Event details"
      );

      expect(result).toContain("calendar.google.com");
      expect(result).toContain("action=TEMPLATE");
      expect(result).toContain("text=Test%20Event");
      expect(result).toContain("details=Event%20details");
    });

    it("encodes special characters in title and details", () => {
      const date = new Date("2024-12-25T15:30:00Z");
      const result = createGoogleCalendarUrl(
        "Event & Meeting",
        date,
        "Details with spaces & special chars"
      );

      expect(result).toContain("Event%20%26%20Meeting");
    });
  });
});
