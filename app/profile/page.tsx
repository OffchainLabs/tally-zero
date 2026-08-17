import Link from "next/link";

import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { SignInGate } from "@/components/siwe/SignInGate";

export const metadata = {
  title: "My Profile | Arbitrum Governance",
  description: "Sign in with your wallet to manage your delegate profile",
};

export default function ProfilePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">
          Sign in with your wallet to manage your delegate profile.
        </p>
      </div>
      <SignInGate
        title="Manage your profile"
        connectPrompt="Connect your wallet to sign in and edit your delegate profile."
      >
        <ProfileEditor />
      </SignInGate>

      {/* Not in the main nav: it is only relevant to the handful of addresses
          standing in an election, and this is the page they already come to for
          their own details. It also cannot live at /elections — next.config.mjs
          permanently redirects that to /security-council for old bookmarks. */}
      <p className="text-sm text-muted-foreground">
        Standing in a Security Council election?{" "}
        <Link
          href="/profile/candidate"
          className="text-primary hover:underline"
        >
          Publish your candidate profile
        </Link>
        .
      </p>
    </div>
  );
}
