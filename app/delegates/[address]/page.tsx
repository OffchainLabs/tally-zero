import type { BundledCache } from "@gzeoneth/gov-tracker";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { DelegateProfile } from "@/components/delegate/DelegateProfile";
import { getTallyDelegate } from "@/lib/tally-delegate-data";

interface DelegatePageProps {
  params: Promise<{ address: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  const addresses = new Set<string>();

  // Include delegates from the gov-tracker cache (those with voting power).
  // On-disk format uses compact keys: { a: address, vp: votingPower, b: block }
  try {
    const cache = require("@gzeoneth/gov-tracker/delegate-cache.json") as {
      delegates?: { a: string }[];
    };
    for (const d of cache.delegates ?? []) {
      addresses.add(d.a.toLowerCase());
    }
  } catch {
    // cache not available at build time
  }

  // Also include delegates from bundled election data
  try {
    const bundled =
      require("@gzeoneth/gov-tracker/bundled-cache.json") as BundledCache;
    for (const key of Object.keys(bundled)) {
      if (!key.startsWith("election:")) continue;
      const entry = bundled[key] as {
        cachedData?: {
          nomineeDetails?: {
            nominees?: { address: string }[];
            contenders?: { address: string }[];
          };
          memberDetails?: { nominees?: { address: string }[] };
        };
      };
      const nd = entry?.cachedData?.nomineeDetails;
      const md = entry?.cachedData?.memberDetails;
      if (nd) {
        for (const n of [...(nd.nominees ?? []), ...(nd.contenders ?? [])]) {
          addresses.add(n.address.toLowerCase());
        }
      }
      if (md) {
        for (const n of md.nominees ?? []) {
          addresses.add(n.address.toLowerCase());
        }
      }
    }
  } catch {
    // bundled cache not available at build time
  }

  return Array.from(addresses).map((address) => ({ address }));
}

export const metadata = {
  title: "Delegate Profile | Arbitrum Governance",
  description: "View delegate profile and voting power in Arbitrum DAO.",
};

export default async function DelegatePage({ params }: DelegatePageProps) {
  const { address } = await params;
  const delegate = getTallyDelegate(address);

  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-6">
        <div>
          <Link
            href="/delegates"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Delegates
          </Link>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Delegate Profile
          </h1>
          <p className="text-muted-foreground mt-2">Arbitrum DAO delegate</p>
        </div>

        <DelegateProfile address={address} delegate={delegate} />
      </div>
    </div>
  );
}
