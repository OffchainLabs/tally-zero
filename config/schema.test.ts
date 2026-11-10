import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, it } from "vitest";

import {
  candidateProfileFormSchema,
  formSchema,
  proposalSchema,
  voteSchema,
} from "./schema";

describe("schema validation", () => {
  describe("formSchema", () => {
    it("validates valid Ethereum address", () => {
      const result = formSchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        networkId: "42161",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid Ethereum address", () => {
      const result = formSchema.safeParse({
        address: "not-an-address",
        networkId: "42161",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Invalid Ethereum address");
      }
    });

    it("rejects address with wrong length", () => {
      const result = formSchema.safeParse({
        address: "0x1234", // too short
        networkId: "42161",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid RPC URL", () => {
      const result = formSchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        networkId: "42161",
        rpcUrl: "https://arb1.arbitrum.io/rpc",
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty RPC URL", () => {
      const result = formSchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        networkId: "42161",
        rpcUrl: "",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid RPC URL", () => {
      const result = formSchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        networkId: "42161",
        rpcUrl: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("applies default values", () => {
      const result = formSchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        networkId: "42161",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.autoRun).toBe(false);
        expect(result.data.daysToSearch).toBeDefined();
        expect(result.data.blockRange).toBeDefined();
        expect(result.data.l1BlockRange).toBeDefined();
      }
    });

    it("validates daysToSearch minimum", () => {
      const result = formSchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        networkId: "42161",
        daysToSearch: 0, // below minimum
      });
      expect(result.success).toBe(false);
    });

    it("validates blockRange minimum", () => {
      const result = formSchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        networkId: "42161",
        blockRange: 50, // below minimum of 100
      });
      expect(result.success).toBe(false);
    });
  });

  describe("voteSchema", () => {
    it("accepts vote 0 (Against)", () => {
      const result = voteSchema.safeParse({ vote: "0" });
      expect(result.success).toBe(true);
    });

    it("accepts vote 1 (For)", () => {
      const result = voteSchema.safeParse({ vote: "1" });
      expect(result.success).toBe(true);
    });

    it("accepts vote 2 (Abstain)", () => {
      const result = voteSchema.safeParse({ vote: "2" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid vote value", () => {
      const result = voteSchema.safeParse({ vote: "3" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Please select a valid vote option"
        );
      }
    });

    it("rejects non-numeric vote", () => {
      const result = voteSchema.safeParse({ vote: "yes" });
      expect(result.success).toBe(false);
    });

    it("rejects empty vote", () => {
      const result = voteSchema.safeParse({ vote: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("voteSchema resolver", () => {
    const resolver = zodResolver(voteSchema);
    const options = { fields: {}, shouldUseNativeValidation: false };

    it.each(["0", "1", "2"])(
      "returns valid vote %s to the form",
      async (vote) => {
        await expect(resolver({ vote }, {}, options)).resolves.toEqual({
          values: { vote },
          errors: {},
        });
      }
    );

    it.each(["3", "", "yes"])(
      "returns a field error without throwing for invalid vote %j",
      async (vote) => {
        await expect(resolver({ vote }, {}, options)).resolves.toEqual({
          values: {},
          errors: {
            vote: {
              message: "Please select a valid vote option",
              type: "custom",
            },
          },
        });
      }
    );
  });

  describe("proposalSchema", () => {
    const validProposal = {
      id: "12345",
      proposer: "0x1234567890abcdef1234567890abcdef12345678",
      contractAddress: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
      targets: ["0x0000000000000000000000000000000000000001"],
      values: ["0"],
      signatures: [""],
      calldatas: ["0x"],
      startBlock: "100000000",
      endBlock: "100100000",
      description: "Test proposal",
      networkId: "42161",
      state: "Active",
    };

    it("validates complete proposal", () => {
      const result = proposalSchema.safeParse(validProposal);
      expect(result.success).toBe(true);
    });

    it("accepts proposal with optional creationTxHash", () => {
      const result = proposalSchema.safeParse({
        ...validProposal,
        creationTxHash:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      });
      expect(result.success).toBe(true);
    });

    it("validates proposal without optional fields", () => {
      const result = proposalSchema.safeParse(validProposal);
      expect(result.success).toBe(true);
    });

    it("rejects proposal missing required fields", () => {
      const { id, ...missingId } = validProposal;
      const result = proposalSchema.safeParse(missingId);
      expect(result.success).toBe(false);
    });

    it("validates arrays are present", () => {
      const result = proposalSchema.safeParse({
        ...validProposal,
        targets: [],
        values: [],
        signatures: [],
        calldatas: [],
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("candidateProfileFormSchema", () => {
  const form = {
    name: "  Jane  ",
    title: "   ",
    twitter: "",
    type: "individual",
    representative: "",
    motivation: "",
    experience: "",
    skills: " Solidity, , Rust ",
    projects: "",
    country: "",
  };

  it("trims text, maps blanks to null, and splits skills", () => {
    expect(candidateProfileFormSchema.parse(form)).toEqual({
      name: "Jane",
      title: null,
      twitter: null,
      type: "individual",
      representative: null,
      motivation: null,
      experience: null,
      skills: ["Solidity", "Rust"],
      projects: null,
      country: null,
    });
    expect(
      candidateProfileFormSchema.parse({ ...form, skills: " , " }).skills
    ).toBeNull();
  });

  it("requires a name", () => {
    const result = candidateProfileFormSchema.safeParse({
      ...form,
      name: "   ",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("A name is required.");
  });

  it("stores a handle or profile URL as the bare handle", () => {
    for (const twitter of ["@jane", "https://x.com/jane/status/1"]) {
      expect(
        candidateProfileFormSchema.parse({ ...form, twitter }).twitter
      ).toBe("jane");
    }
  });

  it("rejects a Twitter value that is not a handle", () => {
    const result = candidateProfileFormSchema.safeParse({
      ...form,
      twitter: "https://linktr.ee/jane",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Enter a Twitter / X handle, like @handle."
    );
  });

  it.each([
    "https://twitter.com/i/web/status/1128358947772145672",
    "https://x.com/intent/user?screen_name=jane",
  ])("rejects an internal X route in the Twitter field: %s", (twitter) => {
    const result = candidateProfileFormSchema.safeParse({ ...form, twitter });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Enter a Twitter / X handle, like @handle."
    );
  });
});
