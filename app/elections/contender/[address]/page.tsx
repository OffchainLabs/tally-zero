import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ContenderProfile } from "@/components/election/ContenderProfile";
import candidatesData from "@/data/election-5-candidates.json";

interface ContenderPageProps {
  params: Promise<{ address: string }>;
}

export function generateStaticParams() {
  const params: { address: string }[] = [];
  for (const address of Object.keys(candidatesData)) {
    params.push({ address });
    const lower = address.toLowerCase();
    if (lower !== address) {
      params.push({ address: lower });
    }
  }
  return params;
}

export const metadata = {
  title: "Contender Profile | Security Council Elections",
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
            Contender Profile
          </h1>
          <p className="text-muted-foreground mt-2">
            Election 5 — Security Council candidate information
          </p>
        </div>

        <ContenderProfile address={address} />
      </div>
    </div>
  );
}
