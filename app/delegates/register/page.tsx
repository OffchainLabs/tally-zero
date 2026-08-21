import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { DelegateRegistrationForm } from "@/components/delegate/DelegateRegistrationForm";
import { RegistrationIntroCard } from "@/components/delegate/RegistrationIntroCard";

export const metadata = {
  title: "Register as a Delegate | Arbitrum Governance",
  description:
    "Create your ArbitrumDAO delegate profile so delegators can find you in the delegate explorer.",
};

export default function DelegateRegistrationPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/delegates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to delegates
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <RegistrationIntroCard />
        </div>
        <div className="lg:col-span-2">
          <DelegateRegistrationForm />
        </div>
      </div>
    </div>
  );
}
