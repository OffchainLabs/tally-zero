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
 *
 * `actionOnly` lets a caller place the connect/sign-in control inside its own
 * explanatory layout, while this component keeps the authentication behavior.
 */
export function SiweGate({
  children,
  connectDescription = "Connect your wallet to sign in and create your delegate profile.",
  actionOnly = false,
}: {
  children?: React.ReactNode;
  connectDescription?: string;
  actionOnly?: boolean;
}) {
  const { isConnected, isSignedIn, signIn, isSigningIn, signInError } =
    useSiwe();

  if (!isConnected) {
    if (actionOnly) {
      return (
        <div data-testid="siwe-connect">
          <appkit-button />
        </div>
      );
    }

    return (
      <GateCard
        title="Connect your wallet"
        description={connectDescription}
        testId="siwe-connect"
      >
        {/* Reown connect control; test-wallet path auto-connects. */}
        <appkit-button />
      </GateCard>
    );
  }

  if (!isSignedIn) {
    const action = (
      <>
        <Button
          size={actionOnly ? "sm" : undefined}
          variant={actionOnly ? "outline" : undefined}
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
      </>
    );

    if (actionOnly) {
      return <div className="flex flex-col items-center gap-2">{action}</div>;
    }

    return (
      <GateCard
        title="Sign in"
        description="Sign a message to prove wallet ownership. No transaction, no gas."
      >
        {action}
      </GateCard>
    );
  }

  return <>{children}</>;
}

function GateCard({
  title,
  description,
  testId,
  children,
}: {
  title: string;
  description: string;
  /** The sign-in step has its button to hang a test on; the connect step has
      only the Reown web component, so the card carries the hook instead. */
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <Card variant="glass" data-testid={testId}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
