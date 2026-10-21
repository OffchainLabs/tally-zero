import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  hashMessage,
  hashTypedData,
  hexToNumber,
  keccak256,
  parseAbi,
  parseAbiParameters,
  recoverAddress,
  sliceHex,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approvalsIfExecutedBy,
  mergedSignatures,
  safeEcdsaSignature,
  safeTxTypedData,
  type SafeTxState,
} from "./safe";
import {
  ecdsaConfirmations,
  proposalBody,
  safeTxServiceClient,
  SafeTxServiceError,
  safeTxServiceUrl,
} from "./safe-tx-service";

const SAFE = getAddress("0x5afe00000000000000000000000000000000beef");
const MAPPING = getAddress("0x00000000000000000000000000000000000d0e11");
const CHAIN_ID = 42161;

// Three owners with real keys, so recovery checks the encoding end to end
const alice = privateKeyToAccount(`0x${"11".repeat(32)}`);
const bob = privateKeyToAccount(`0x${"22".repeat(32)}`);
const carol = privateKeyToAccount(`0x${"33".repeat(32)}`);

const call = {
  to: MAPPING,
  data: encodeFunctionData({
    abi: parseAbi(["function claim(address l1Address)"]),
    args: ["0x00000000000000000000000000000000000000e1"],
  }),
};

// Safe's own hashing (Safe.sol getTransactionHash), independent of viem's EIP-712 helper
function safeContractTxHash(nonce: bigint): Hex {
  const DOMAIN_TYPEHASH =
    "0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218";
  const SAFE_TX_TYPEHASH =
    "0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8";
  const domainSeparator = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, address"), [
      DOMAIN_TYPEHASH,
      BigInt(CHAIN_ID),
      SAFE,
    ])
  );
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "bytes32, address, uint256, bytes32, uint8, uint256, uint256, uint256, address, address, uint256"
      ),
      [
        SAFE_TX_TYPEHASH,
        call.to,
        BigInt(0),
        keccak256(call.data),
        0,
        BigInt(0),
        BigInt(0),
        BigInt(0),
        zeroAddress,
        zeroAddress,
        nonce,
      ]
    )
  );
  return keccak256(concatHex(["0x1901", domainSeparator, structHash]));
}

function state(overrides: Partial<SafeTxState> = {}): SafeTxState {
  const nonce = BigInt(7);
  return {
    safe: SAFE,
    call,
    nonce,
    safeTxHash: safeContractTxHash(nonce),
    threshold: 2,
    owners: [alice.address, bob.address, carol.address],
    approvedBy: [],
    ...overrides,
  };
}

/** What Safe's checkNSignatures would see: the owner each 65-byte entry proves */
async function signers(signatures: Hex, safeTxHash: Hex): Promise<Address[]> {
  const out: Address[] = [];
  for (let i = 0; i * 65 < (signatures.length - 2) / 2; i++) {
    const sig = sliceHex(signatures, i * 65, (i + 1) * 65);
    const v = hexToNumber(sliceHex(sig, 64, 65));
    if (v === 1) {
      out.push(getAddress(sliceHex(sig, 12, 32)));
    } else if (v > 30) {
      const ethSigned = concatHex([sliceHex(sig, 0, 64), toHex(v - 4)]);
      out.push(
        await recoverAddress({
          hash: hashMessage({ raw: safeTxHash }),
          signature: ethSigned,
        })
      );
    } else {
      out.push(await recoverAddress({ hash: safeTxHash, signature: sig }));
    }
  }
  return out;
}

const ascending = (addresses: Address[]) =>
  [...addresses].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));

describe("SafeTx typed data", () => {
  it("hashes to the Safe contract's transaction hash", () => {
    const s = state();
    expect(hashTypedData(safeTxTypedData(s, CHAIN_ID))).toBe(s.safeTxHash);
  });
});

