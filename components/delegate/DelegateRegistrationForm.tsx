"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { Upload, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { FocusAreaSelector } from "@/components/delegate/FocusAreaSelector";
import { MarkdownEditor } from "@/components/form/MarkdownEditor";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useSiwe } from "@/hooks/use-siwe";
import {
  EMPTY_REGISTRATION_FORM,
  toProfilePatch,
  toRegistrationForm,
  validateRegistrationForm,
  type DelegateRegistrationForm as FormState,
} from "@/lib/delegate-registration";
import { siweApi } from "@/lib/siwe/client";

const STATEMENT_PLACEHOLDER =
  "# Proposal title\n\nContext, rationale, and any relevant links. Markdown is supported.";

export function DelegateRegistrationForm() {
  const router = useRouter();
  const {
    address,
    isConnected,
    session,
    isSignedIn,
    signIn,
    isSigningIn,
    signInError,
    signOut,
    refreshSession,
  } = useSiwe();

  const initial = useMemo(
    () => toRegistrationForm(session?.profile),
    [session]
  );
  const [form, setForm] = useState<FormState>(EMPTY_REGISTRATION_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Hydrate the form once a session (with its resolved profile) is available.
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const errors = validateRegistrationForm(form);
  const busy = saving || uploading;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function onAvatar(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "upload failed");
      set("picture", json.url as string);
      toast("Avatar saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Avatar upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit() {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }

    setSaving(true);
    try {
      await siweApi.patchProfile(toProfilePatch(form));
      await refreshSession();
      toast("Profile saved.");
      if (address) router.push(`/delegates/${address}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

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

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-2xl">Basics</CardTitle>
          <CardDescription>
            Your basics are shared across all Tally delegate profiles
          </CardDescription>
          <p
            className="pt-1 text-xs text-muted-foreground"
            data-testid="siwe-address"
          >
            Signed in as {session?.address}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <RequiredLabel htmlFor="avatar">Avatar</RequiredLabel>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                {form.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.picture}
                    alt=""
                    className="h-full w-full object-cover"
                    data-testid="profile-avatar-preview"
                  />
                ) : (
                  <User className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => avatarInputRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Upload"}
                <Upload className="ml-1 h-4 w-4" />
              </Button>
              <input
                ref={avatarInputRef}
                id="avatar"
                type="file"
                accept="image/*"
                className="sr-only"
                data-testid="profile-avatar-input"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onAvatar(file);
                  // Allow re-picking the same file after a failed upload.
                  e.target.value = "";
                }}
              />
            </div>
            <FieldError show={showErrors} message={errors.picture} />
          </div>

          <div className="space-y-2">
            <RequiredLabel htmlFor="name">Display Name</RequiredLabel>
            <Input
              id="name"
              variant="glass"
              placeholder="John Dou"
              data-testid="profile-name"
              disabled={busy}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
            <FieldError show={showErrors} message={errors.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Input
              id="bio"
              variant="glass"
              placeholder="One line shown under your name"
              data-testid="profile-bio"
              disabled={busy}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="twitter">Twitter</Label>
              <Input
                id="twitter"
                variant="glass"
                placeholder="handle (without @)"
                data-testid="profile-twitter"
                disabled={busy}
                value={form.twitter}
                onChange={(e) => set("twitter", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discourse">Discourse username</Label>
              <Input
                id="discourse"
                variant="glass"
                placeholder="Can't tweet? Link your forum account"
                data-testid="profile-discourse"
                disabled={busy}
                value={form.discourseUsername}
                onChange={(e) => set("discourseUsername", e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="profile-seeking"
              disabled={busy}
              checked={form.isSeekingDelegation}
              onChange={(e) => set("isSeekingDelegation", e.target.checked)}
            />
            Seeking delegation
          </label>
        </CardContent>
      </Card>

      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-2xl">Full Statement</CardTitle>
          <CardDescription>
            Why do you wish to be a delegate? Share what members can expect from
            you if they delegate to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <MarkdownEditor
            value={form.statement}
            onChange={(next) => set("statement", next)}
            placeholder={STATEMENT_PLACEHOLDER}
            disabled={busy}
            height={468}
          />

          <FocusAreaSelector
            value={form.focusAreas}
            onChange={(next) => set("focusAreas", next)}
            disabled={busy}
          />
        </CardContent>
      </Card>

      <Card variant="glass">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => router.push("/delegates")}
            >
              Cancel
            </Button>
            {/* Not in the design, but this is the app's only sign-out control. */}
            <Button
              type="button"
              variant="ghost"
              data-testid="siwe-sign-out"
              disabled={busy}
              onClick={() => {
                signOut().catch(() => {});
              }}
            >
              Sign out
            </Button>
          </div>
          <Button type="submit" disabled={busy} data-testid="profile-save">
            {saving ? (
              <>
                <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                Submitting
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
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

function RequiredLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor}>
      {children}{" "}
      <span className="text-destructive" aria-hidden>
        *
      </span>
    </Label>
  );
}

function FieldError({ show, message }: { show: boolean; message?: string }) {
  if (!show || !message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
