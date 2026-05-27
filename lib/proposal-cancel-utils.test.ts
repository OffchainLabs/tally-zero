import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  stringToBytes,
  toFunctionSelector,
  type Abi,
} from "viem";
import { describe, expect, it } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS } from "@/config/governors";

import { buildCancelArgs } from "./proposal-cancel-utils";

const OZ_GOVERNOR_CANCEL_SELECTOR = "0x452115d6";
const OZ_GOVERNOR_CANCEL_SIGNATURE =
  "cancel(address[],uint256[],bytes[],bytes32)";

const CANCEL_ABI = [
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "calldatas", type: "bytes[]" },
      { name: "descriptionHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

const PROPOSER = "0x1111111111111111111111111111111111111111";
const OTHER_ACCOUNT = "0x2222222222222222222222222222222222222222";

describe("buildCancelArgs", () => {
  it("builds cancel args from a proposal", () => {
    const args = buildCancelArgs({
      id: "123",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [PROPOSER],
      values: ["0"],
      signatures: [""],
      calldatas: ["0x12345678"],
      startBlock: "1",
      endBlock: "2",
      description: "# Test Proposal",
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });

    expect(args).toEqual([
      [PROPOSER],
      [BigInt(0)],
      ["0x12345678"],
      keccak256(stringToBytes("# Test Proposal")),
    ]);
  });

  it("returns null cancel args when targets are missing", () => {
    const args = buildCancelArgs({
      id: "123",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [],
      values: [],
      signatures: [],
      calldatas: [],
      startBlock: "1",
      endBlock: "2",
      description: "# Test Proposal",
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });

    expect(args).toBeNull();
  });

  it("produces encoded calldata whose selector matches the OZ Governor cancel selector", () => {
    expect(toFunctionSelector(OZ_GOVERNOR_CANCEL_SIGNATURE)).toBe(
      OZ_GOVERNOR_CANCEL_SELECTOR
    );

    const args = buildCancelArgs({
      id: "123",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [PROPOSER],
      values: ["0"],
      signatures: [""],
      calldatas: ["0xdeadbeef"],
      startBlock: "1",
      endBlock: "2",
      description: "# Cancel Me",
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });
    expect(args).not.toBeNull();

    const encoded = encodeFunctionData({
      abi: CANCEL_ABI,
      functionName: "cancel",
      args: args!,
    });
    expect(encoded.slice(0, 10)).toBe(OZ_GOVERNOR_CANCEL_SELECTOR);
  });

  it("encodes args that round-trip through decodeFunctionData", () => {
    const targets = [PROPOSER, OTHER_ACCOUNT];
    const values = ["1000000000000000000", "0"];
    const calldatas = ["0x12345678", "0xabcdef00"];
    const description = "# Multi-action proposal";

    const args = buildCancelArgs({
      id: "456",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.core.address,
      targets,
      values,
      signatures: ["", ""],
      calldatas,
      startBlock: "1",
      endBlock: "2",
      description,
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });
    expect(args).not.toBeNull();

    const encoded = encodeFunctionData({
      abi: CANCEL_ABI,
      functionName: "cancel",
      args: args!,
    });
    const decoded = decodeFunctionData({ abi: CANCEL_ABI, data: encoded });

    expect(decoded.functionName).toBe("cancel");
    expect(decoded.args).toEqual([
      targets,
      [BigInt(values[0]), BigInt(values[1])],
      calldatas,
      keccak256(stringToBytes(description)),
    ]);
  });

  it("computes descriptionHash as keccak256(utf8(description)) to match OZ hashProposal", () => {
    const description = "# Proposal title\n\nSome details";

    const args = buildCancelArgs({
      id: "789",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [PROPOSER],
      values: ["0"],
      signatures: [""],
      calldatas: ["0x"],
      startBlock: "1",
      endBlock: "2",
      description,
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });

    const descriptionHash = args![3];
    expect(descriptionHash).toBe(keccak256(stringToBytes(description)));

    // OZ hashProposal: uint256(keccak256(abi.encode(targets, values, calldatas, descriptionHash)))
    const encodedTuple = encodeAbiParameters(
      [
        { type: "address[]" },
        { type: "uint256[]" },
        { type: "bytes[]" },
        { type: "bytes32" },
      ],
      args!
    );
    const proposalId = BigInt(keccak256(encodedTuple));
    expect(proposalId).toBeGreaterThan(BigInt(0));
  });

  it("converts string values to bigint for the uint256[] argument", () => {
    const args = buildCancelArgs({
      id: "1",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [PROPOSER],
      values: ["1000000000000000000"],
      signatures: [""],
      calldatas: ["0x"],
      startBlock: "1",
      endBlock: "2",
      description: "test",
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });

    expect(args).not.toBeNull();
    expect(args![1][0]).toBe(BigInt("1000000000000000000"));
    expect(typeof args![1][0]).toBe("bigint");
  });

  it("computes descriptionHash over the full long description, not a display-truncated version", () => {
    // Regression: gov-tracker's queryProposalCreatedEvents truncates
    // descriptions over 100,000 chars to "<first 100k>... [truncated]".
    // If useProposalById ever fed that truncated string back into
    // buildCancelArgs, cancel(...) would receive a hash the Governor
    // contract does not recognize. The descriptionHash must always be
    // computed over the original, untruncated description.
    const GOV_TRACKER_MAX_LEN = 100_000;
    const longDescription = "L".repeat(150_000);
    const truncatedForDisplay =
      longDescription.slice(0, GOV_TRACKER_MAX_LEN) + "... [truncated]";

    const args = buildCancelArgs({
      id: "999",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [PROPOSER],
      values: ["0"],
      signatures: [""],
      calldatas: ["0x"],
      startBlock: "1",
      endBlock: "2",
      description: longDescription,
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });

    expect(args).not.toBeNull();
    const descriptionHash = args![3];
    expect(descriptionHash).toBe(keccak256(stringToBytes(longDescription)));
    expect(descriptionHash).not.toBe(
      keccak256(stringToBytes(truncatedForDisplay))
    );
  });

  it("rejects malformed proposal data so we never encode an invalid cancel call", () => {
    // Non-hex calldata
    expect(
      buildCancelArgs({
        id: "1",
        proposer: PROPOSER,
        contractAddress: GOVERNORS.treasury.address,
        targets: [PROPOSER],
        values: ["0"],
        signatures: [""],
        calldatas: ["not-hex"],
        startBlock: "1",
        endBlock: "2",
        description: "test",
        networkId: String(ARBITRUM_CHAIN_ID),
        state: "Pending",
      })
    ).toBeNull();

    // Invalid address in targets
    expect(
      buildCancelArgs({
        id: "1",
        proposer: PROPOSER,
        contractAddress: GOVERNORS.treasury.address,
        targets: ["0xnot-an-address"],
        values: ["0"],
        signatures: [""],
        calldatas: ["0x"],
        startBlock: "1",
        endBlock: "2",
        description: "test",
        networkId: String(ARBITRUM_CHAIN_ID),
        state: "Pending",
      })
    ).toBeNull();

    // Length mismatch between arrays
    expect(
      buildCancelArgs({
        id: "1",
        proposer: PROPOSER,
        contractAddress: GOVERNORS.treasury.address,
        targets: [PROPOSER, OTHER_ACCOUNT],
        values: ["0"],
        signatures: [""],
        calldatas: ["0x"],
        startBlock: "1",
        endBlock: "2",
        description: "test",
        networkId: String(ARBITRUM_CHAIN_ID),
        state: "Pending",
      })
    ).toBeNull();

    // Non-numeric value
    expect(
      buildCancelArgs({
        id: "1",
        proposer: PROPOSER,
        contractAddress: GOVERNORS.treasury.address,
        targets: [PROPOSER],
        values: ["not-a-number"],
        signatures: [""],
        calldatas: ["0x"],
        startBlock: "1",
        endBlock: "2",
        description: "test",
        networkId: String(ARBITRUM_CHAIN_ID),
        state: "Pending",
      })
    ).toBeNull();
  });
});