describe("Safe signature encoding", () => {
  it("keeps an EIP-712 signature's v and recovers the owner over the safeTxHash", async () => {
    const s = state();
    const signature = await alice.signTypedData(safeTxTypedData(s, CHAIN_ID));
    const encoded = safeEcdsaSignature(signature, "EIP712");
    expect(encoded).toBe(signature);
    expect(await signers(encoded, s.safeTxHash)).toEqual([alice.address]);
  });

  it("lifts an eth_sign signature's v by 4", async () => {
    const s = state();
    const signature = await bob.signMessage({ message: { raw: s.safeTxHash } });
    const encoded = safeEcdsaSignature(signature, "ETH_SIGN");
    expect(hexToNumber(sliceHex(encoded, 64, 65))).toBe(
      hexToNumber(sliceHex(signature, 64, 65)) + 4
    );
    expect(await signers(encoded, s.safeTxHash)).toEqual([bob.address]);
    // Already adjusted (as the service stores it): unchanged
    expect(safeEcdsaSignature(encoded, "ETH_SIGN")).toBe(encoded);
  });

  it("normalizes a 0/1 v to 27/28", async () => {
    const s = state();
    const signature = await alice.signTypedData(safeTxTypedData(s, CHAIN_ID));
    const v = hexToNumber(sliceHex(signature, 64, 65));
    const low = concatHex([sliceHex(signature, 0, 64), toHex(v - 27)]);
    expect(safeEcdsaSignature(low, "EIP712")).toBe(signature);
  });

  it("rejects anything but 65 bytes", () => {
    expect(() => safeEcdsaSignature("0x1234", "EIP712")).toThrow();
  });

  it("merges off-chain signatures with on-chain approvals, one per owner, ascending", async () => {
    const s = state({ approvedBy: [carol.address] });
    const typed = safeTxTypedData(s, CHAIN_ID);
    const offchain = [
      {
        owner: alice.address,
        signature: await alice.signTypedData(typed),
        kind: "EIP712" as const,
      },
      {
        owner: bob.address,
        signature: safeEcdsaSignature(
          await bob.signMessage({ message: { raw: s.safeTxHash } }),
          "ETH_SIGN"
        ),
        kind: "ETH_SIGN" as const,
      },
      // Carol also signed off chain; her on-chain approval wins
      {
        owner: carol.address,
        signature: await carol.signTypedData(typed),
        kind: "EIP712" as const,
      },
    ];

    const encoded = mergedSignatures(s, offchain);

    expect((encoded.length - 2) / 2).toBe(3 * 65);
    expect(await signers(encoded, s.safeTxHash)).toEqual(
      ascending([alice.address, bob.address, carol.address])
    );
    const carolEntry = ascending([
      alice.address,
      bob.address,
      carol.address,
    ]).indexOf(carol.address);
    expect(
      hexToNumber(sliceHex(encoded, carolEntry * 65 + 64, carolEntry * 65 + 65))
    ).toBe(1);
  });

  it("adds the executor's own pre-validated entry and drops non-owners", async () => {
    const s = state();
    const stranger = privateKeyToAccount(`0x${"44".repeat(32)}`);
    const typed = safeTxTypedData(s, CHAIN_ID);
    const encoded = mergedSignatures(
      s,
      [
        {
          owner: alice.address,
          signature: await alice.signTypedData(typed),
          kind: "EIP712",
        },
        {
          owner: stranger.address,
          signature: await stranger.signTypedData(typed),
          kind: "EIP712",
        },
      ],
      bob.address
    );
    expect(await signers(encoded, s.safeTxHash)).toEqual(
      ascending([alice.address, bob.address])
    );
  });

  it("counts off-chain signers toward the threshold", () => {
    const s = state({ approvedBy: [carol.address] });
    expect(approvalsIfExecutedBy(s, undefined, [alice.address])).toBe(2);
    expect(approvalsIfExecutedBy(s, bob.address, [alice.address])).toBe(3);
    expect(
      approvalsIfExecutedBy(s, undefined, [
        "0x00000000000000000000000000000000000000cc",
      ])
    ).toBe(1);
  });
});

describe("safeTxServiceUrl", () => {
  it("defaults to Safe's hosted service on Arbitrum One", () => {
    expect(safeTxServiceUrl(42161, undefined, false)).toBe(
      "https://safe-transaction-arbitrum.safe.global"
    );
    expect(safeTxServiceUrl(1, undefined, false)).toBeNull();
  });

  it("is off on the local chains unless set", () => {
    expect(safeTxServiceUrl(412346, undefined, true)).toBeNull();
    expect(safeTxServiceUrl(42161, undefined, true)).toBeNull();
    expect(safeTxServiceUrl(412346, "http://localhost:8000/", true)).toBe(
      "http://localhost:8000"
    );
  });

  it("prefers the configured URL", () => {
    expect(safeTxServiceUrl(42161, "https://example.test", false)).toBe(
      "https://example.test"
    );
  });
});

