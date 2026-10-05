// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./MarkdownEditor";

const theme = vi.hoisted(() => vi.fn());
vi.mock("next-themes", () => ({ useTheme: theme }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function Editor() {
      return <div data-testid="editor" />;
    },
}));
vi.mock("@uiw/react-md-editor", () => ({
  commands: new Proxy({}, { get: (_, name) => ({ name }) }),
  group: () => ({ name: "group" }),
}));
vi.mock("@/lib/create-proposal-form-utils", () => ({
  getProposalPreviewRehypePlugins: () => [],
  getProposalPreviewRemarkPlugins: () => [],
}));

afterEach(cleanup);

describe("MarkdownEditor theme", () => {
  it.each([
    ["dark", "light", "dark"],
    ["light", "dark", "light"],
    [undefined, "light", "light"],
    [undefined, "dark", "dark"],
    [undefined, undefined, "dark"],
  ])(
    "uses %s over resolved %s and renders %s",
    (forcedTheme, resolvedTheme, expected) => {
      theme.mockReturnValue({ forcedTheme, resolvedTheme });
      render(<MarkdownEditor value="" onChange={vi.fn()} />);
      expect(
        screen
          .getByTestId("editor")
          .parentElement?.getAttribute("data-color-mode")
      ).toBe(expected);
    }
  );
});
