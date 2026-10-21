// Synced from agi-l1-voting@59f9c5c (packages/contracts/src/abis/L2StateMirrorAbi.ts) by scripts/sync-l1-voting-abis.ts.
// Do not edit; re-run the script to re-pin.
// Generated from the forge build of ArbitrumFoundation/governance@ea130f96 (l1-voting-squashed, PR #383).
export const L2StateMirrorAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_proofHelper",
        type: "address",
        internalType: "address",
      },
      {
        name: "_l2TokenAddress",
        type: "address",
        internalType: "address",
      },
      {
        name: "_l2DelegateCheckpointsSlot",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "_l2TokenTotalDelegationSlot",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "_l2DelegateMappingAddress",
        type: "address",
        internalType: "address",
      },
      {
        name: "_l2DelegateMappingL1AddressSlot",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "_rollup",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "CLAIM_L1_ADDRESS_TYPEHASH",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "checkpointAssertion",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimL1AddressBySig",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "l2Delegate",
        type: "address",
        internalType: "address",
      },
      {
        name: "l1Address",
        type: "address",
        internalType: "address",
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getAssertionHashAt",
    inputs: [
      {
        name: "blockNumber",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getL1AddressAt",
    inputs: [
      {
        name: "l2Delegate",
        type: "address",
        internalType: "address",
      },
      {
        name: "blockNumber",
        type: "uint256",
        internalType: "uint256",
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
    type: "function",
    name: "getTotalDelegationAt",
    inputs: [
      {
        name: "blockNumber",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVotesAt",
    inputs: [
      {
        name: "l2Account",
        type: "address",
        internalType: "address",
      },
      {
        name: "blockNumber",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "l2DelegateCheckpointsSlot",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "l2DelegateMappingAddress",
    inputs: [],
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
    type: "function",
    name: "l2DelegateMappingL1AddressSlot",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "l2TokenAddress",
    inputs: [],
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
    type: "function",
    name: "l2TokenTotalDelegationSlot",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lastSeenLatestConfirmedAssertion",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proofHelper",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract ProofHelper",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proveDelegateMappingStorageRoot",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "accountProof",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "proveL1Address",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "l2Delegate",
        type: "address",
        internalType: "address",
      },
      {
        name: "storageProof",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "proveL2BlockHeader",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "parentAssertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "afterState",
        type: "tuple",
        internalType: "struct AssertionState",
        components: [
          {
            name: "globalState",
            type: "tuple",
            internalType: "struct GlobalState",
            components: [
              {
                name: "bytes32Vals",
                type: "bytes32[2]",
                internalType: "bytes32[2]",
              },
              {
                name: "u64Vals",
                type: "uint64[2]",
                internalType: "uint64[2]",
              },
            ],
          },
          {
            name: "machineStatus",
            type: "uint8",
            internalType: "enum MachineStatus",
          },
          {
            name: "endHistoryRoot",
            type: "bytes32",
            internalType: "bytes32",
          },
        ],
      },
      {
        name: "inboxAcc",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "blockHeaderRlpBytes",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "proveTokenStorageRoot",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "accountProof",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "proveTotalDelegation",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "checkpointLenStorageProof",
        type: "bytes[]",
        internalType: "bytes[]",
      },
      {
        name: "lastCheckpointStorageProof",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "proveVotes",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
      {
        name: "checkpointLenStorageProof",
        type: "bytes[]",
        internalType: "bytes[]",
      },
      {
        name: "lastCheckpointStorageProof",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rollup",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IRollupCore",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "snapshotOf",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "exists",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "l2StateRoot",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "l2BlockNumber",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "l2TokenStorageRoot",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "l2DelegateMappingStorageRoot",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "totalDelegationCheckpoint",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "AssertionCheckpointed",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BlockHeaderProven",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "l2StateRoot",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "l2BlockNumber",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DelegateMappingStorageRootProven",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "l2DelegateMappingStorageRoot",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "L1AddressClaimedBySig",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "l2Delegate",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "l1Address",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "L1AddressProven",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "l2Delegate",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "l1Address",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TokenStorageRootProven",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "l2TokenStorageRoot",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TotalDelegationProven",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "totalDelegation",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "VotesProven",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "votes",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "AlreadyProven",
    inputs: [],
  },
  {
    type: "error",
    name: "AssertionAlreadyCheckpointed",
    inputs: [],
  },
  {
    type: "error",
    name: "AssertionNotCheckpointed",
    inputs: [],
  },
  {
    type: "error",
    name: "BlockHashMismatch",
    inputs: [
      {
        name: "fromHeader",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "fromAssertion",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "BlockHeaderNotProven",
    inputs: [],
  },
  {
    type: "error",
    name: "DelegateMappingStorageRootNotProven",
    inputs: [],
  },
  {
    type: "error",
    name: "GasTooLowForRollupCall",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidAssertionPreimage",
    inputs: [
      {
        name: "assertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "computedAssertionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidSignature",
    inputs: [],
  },
  {
    type: "error",
    name: "L1AddressNotProven",
    inputs: [],
  },
  {
    type: "error",
    name: "NoAssertionCheckpoint",
    inputs: [],
  },
  {
    type: "error",
    name: "StorageRootNotProven",
    inputs: [],
  },
  {
    type: "error",
    name: "TotalDelegationNotProven",
    inputs: [],
  },
  {
    type: "error",
    name: "VotesNotProven",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroL1Address",
    inputs: [],
  },
] as const;
