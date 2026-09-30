// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiweGate } from "./SiweGate";

const mocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: mocks.open }),
}));
vi.mock("@/hooks/use-siwe", () => ({
  useSiwe: () => ({ isConnected: false, isSignedIn: false }),
}));

describe("SiweGate", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens wallet connection from the full sign-in card", () => {
    const view = render(
      <SiweGate>
        <p>Authenticated content</p>
      </SiweGate>
    );

    fireEvent.click(view.getByRole("button", { name: "Connect Wallet" }));

    expect(mocks.open).toHaveBeenCalledExactlyOnceWith({ view: "Connect" });
    expect(view.queryByText("Authenticated content")).toBeNull();
  });
});
