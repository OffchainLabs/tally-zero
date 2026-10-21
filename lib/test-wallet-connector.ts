import { custom, http, numberToHex, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { createConnector } from "wagmi";

import { isLocalChainsEnabled, localArbitrum, localL1 } from "@/config/chains";

type TestAccount = ReturnType<typeof privateKeyToAccount>;

export type RpcRequest = (
  chain: Chain,
  method: string,
  params?: unknown[]
) => Promise<unknown>;

/** Chains the signing test wallet can sign and send on */
export const TEST_WALLET_CHAINS: readonly [Chain, ...Chain[]] = [
  arbitrumSepolia,
  localArbitrum,
  localL1,
];

/** The chain the signing test wallet connects on */
export function defaultTestWalletChain(local = isLocalChainsEnabled()): Chain {
  return local ? localArbitrum : arbitrumSepolia;
}

export function findTestWalletChain(chainId: number): Chain {
  const chain = TEST_WALLET_CHAINS.find((c) => c.id === chainId);
  if (!chain) {
    // EIP-1193 "unrecognized chain", which wagmi maps to SwitchChainError.
    throw Object.assign(new Error(`Chain ${chainId} not supported`), {
      code: 4902,
    });
  }
  return chain;
}

const defaultRpcRequest: RpcRequest = (chain, method, params) => {
  const transport = http(chain.rpcUrls.default.http[0])({ chain });
  return transport.request({ method, params } as Parameters<
    typeof transport.request
  >[0]);
};

/**
 * The EIP-1193 provider behind the signing test wallet.
 *
 * Holds the selected chain: signing and RPC passthrough follow it, and
 * `wallet_switchEthereumChain` moves it (reported through `onChainChanged`).
 */
export function createTestWalletProvider({
  account,
  initialChainId,
  onChainChanged,
  rpcRequest = defaultRpcRequest,
}: {
  account: TestAccount;
  initialChainId: number;
  onChainChanged?: (chainId: number) => void;
  rpcRequest?: RpcRequest;
}) {
  let chain = findTestWalletChain(initialChainId);

  const rpc = (method: string, params?: unknown[]) =>
    rpcRequest(chain, method, params);

  const switchChain = (chainId: number): Chain => {
    const next = findTestWalletChain(chainId);
    if (next.id !== chain.id) {
      chain = next;
      onChainChanged?.(next.id);
    }
    return next;
  };

  const request = async ({
    method,
    params,
  }: {
    method: string;
    params?: unknown[];
  }): Promise<unknown> => {
    switch (method) {
      case "eth_chainId":
        return numberToHex(chain.id);
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "wallet_switchEthereumChain": {
        const [{ chainId }] = params as [{ chainId: Hex }];
        switchChain(Number(chainId));
        return null;
      }
      case "eth_signTypedData_v4": {
        const [, dataString] = params as [string, string];
        const typedData = JSON.parse(dataString);
        return account.signTypedData({
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });
      }
      case "personal_sign": {
        const [data] = params as [Hex];
        return account.signMessage({ message: { raw: data } });
      }
      case "eth_sendTransaction": {
        const [txParams] = params as [Record<string, unknown>];
        const nonce = (await rpc("eth_getTransactionCount", [
          account.address,
          "pending",
        ])) as Hex;
        const gasPrice = (await rpc("eth_gasPrice")) as Hex;
        const gas =
          (txParams.gas as Hex | undefined) ??
          ((await rpc("eth_estimateGas", [
            { ...txParams, from: account.address },
          ])) as Hex);

        const signedTx = await account.signTransaction({
          to: txParams.to as `0x${string}`,
          data: txParams.data as `0x${string}` | undefined,
          value: txParams.value ? BigInt(txParams.value as string) : BigInt(0),
          nonce: Number(nonce),
          gasPrice: BigInt(gasPrice),
          gas: BigInt(gas),
          chainId: chain.id,
          type: "legacy",
        });

        return rpc("eth_sendRawTransaction", [signedTx]);
      }
      default:
        return rpc(method, params);
    }
  };

  return {
    request,
    switchChain,
    getChainId: () => chain.id,
  };
}

/** wagmi connector for the signing test wallet (e2e only) */
export function testWalletConnector(
  account: TestAccount,
  { initialChainId = defaultTestWalletChain().id, rpcRequest } = {} as {
    initialChainId?: number;
    rpcRequest?: RpcRequest;
  }
) {
  // @ts-expect-error -- wagmi withCapabilities conditional type not satisfiable from plain objects
  return createConnector((config) => {
    const wallet = createTestWalletProvider({
      account,
      initialChainId,
      rpcRequest,
      onChainChanged: (chainId) => config.emitter.emit("change", { chainId }),
    });

    const provider = custom({ request: wallet.request } as Parameters<
      typeof custom
    >[0])({ retryCount: 0 });

    return {
      id: "test-wallet",
      name: "Test Wallet",
      type: "mock" as const,
      async connect() {
        const chainId = wallet.getChainId();
        const accounts = [account.address] as readonly [`0x${string}`];
        config.emitter.emit("connect", { accounts, chainId });
        return { accounts, chainId };
      },
      async disconnect() {
        config.emitter.emit("disconnect");
      },
      async getAccounts() {
        return [account.address];
      },
      async getChainId() {
        return wallet.getChainId();
      },
      async isAuthorized() {
        return true;
      },
      async switchChain({ chainId }: { chainId: number }) {
        const chain = config.chains.find((c) => c.id === chainId);
        if (!chain) throw new Error(`Chain ${chainId} not configured`);
        wallet.switchChain(chainId);
        return chain;
      },
      onAccountsChanged() {},
      onChainChanged() {},
      onConnect() {},
      onDisconnect() {},
      async getProvider() {
        return provider;
      },
    };
  });
}
