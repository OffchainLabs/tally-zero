import { ethers } from "ethers";
import { describe, expect, it } from "vitest";

import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

import {
  proposalCreatedEventDataFromArgs,
  proposalCreatedEventToData,
} from "./proposal-created-event";

const OZ_GOVERNOR_INTERFACE = new ethers.utils.Interface(OZGovernor_ABI);

const PROPOSER = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";

interface ProposalCreatedFixture {
  proposalId: ethers.BigNumberish;
  proposer: string;
  targets: readonly string[];
  values: readonly ethers.BigNumberish[];
  signatures: readonly string[];
  calldatas: readonly string[];
  startBlock: ethers.BigNumberish;
  endBlock: ethers.BigNumberish;
  description: string;
}

function encodeProposalCreatedLog(fixture: ProposalCreatedFixture): {
  topics: string[];
  data: string;
} {
  const fragment = OZ_GOVERNOR_INTERFACE.getEvent("ProposalCreated");
  return {
    topics: [OZ_GOVERNOR_INTERFACE.getEventTopic(fragment)],
    data: OZ_GOVERNOR_INTERFACE.encodeEventLog(fragment, [
      fixture.proposalId,
      fixture.proposer,
      fixture.targets,
      fixture.values,
      fixture.signatures,
      fixture.calldatas,
      fixture.startBlock,
      fixture.endBlock,
      fixture.description,
    ]).data,
  };
}

function parseFixture(
  fixture: ProposalCreatedFixture,
  meta: { blockNumber: number; transactionHash: string }
) {
  const log = encodeProposalCreatedLog(fixture);
  const parsed = OZ_GOVERNOR_INTERFACE.parseLog(log);
  return proposalCreatedEventDataFromArgs({
    args: parsed.args,
    blockNumber: meta.blockNumber,
    transactionHash: meta.transactionHash,
  });
}

describe("proposalCreatedEventDataFromArgs", () => {
  it("returns the description unchanged when shorter than the gov-tracker truncation limit", () => {
    const description = "# Short proposal\n\nbody";

    const data = parseFixture(
      {
        proposalId: "42",
        proposer: PROPOSER,
        targets: [TARGET],
        values: ["0"],
        signatures: [""],
        calldatas: ["0x"],
        startBlock: "1",
        endBlock: "2",
        description,
      },
      { blockNumber: 123, transactionHash: "0xabc" }
    );

    expect(data).not.toBeNull();
    expect(data!.description).toBe(description);
    expect(data!.proposalId).toBe("42");
    expect(data!.proposer).toBe(PROPOSER);
    expect(data!.creationBlock).toBe(123);
    expect(data!.creationTxHash).toBe("0xabc");
  });

  it("preserves descriptions longer than 100,000 characters byte-for-byte", () => {
    // gov-tracker's parser truncates at MAX_DESCRIPTION_LENGTH = 100000 and
    // appends "... [truncated]" — which breaks keccak256(description) for the
    // OZ Governor cancel/hashProposal pathway. The local parser must not.
    const longDescription = "x".repeat(150_000);

    const data = parseFixture(
      {
        proposalId: "1",
        proposer: PROPOSER,
        targets: [TARGET],
        values: ["0"],
        signatures: [""],
        calldatas: ["0x"],
        startBlock: "1",
        endBlock: "2",
        description: longDescription,
      },
      { blockNumber: 1, transactionHash: "0xdeadbeef" }
    );

    expect(data).not.toBeNull();
    expect(data!.description.length).toBe(150_000);
    expect(data!.description).toBe(longDescription);
    expect(data!.description.endsWith("[truncated]")).toBe(false);
  });

  it("returns null when required string args are missing", () => {
    const result = proposalCreatedEventDataFromArgs({
      args: [] as unknown as ethers.utils.Result,
      blockNumber: 1,
      transactionHash: "0x0",
    });

    expect(result).toBeNull();
  });
});

describe("proposalCreatedEventToData", () => {
  it("returns null when the event has no args", () => {
    const result = proposalCreatedEventToData({
      args: undefined,
      blockNumber: 1,
      transactionHash: "0x0",
    } as unknown as Parameters<typeof proposalCreatedEventToData>[0]);
    expect(result).toBeNull();
  });

  it("preserves a long description when parsing a synthesized ethers Event", () => {
    const description = "y".repeat(120_000);
    const log = encodeProposalCreatedLog({
      proposalId: "7",
      proposer: PROPOSER,
      targets: [TARGET],
      values: ["0"],
      signatures: [""],
      calldatas: ["0x"],
      startBlock: "1",
      endBlock: "2",
      description,
    });
    const parsed = OZ_GOVERNOR_INTERFACE.parseLog(log);

    const data = proposalCreatedEventToData({
      args: parsed.args,
      blockNumber: 5,
      transactionHash: "0xfeedface",
    } as unknown as Parameters<typeof proposalCreatedEventToData>[0]);

    expect(data).not.toBeNull();
    expect(data!.description).toBe(description);
    expect(data!.description.length).toBe(120_000);
  });
});
