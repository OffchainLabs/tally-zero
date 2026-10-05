"use client";

import { useAppKit } from "@reown/appkit/react";

import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { useSiwe } from "@/hooks/use-siwe";

/** Connect or sign in inside the caller's own layout. */
export function SiweAction() {
  const { open } = useAppKit();
  const { isConnected, isSignedIn, signIn, isSigningIn, signInError } =
    useSiwe();
  if (isSignedIn) return null;
  if (!isConnected) {
    return (
      <div data-testid="siwe-connect">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void open({ view: "Connect" })}
        >
          Connect Wallet
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        size="sm"
        variant="outline"
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
    </div>
  );
}

/** Show the connect/sign-in card until authenticated content can mount. */
export function SiweGate({
  children,
  connectDescription = "Connect your wallet to sign in and create your delegate profile.",
}: {
  children: React.ReactNode;
  connectDescription?: string;
}) {
  const { isConnected, isSignedIn } = useSiwe();
  if (isSignedIn) return <>{children}</>;
  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle>{isConnected ? "Sign in" : "Connect your wallet"}</CardTitle>
        <CardDescription>
          {isConnected
            ? "Sign a message to prove wallet ownership. No transaction, no gas."
            : connectDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SiweAction />
      </CardContent>
    </Card>
  );
}
