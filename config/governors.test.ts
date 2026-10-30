import { describe, expect, it } from "vitest";

import {
  getFinalStageForGovernor,
  getGovernorByAddress,
  getGovernorType,
  getGovernorTypeFromName,
  getL1VotingGovernor,
  GOVERNOR_LIST,
  GOVERNORS,
  isArbitrumGovernor,
  isCoreGovernor,
  isL1VotingGovernor,
  isTreasuryGovernor,
  L1_VOTING_GOVERNOR_NAME,
  registerL1VotingGovernor,
} from "./governors";

describe("governors config", () => {
  describe("GOVERNORS", () => {
    it("has core and treasury governors", () => {
      expect(GOVERNORS.core).toBeDefined();
      expect(GOVERNORS.treasury).toBeDefined();
    });

    it("core governor has correct properties", () => {
      const core = GOVERNORS.core;
      expect(core.type).toBe("core");
      expect(core.name).toBe("Core Governor");
      expect(core.hasL1Timelock).toBe(true);
      expect(core.l1TimelockAddress).not.toBeNull();
      expect(core.finalStage).toBe("RETRYABLE_EXECUTED");
    });

    it("treasury governor has correct properties", () => {
      const treasury = GOVERNORS.treasury;
      expect(treasury.type).toBe("treasury");
      expect(treasury.name).toBe("Treasury Governor");
      expect(treasury.hasL1Timelock).toBe(false);
      expect(treasury.l1TimelockAddress).toBeNull();
      expect(treasury.finalStage).toBe("L2_TIMELOCK");
    });
  });

  describe("GOVERNOR_LIST", () => {
    it("contains all governors", () => {
      expect(GOVERNOR_LIST).toHaveLength(2);
      expect(GOVERNOR_LIST.map((g) => g.type)).toContain("core");
      expect(GOVERNOR_LIST.map((g) => g.type)).toContain("treasury");
    });
  });

  describe("getGovernorByAddress", () => {
    it("returns core governor for core address", () => {
      const result = getGovernorByAddress(GOVERNORS.core.address);
      expect(result).toBeDefined();
      expect(result?.type).toBe("core");
    });

    it("returns treasury governor for treasury address", () => {
      const result = getGovernorByAddress(GOVERNORS.treasury.address);
      expect(result).toBeDefined();
      expect(result?.type).toBe("treasury");
    });

    it("returns undefined for unknown address", () => {
      const result = getGovernorByAddress(
        "0x0000000000000000000000000000000000000001"
      );
      expect(result).toBeUndefined();
    });

    it("handles case-insensitive address matching", () => {
      const lowercaseAddress = GOVERNORS.core.address.toLowerCase();
      const result = getGovernorByAddress(lowercaseAddress);
      expect(result).toBeDefined();
      expect(result?.type).toBe("core");
    });
  });

  describe("isCoreGovernor", () => {
    it("returns true for core governor address", () => {
      expect(isCoreGovernor(GOVERNORS.core.address)).toBe(true);
    });

    it("returns false for treasury governor address", () => {
      expect(isCoreGovernor(GOVERNORS.treasury.address)).toBe(false);
    });

    it("returns false for unknown address", () => {
      expect(isCoreGovernor("0x0000000000000000000000000000000000000001")).toBe(
        false
      );
    });

    it("handles case-insensitive matching", () => {
      expect(isCoreGovernor(GOVERNORS.core.address.toLowerCase())).toBe(true);
      expect(isCoreGovernor(GOVERNORS.core.address.toUpperCase())).toBe(true);
    });
  });

  describe("isTreasuryGovernor", () => {
    it("returns true for treasury governor address", () => {
      expect(isTreasuryGovernor(GOVERNORS.treasury.address)).toBe(true);
    });

    it("returns false for core governor address", () => {
      expect(isTreasuryGovernor(GOVERNORS.core.address)).toBe(false);
    });

    it("returns false for unknown address", () => {
      expect(
        isTreasuryGovernor("0x0000000000000000000000000000000000000001")
      ).toBe(false);
    });

    it("handles case-insensitive matching", () => {
      expect(isTreasuryGovernor(GOVERNORS.treasury.address.toLowerCase())).toBe(
        true
      );
    });
  });

  describe("isArbitrumGovernor", () => {
    it("returns true for core governor address", () => {
      expect(isArbitrumGovernor(GOVERNORS.core.address)).toBe(true);
    });

    it("returns true for treasury governor address", () => {
      expect(isArbitrumGovernor(GOVERNORS.treasury.address)).toBe(true);
    });

    it("returns false for unknown address", () => {
      expect(
        isArbitrumGovernor("0x0000000000000000000000000000000000000001")
      ).toBe(false);
    });

    it("handles case-insensitive matching", () => {
      expect(isArbitrumGovernor(GOVERNORS.core.address.toLowerCase())).toBe(
        true
      );
      expect(isArbitrumGovernor(GOVERNORS.treasury.address.toUpperCase())).toBe(
        true
      );
    });
  });

  describe("getFinalStageForGovernor", () => {
    it("returns RETRYABLE_EXECUTED for core governor", () => {
      expect(getFinalStageForGovernor(GOVERNORS.core.address)).toBe(
        "RETRYABLE_EXECUTED"
      );
    });

    it("returns L2_TIMELOCK for treasury governor", () => {
      expect(getFinalStageForGovernor(GOVERNORS.treasury.address)).toBe(
        "L2_TIMELOCK"
      );
    });

    it("returns undefined for unknown address", () => {
      expect(
        getFinalStageForGovernor("0x0000000000000000000000000000000000000001")
      ).toBeUndefined();
    });
  });

  describe("getGovernorType", () => {
    it("returns core for core governor address", () => {
      expect(getGovernorType(GOVERNORS.core.address)).toBe("core");
    });

    it("returns treasury for treasury governor address", () => {
      expect(getGovernorType(GOVERNORS.treasury.address)).toBe("treasury");
    });

    it("returns undefined for unknown address", () => {
      expect(
        getGovernorType("0x0000000000000000000000000000000000000001")
      ).toBeUndefined();
    });
  });

  describe("getGovernorTypeFromName", () => {
    it("returns core for names containing 'core'", () => {
      expect(getGovernorTypeFromName("Core Governor")).toBe("core");
      expect(getGovernorTypeFromName("Arbitrum Core")).toBe("core");
      expect(getGovernorTypeFromName("CORE")).toBe("core");
    });

    it("returns treasury for names not containing 'core'", () => {
      expect(getGovernorTypeFromName("Treasury Governor")).toBe("treasury");
      expect(getGovernorTypeFromName("Funding")).toBe("treasury");
      expect(getGovernorTypeFromName("Other")).toBe("treasury");
    });

    it("returns treasury for undefined", () => {
      expect(getGovernorTypeFromName(undefined)).toBe("treasury");
    });

    it("returns treasury for empty string", () => {
      expect(getGovernorTypeFromName("")).toBe("treasury");
    });
  });

  describe("L1 voting governor", () => {
    const address = "0x00000000000000000000000000000000000d11d1";

    it("is unknown until an indexer entry registers it", () => {
      expect(isL1VotingGovernor(address)).toBe(false);
      expect(getGovernorType(address)).toBeUndefined();
    });

    it("is recognized as l1, and as neither Core nor Treasury", () => {
      const config = registerL1VotingGovernor(address, 1337);

      expect(config).toMatchObject({
        type: "l1",
        name: L1_VOTING_GOVERNOR_NAME,
        chainId: 1337,
      });
      expect(
        isL1VotingGovernor(address.toUpperCase().replace("0X", "0x"))
      ).toBe(true);
      expect(getGovernorType(address)).toBe("l1");
      expect(getL1VotingGovernor(address)?.chainId).toBe(1337);
      expect(isCoreGovernor(address)).toBe(false);
      expect(isTreasuryGovernor(address)).toBe(false);
      expect(isArbitrumGovernor(address)).toBe(false);
      expect(getGovernorByAddress(address)).toBeUndefined();
      expect(getFinalStageForGovernor(address)).toBeUndefined();
    });

    it("stays out of the proposable governor list", () => {
      expect(GOVERNOR_LIST.map((g) => g.type)).not.toContain("l1");
    });

    it("maps its display name to l1, not treasury", () => {
      expect(getGovernorTypeFromName(L1_VOTING_GOVERNOR_NAME)).toBe("l1");
    });
  });
});
