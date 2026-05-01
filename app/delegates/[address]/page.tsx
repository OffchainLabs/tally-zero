import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { DelegateProfileLoader } from "@/components/delegate/DelegateProfileLoader";

interface DelegatePageProps {
  params: Promise<{ address: string }>;
}

export const metadata = {
  title: "Delegate Profile | Arbitrum Governance",
  description: "View delegate profile and voting power in Arbitrum DAO.",
};

export default async function DelegatePage({ params }: DelegatePageProps) {
  const { address } = await params;

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

        <DelegateProfileLoader address={address} />
      </div>
    </div>
  );
}
