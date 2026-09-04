import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DraftSaveStatusBar, formatSaveAge } from "./DraftSaveStatusBar";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

describe("DraftSaveStatusBar", () => {
  it("reads Not saved for a blank form nothing has been written for", () => {
    const markup = renderToStaticMarkup(
      <DraftSaveStatusBar status={{ kind: "never" }} isDirty={false} />
    );

    expect(markup).toContain('data-state="never"');
    expect(markup).toContain("Not saved");
    expect(markup).not.toContain("<time");
  });

  // Dirty wins over any prior save: the user has edits that are nowhere yet.
  it("reads Unsaved changes while edits are newer than the last save", () => {
    const at = Date.now() - 5_000;
    const markup = renderToStaticMarkup(
      <DraftSaveStatusBar status={{ kind: "local", at }} isDirty />
    );

    expect(markup).toContain('data-state="unsaved"');
    expect(markup).toContain("Unsaved changes");
    expect(markup).toContain("Last saved on this browser.");
    expect(markup).toContain("just now");
  });

  it("names this browser as the only place a local save lives", () => {
    const at = Date.now() - 3 * 60_000;
    const markup = renderToStaticMarkup(
      <DraftSaveStatusBar status={{ kind: "local", at }} isDirty={false} />
    );

    expect(markup).toContain('data-state="local"');
    expect(markup).toContain("Saved on this browser only");
    expect(markup).toContain("Save to your drafts to keep it across devices.");
    expect(markup).toContain("3 min ago");
    expect(markup).toContain(new Date(at).toISOString());
  });

  it("says when a local copy was restored over the server draft", () => {
    const markup = renderToStaticMarkup(
      <DraftSaveStatusBar
        status={{ kind: "local", at: Date.now() }}
        isDirty={false}
        restoredFromLocal
      />
    );

    expect(markup).toContain("Restored unsaved edits from this browser");
  });

  it("names the account a server save went to", () => {
    const markup = renderToStaticMarkup(
      <DraftSaveStatusBar
        status={{ kind: "server", at: Date.now(), address: ADDRESS }}
        isDirty={false}
      />
    );

    expect(markup).toContain('data-state="server"');
    expect(markup).toContain("Saved to your drafts as 0x1234...5678");
    expect(markup).toContain("Reopen it any time from My Drafts.");
  });

  it("copes with a server save whose subject is unknown", () => {
    const markup = renderToStaticMarkup(
      <DraftSaveStatusBar
        status={{ kind: "server", at: Date.now(), address: null }}
        isDirty={false}
      />
    );

    expect(markup).toContain("Saved to your drafts</p>");
  });
});

describe("formatSaveAge", () => {
  const now = Date.UTC(2026, 8, 4, 12, 0, 0);

  it("rounds to the nearest sensible unit", () => {
    expect(formatSaveAge(now - 10_000, now)).toBe("just now");
    expect(formatSaveAge(now - 44_000, now)).toBe("just now");
    expect(formatSaveAge(now - 60_000, now)).toBe("1 min ago");
    expect(formatSaveAge(now - 7 * 60_000, now)).toBe("7 min ago");
    expect(formatSaveAge(now - 2 * 3_600_000, now)).toBe("2 h ago");
  });

  it("falls back to the date after a day", () => {
    const at = now - 3 * 86_400_000;
    expect(formatSaveAge(at, now)).toBe(new Date(at).toLocaleDateString());
  });

  it("never reports a negative age for clock skew", () => {
    expect(formatSaveAge(now + 60_000, now)).toBe("just now");
  });
});
