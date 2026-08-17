import { DraftList } from "@/components/drafts/DraftList";
import { SignInGate } from "@/components/siwe/SignInGate";

export const metadata = {
  title: "My Drafts | Arbitrum Governance",
  description:
    "Proposal drafts saved to your account, ready to share for review before going on chain.",
};

export default function DraftsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">My Drafts</h1>
        <p className="text-muted-foreground">
          Proposal drafts saved to your account. Publish one to get a link you
          can circulate for review before submitting on chain.
        </p>
      </div>
      <SignInGate
        title="Manage your drafts"
        connectPrompt="Connect your wallet to sign in and see the drafts saved to your account."
      >
        <DraftList />
      </SignInGate>
    </div>
  );
}