describe("Safe Transaction Service client", () => {
  const BASE = "https://safe.test";
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

  function respond(status: number, body?: unknown) {
    fetcher.mockResolvedValueOnce(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      })
    );
  }

  beforeEach(() => {
    fetcher = vi.fn<typeof fetch>();
  });

  function sent(i = 0) {
    const [url, init] = fetcher.mock.calls[i];
    return [url, init!] as [string, RequestInit & { body: string }];
  }

  it("proposes with the full SafeTx and the sender's signature", async () => {
    const s = state();
    const signature = await alice.signTypedData(safeTxTypedData(s, CHAIN_ID));
    respond(201);

    await safeTxServiceClient(BASE, fetcher).propose(
      s,
      alice.address,
      signature
    );

    const [url, init] = sent();
    expect(url).toBe(`${BASE}/api/v1/safes/${SAFE}/multisig-transactions/`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      to: MAPPING,
      value: "0",
      data: call.data,
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: "7",
      contractTransactionHash: s.safeTxHash,
      sender: alice.address,
      signature,
      origin: expect.any(String),
    });
    expect(body).toEqual(proposalBody(s, alice.address, signature));
    // The service checks the signature against contractTransactionHash
    expect(
      await recoverAddress({ hash: body.contractTransactionHash, signature })
    ).toBe(alice.address);
  });

  it("lists confirmations, or null for a transaction it has never seen", async () => {
    const s = state();
    const confirmation = {
      owner: bob.address,
      signature: `0x${"ab".repeat(65)}`,
      signatureType: "EOA",
    };
    respond(200, { count: 1, results: [confirmation] });
    respond(404, { detail: "Not found." });
    const client = safeTxServiceClient(BASE, fetcher);

    expect(await client.confirmations(s.safeTxHash)).toEqual([confirmation]);
    expect(await client.confirmations(s.safeTxHash)).toBeNull();
    expect(sent()[0]).toBe(
      `${BASE}/api/v1/multisig-transactions/${s.safeTxHash}/confirmations/`
    );
    expect(sent()[1].method).toBe("GET");
  });

  it("adds a confirmation", async () => {
    const s = state();
    const signature = await bob.signTypedData(safeTxTypedData(s, CHAIN_ID));
    respond(201);

    await safeTxServiceClient(BASE, fetcher).confirm(s.safeTxHash, signature);

    const [url, init] = sent();
    expect(url).toBe(
      `${BASE}/api/v1/multisig-transactions/${s.safeTxHash}/confirmations/`
    );
    expect(JSON.parse(init.body)).toEqual({ signature });
  });

  it("surfaces the service's error", async () => {
    respond(422, { nonFieldErrors: ["Signer is not an owner"] });
    const failure = safeTxServiceClient(BASE, fetcher).propose(
      state(),
      alice.address,
      "0x"
    );
    await expect(failure).rejects.toBeInstanceOf(SafeTxServiceError);
    respond(422, { nonFieldErrors: ["Signer is not an owner"] });
    await expect(
      safeTxServiceClient(BASE, fetcher).propose(state(), alice.address, "0x")
    ).rejects.toThrow(/422.*not an owner/);
  });

  it("uses only ECDSA confirmations for execution", () => {
    const sig = `0x${"ab".repeat(65)}` as Hex;
    expect(
      ecdsaConfirmations([
        { owner: alice.address, signature: sig, signatureType: "EOA" },
        { owner: bob.address, signature: sig, signatureType: "ETH_SIGN" },
        {
          owner: carol.address,
          signature: sig,
          signatureType: "APPROVED_HASH",
        },
        {
          owner: carol.address,
          signature: sig,
          signatureType: "CONTRACT_SIGNATURE",
        },
      ])
    ).toEqual([
      { owner: alice.address, signature: sig, kind: "EIP712" },
      { owner: bob.address, signature: sig, kind: "ETH_SIGN" },
    ]);
  });
});
