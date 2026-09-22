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
      title: "Security Council",
      href: "/security-council",
    },
    {
      title: "Delegates",
      href: "/delegates",
    },
    {
      title: "Drafts",
      href: "/drafts",
    },
    {
      title: "About",
      href: "https://arbitrum.foundation/governance",
    },
  ],
};
