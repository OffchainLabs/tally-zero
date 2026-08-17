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
    </div>
  );
}
