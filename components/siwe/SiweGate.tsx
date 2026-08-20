"use client";

import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { useSiwe } from "@/hooks/use-siwe";

/**
 * Renders `children` only once a wallet is connected and a SIWE session exists,
 * standing in the connect and sign-in steps until then. Every authenticated
 * surface needs the same two screens, so they live here rather than in each one.
 */
export function SiweGate({ children }: { children: React.ReactNode }) {
  const { isConnected, isSignedIn, signIn, isSigningIn, signInError } =
    useSiwe();

  if (!isConnected) {
    return (
      <GateCard
        title="Connect your wallet"
        description="Connect your wallet to sign in and create your delegate profile."
      >
        {/* Reown connect control; test-wallet path auto-connects. */}
        <appkit-button />
      </GateCard>
    );
  }

  if (!isSignedIn) {
    return (
      <GateCard
        title="Sign in"
        description="Sign a message to prove wallet ownership. No transaction, no gas."
      >
        <Button
          data-testid="siwe-sign-in"
          disabled={isSigningIn}
          onClick={() => {
            signIn().catch(() => {});
          }}
        >
          {isSigningIn ? "Signing in…" : "Sign in with Ethereum"}
        </Button>
        {signInError ? (
          <p className="text-sm text-destructive" data-testid="siwe-error">
            {signInError.message}
          </p>
        ) : null}
      </GateCard>
    );
  }

  return <>{children}</>;
}

function GateCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
