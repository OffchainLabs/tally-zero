import { describe, expect, it } from "vitest";

import {
  delegateMatchesSearch,
  getDelegateLabel,
  type TallyDelegateListItem,
} from "./delegate-data";

describe("delegate-data", () => {
  describe("getDelegateLabel", () => {
    it("returns undefined for unknown addresses", () => {
      expect(
        getDelegateLabel("0x0000000000000000000000000000000000000001")
      ).toBeUndefined();
    });

    it("handles case-insensitive lookup", () => {
      const lowerAddress = "0xabcdef1234567890abcdef1234567890abcdef12";
      const upperAddress = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";
      expect(getDelegateLabel(lowerAddress)).toBe(
        getDelegateLabel(upperAddress)
      );
    });
  });

  describe("delegateMatchesSearch", () => {
    it("matches delegate display metadata", () => {
      const delegate: TallyDelegateListItem = {
        address: "0x1234567890abcdef1234567890abcdef12345678",
        votingPower: "1000",
        votesCount: "1000",
        delegatorsCount: 1,
        isPrioritized: false,
        ens: "example.eth",
        name: "Example Delegate",
        picture: null,
        knownLabel: "Known Delegate",
        displayName: "Known Delegate",
      };

      expect(delegateMatchesSearch(delegate, "known")).toBe(true);
      expect(delegateMatchesSearch(delegate, "example.eth")).toBe(true);
      expect(delegateMatchesSearch(delegate, "nomatch")).toBe(false);
    });
  });
});
