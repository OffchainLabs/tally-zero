import type { BundledCache } from "@gzeoneth/gov-tracker";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ContenderProfile } from "@/components/election/ContenderProfile";
import candidatesData from "@/data/election-candidates.json";

interface ContenderPageProps {
  params: Promise<{ address: string }>;
}

export function generateStaticParams() {
  const addresses = new Set<string>();

  // Include all candidate profile addresses
  for (const address of Object.keys(candidatesData)) {
    addresses.add(address.toLowerCase());
  }

  // Include all nominee/contender addresses from bundled election cache
  // so profile pages exist for nominees without candidate profiles
  try {
    const cache =
      require("@gzeoneth/gov-tracker/bundled-cache.json") as BundledCache;
    for (const key of Object.keys(cache)) {
      if (!key.startsWith("election:")) continue;
      const entry = cache[key] as {
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
    // bundled cache not available at build time, proceed with candidates only
  }

  return Array.from(addresses).map((address) => ({ address }));
}

export const metadata = {
  title: "Candidate Profile | Security Council Elections",
  description:
    "View candidate profile for the Arbitrum Security Council election.",
};

export default async function ContenderPage({ params }: ContenderPageProps) {
  const { address } = await params;

  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-6">
        <div>
          <Link
            href="/elections"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Elections
          </Link>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Candidate Profile
          </h1>
          <p className="text-muted-foreground mt-2">
            Security Council election candidate
          </p>
        </div>

        <ContenderProfile address={address} />
      </div>
    </div>
  );
}
