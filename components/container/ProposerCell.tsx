import { memo, useMemo } from "react";

import { getAddressExplorerUrl, getExplorerName } from "@/lib/explorer-utils";
import type { Address } from "@/types/search";
import { Addreth, AddrethConfig } from "addreth";
import { useTheme } from "next-themes";

export const ProposerCell = memo(function ProposerCell({
  proposer,
}: {
  proposer: Address;
}) {
  const { theme } = useTheme();

  const explorer = useMemo(
    () => (address: string) => ({
      name: getExplorerName("arb1"),
      accountUrl: getAddressExplorerUrl(address),
    }),
    []
  );

  return (
    <AddrethConfig>
      <Addreth
        ens={false}
        address={proposer}
        theme={theme === "dark" ? "dark" : "light"}
        explorer={explorer}
      />
    </AddrethConfig>
  );
});
