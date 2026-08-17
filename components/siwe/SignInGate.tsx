"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useSiwe } from "@/hooks/use-siwe";

/**
 * Renders `children` only once there is a SIWE session, showing the connect and
 * sign-in steps until then.
 *
 * Every owned surface needs the same two-step preamble, and gating here rather
 * than inside each one means those surfaces can assume a session exists instead
 * of each carrying its own early returns.
 */
export function SignInGate({
  title,
  connectPrompt,
  children,
}: {
  /** Heading for the pre-session cards, e.g. "Manage your profile". */
  title: string;
  connectPrompt: string;
  children: ReactNode;
}) {
  const { isConnected, isSignedIn, signIn, isSigningIn, signInError } =
    useSiwe();

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{connectPrompt}</p>
          {/* Reown connect control; test-wallet path auto-connects. */}
          <appkit-button />
        </CardContent>
      </Card>
    );
  }

  if (!isSignedIn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sign a message to prove wallet ownership. No transaction, no gas.
          </p>
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
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
