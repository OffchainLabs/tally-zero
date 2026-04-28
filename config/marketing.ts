/**
 * Marketing configuration for TallyZero
 * Defines main navigation structure and marketing page content
 */

import { MarketingConfig } from "@types";

/** Marketing site configuration including navigation links */
export const marketingConfig: MarketingConfig = {
  mainNav: [
    {
      title: "Proposals",
      href: "/proposals",
    },
    {
      title: "Elections",
      href: "/elections",
    },
    {
      title: "Delegates",
      href: "/delegates",
    },
    {
      title: "Timelock",
      href: "/timelock",
    },
    {
      title: "ArbitrumDAO",
      href: "https://arbitrum.foundation/governance",
    },
  ],
};
