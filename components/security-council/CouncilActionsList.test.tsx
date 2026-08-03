import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CouncilAction } from "@/lib/council-actions/types";

import { CouncilActionsList } from "./CouncilActionsList";

const EMERGENCY: CouncilAction = {
  id: 30910,
  title: "Security Council Emergency Action – 24/05/2026",
  url: "https://forum.arbitrum.foundation/t/security-council-emergency-action-24-05-2026/30910",
  createdAt: "2026-05-24T18:40:02.150Z",
  kind: "emergency",
};

const NON_EMERGENCY: CouncilAction = {
  id: 31094,
  title: "Non-Emergency Security Action to Correct Total DVP",
  url: "https://forum.arbitrum.foundation/t/non-emergency-security-action-to-correct-total-dvp/31094",
  createdAt: "2026-07-24T03:32:42.430Z",
  kind: "non-emergency",
};

const UNLABELLED: CouncilAction = {
  id: 31081,
  title: "Key Rotation - July 2026",
  url: "https://forum.arbitrum.foundation/t/key-rotation-july-2026/31081",
  createdAt: "2026-07-17T15:43:06.244Z",
  kind: null,
};

function render(props: Parameters<typeof CouncilActionsList>[0]): string {
  return renderToStaticMarkup(<CouncilActionsList {...props} />);
}

/**
 * Visible text with tags stripped. Titles are asserted against this rather than
 * the raw markup because the last word is wrapped in its own span, so the title
 * is not a contiguous string in the HTML.
 */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("CouncilActionsList", () => {
  it("renders each action title linked to its discourse post", () => {
    const html = render({ actions: [NON_EMERGENCY, EMERGENCY] });

    expect(html).toContain(`href="${NON_EMERGENCY.url}"`);
    expect(html).toContain(`href="${EMERGENCY.url}"`);
    expect(visibleText(html)).toContain(NON_EMERGENCY.title);
    expect(visibleText(html)).toContain(EMERGENCY.title);
  });

  it("keeps the external-link glyph on the same line as the last word", () => {
    // Regression guard: the glyph used to be a flex sibling of the title, which
    // parked it beside the first line of a wrapped title, and a plain
    // non-breaking space still let Chromium strand it on a line of its own.
    const html = render({ actions: [UNLABELLED] });

    expect(html).toMatch(
      /Key Rotation - July <span class="whitespace-nowrap">2026<svg/
    );
  });

  it("opens forum links safely in a new tab", () => {
    const html = render({ actions: [EMERGENCY] });

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("shows the created date in a machine-readable time element", () => {
    const html = render({ actions: [NON_EMERGENCY] });

    expect(html).toMatch(
      new RegExp(`datetime="${NON_EMERGENCY.createdAt}"`, "i")
    );
    expect(html).toContain("Jul 24, 2026");
  });

  it("badges emergency and non-emergency actions", () => {
    const html = render({ actions: [EMERGENCY, NON_EMERGENCY] });

    expect(html).toContain("Emergency</div>");
    expect(html).toContain("Non-emergency</div>");
  });

  it("omits the badge when the action kind is unknown", () => {
    const html = render({ actions: [UNLABELLED] });

    expect(visibleText(html)).toContain("Key Rotation - July 2026");
    expect(html).not.toContain("Emergency");
  });

  it("renders an empty state with a forum tag link", () => {
    const html = render({ actions: [] });

    expect(html).toContain("No Security Council actions have been posted yet.");
    expect(html).toContain(
      'href="https://forum.arbitrum.foundation/tag/council-actions"'
    );
  });

  it("renders a fallback when the forum feed failed", () => {
    const html = render({ actions: [], failed: true });

    expect(html).toContain("Could not load Security Council actions");
    expect(html).toContain(
      'href="https://forum.arbitrum.foundation/tag/council-actions"'
    );
    expect(html).not.toContain("No Security Council actions have been posted");
  });
});
