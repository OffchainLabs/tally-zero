// Synced from agi-l1-voting@59f9c5c (packages/contracts/src/abis/DelegateMappingAbi.ts) by scripts/sync-l1-voting-abis.ts.
// Do not edit; re-run the script to re-pin.
// Generated from the forge build of ArbitrumFoundation/governance@ea130f96 (l1-voting-squashed, PR #383).
export const DelegateMappingAbi = [
  {
    type: "function",
    name: "claim",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimed",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "claimedAccount",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
] as const;
