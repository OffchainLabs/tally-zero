"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ETHEREUM_RPC_URL } from "@/config/arbitrum-governance";
import { shortenAddress } from "@/lib/format-utils";
import { cn } from "@lib/utils";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
} from "@reown/appkit/react";
import { http } from "viem";
import { createConfig, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";

import { Icons } from "@components/Icons";
import { SettingsSheet } from "@components/container/SettingsSheet";
import { Button, buttonVariants } from "@components/ui/Button";

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

  return (
    <nav className="flex-shrink-0">
      {isAppPage ? (
        <div className="flex items-center gap-1.5 sm:gap-2 glass-subtle backdrop-blur rounded-xl p-2">
          <SettingsSheet />
          {isConnected ? (
            <>
              <div className="hidden sm:block">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void open({ view: "Networks" })}
                >
                  {networkLabel}
                </Button>
              </div>
              <Button
                size="sm"
                variant="default"
                onClick={() => void open({ view: "Account" })}
              >
                {accountLabel}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={() => void open({ view: "Connect" })}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </Button>
          )}
        </div>
      ) : (
        <Link
          href="/proposals"
          className={cn(
            buttonVariants({ variant: "default", size: "sm" }),
            "px-3 sm:px-4 min-h-[44px] transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
          )}
        >
          <Icons.search className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Start exploring</span>
        </Link>
      )}
    </nav>
  );
}
