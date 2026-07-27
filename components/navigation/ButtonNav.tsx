"use client";

import { usePathname } from "next/navigation";

import { ETHEREUM_RPC_URL } from "@/config/arbitrum-governance";
import { shortenAddress } from "@/lib/format-utils";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
} from "@reown/appkit/react";
import { http } from "viem";
import { createConfig, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";

import { SettingsSheet } from "@components/container/SettingsSheet";
import { Button } from "@components/ui/Button";

const ensConfig = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(ETHEREUM_RPC_URL),
  },
});

export function ButtonNav() {
  const pathname = usePathname();
  const isAppPage = pathname !== "/";
  const { open } = useAppKit();
  const account = useAppKitAccount();
  const { caipNetwork } = useAppKitNetwork();
  const ensAddress =
    account?.address && account.address.startsWith("0x")
      ? (account.address as `0x${string}`)
      : undefined;
  const { data: ensName } = useEnsName({
    address: ensAddress,
    chainId: mainnet.id,
    config: ensConfig,
    query: {
      enabled: !!ensAddress,
    },
  });
  const isConnected = account?.isConnected ?? false;
  const isConnecting =
    account?.status === "connecting" || account?.status === "reconnecting";
  const networkLabel = caipNetwork?.name ?? "Network";
  const accountLabel = ensName
    ? ensName
    : ensAddress
      ? shortenAddress(ensAddress, 6)
      : "Wallet";

  const walletControls = isConnected ? (
    <>
      <div className="hidden sm:block">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => void open({ view: "Networks" })}
        >
          {networkLabel}
        </Button>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="gap-2 rounded-full"
        onClick={() => void open({ view: "Account" })}
      >
        {accountLabel}
      </Button>
    </>
  ) : (
    <Button
      size="sm"
      variant="default"
      className="rounded-full"
      onClick={() => void open({ view: "Connect" })}
      disabled={isConnecting}
    >
      {isConnecting ? "Connecting..." : "Connect Wallet"}
    </Button>
  );

  return (
    <nav className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
      {isAppPage && <SettingsSheet />}
      {walletControls}
    </nav>
  );
}
