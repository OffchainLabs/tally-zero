import { ethers } from "ethers";

export interface ProposalCreatedEventData {
  proposalId: string;
  proposer: string;
  targets: string[];
  values: ethers.BigNumber[];
  signatures: string[];
  calldatas: string[];
  startBlock: ethers.BigNumber;
  endBlock: ethers.BigNumber;
  description: string;
  creationBlock: number;
  creationTxHash: string;
}

export function proposalCreatedEventDataFromArgs({
  args,
  blockNumber,
  transactionHash,
}: {
  args: ethers.utils.Result;
  blockNumber: number;
  transactionHash: string;
}): ProposalCreatedEventData | null {
  const proposalId = args.proposalId as ethers.BigNumberish | undefined;
  const proposer = args.proposer as unknown;
  const targets = args.targets as unknown;
  const values = args[3] as unknown;
  const signatures = args.signatures as unknown;
  const calldatas = args.calldatas as unknown;
  const startBlock = args.startBlock as ethers.BigNumberish | undefined;
  const endBlock = args.endBlock as ethers.BigNumberish | undefined;
  const description = args.description as unknown;

  if (proposalId === undefined) return null;
  if (startBlock === undefined || endBlock === undefined) return null;
  if (typeof proposer !== "string") return null;
  if (typeof description !== "string") return null;
  if (!isStringArray(targets)) return null;
  if (!isStringArray(signatures)) return null;
  if (!isStringArray(calldatas)) return null;
  if (!Array.isArray(values)) return null;

  try {
    return {
      proposalId: ethers.BigNumber.from(proposalId).toString(),
      proposer,
      targets,
      values: values.map((value) => ethers.BigNumber.from(value)),
      signatures,
      calldatas,
      startBlock: ethers.BigNumber.from(startBlock),
      endBlock: ethers.BigNumber.from(endBlock),
      description,
      creationBlock: blockNumber,
      creationTxHash: transactionHash,
    };
  } catch {
    return null;
  }
}

export function proposalCreatedEventToData(
  event: Pick<ethers.Event, "args" | "blockNumber" | "transactionHash">
): ProposalCreatedEventData | null {
  if (!event.args) return null;

  return proposalCreatedEventDataFromArgs({
    args: event.args,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
  });
}

/**
 * Scan ProposalCreated events directly from the chain without truncating
 * descriptions. Used as a last-resort fallback for proposals that aren't yet
 * present in the hardcoded list or the bundled gov-tracker cache.
 */
export async function queryProposalCreatedEventsUntruncated({
  contract,
  fromBlock,
  toBlock,
}: {
  contract: ethers.Contract;
  fromBlock: number;
  toBlock: number;
}): Promise<ProposalCreatedEventData[]> {
  const proposalCreatedFilter = contract.filters.ProposalCreated();
  const events = await contract.queryFilter(
    proposalCreatedFilter,
    fromBlock,
    toBlock
  );

  return events.flatMap((event) => {
    const data = proposalCreatedEventToData(event);
    return data ? [data] : [];
  });
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
