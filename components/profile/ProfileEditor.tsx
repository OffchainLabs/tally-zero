"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useSiwe } from "@/hooks/use-siwe";
import { siweApi } from "@/lib/siwe/client";
import type { ProfileFields } from "@/lib/siwe/types";

type FormState = {
  name: string;
  bio: string;
  twitter: string;
  discourseUsername: string;
  statement: string;
  isSeekingDelegation: boolean;
  picture: string;
};

const EMPTY: FormState = {
  name: "",
  bio: "",
  twitter: "",
  discourseUsername: "",
  statement: "",
  isSeekingDelegation: false,
  picture: "",
};

function toForm(profile: Partial<ProfileFields> | undefined): FormState {
  return {
    name: profile?.name ?? "",
    bio: profile?.bio ?? "",
    twitter: profile?.twitter ?? "",
    discourseUsername: profile?.discourseUsername ?? "",
    statement: profile?.statement ?? "",
    isSeekingDelegation: profile?.isSeekingDelegation ?? false,
    picture: profile?.picture ?? "",
  };
}

// Send null for cleared strings so the indexer falls back to the seed value.
function toPatch(form: FormState): Partial<ProfileFields> {
  const str = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    name: str(form.name),
    bio: str(form.bio),
    twitter: str(form.twitter),
    discourseUsername: str(form.discourseUsername),
    statement: str(form.statement),
    isSeekingDelegation: form.isSeekingDelegation,
    picture: str(form.picture),
  };
}

export function ProfileEditor() {
  const {
    isConnected,
    session,
    isSignedIn,
    signIn,
    isSigningIn,
    signInError,
    signOut,
    refreshSession,
  } = useSiwe();

  const initial = useMemo(() => toForm(session?.profile), [session]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Hydrate the form once a session (with its resolved profile) is available.
  useEffect(() => {
    setForm(initial);
  }, [initial]);

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
      toast("Avatar uploaded.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Avatar upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      await siweApi.patchProfile(toPatch(form));
      await refreshSession();
      toast("Profile saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Manage your profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect your wallet to sign in and edit your delegate profile.
          </p>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground" data-testid="siwe-address">
          Signed in as {session?.address}
        </p>

        <div className="flex items-center gap-4">
          {form.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.picture}
              alt="avatar preview"
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover"
              data-testid="profile-avatar-preview"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted" />
          )}
          <div className="space-y-1">
            <Label htmlFor="avatar">Avatar</Label>
            <Input
              id="avatar"
              type="file"
              accept="image/*"
              data-testid="profile-avatar-input"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAvatar(file);
              }}
            />
          </div>
        </div>

        <Field label="Name" id="name">
          <Input
            id="name"
            data-testid="profile-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>

        <Field label="Bio" id="bio">
          <Input
            id="bio"
            data-testid="profile-bio"
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
          />
        </Field>

        <Field label="Twitter" id="twitter">
          <Input
            id="twitter"
            data-testid="profile-twitter"
            value={form.twitter}
            onChange={(e) => set("twitter", e.target.value)}
          />
        </Field>

        <Field label="Discourse username" id="discourse">
          <Input
            id="discourse"
            data-testid="profile-discourse"
            value={form.discourseUsername}
            onChange={(e) => set("discourseUsername", e.target.value)}
          />
        </Field>

        <Field label="Statement" id="statement">
          <Input
            id="statement"
            data-testid="profile-statement"
            value={form.statement}
            onChange={(e) => set("statement", e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="profile-seeking"
            checked={form.isSeekingDelegation}
            onChange={(e) => set("isSeekingDelegation", e.target.checked)}
          />
          Seeking delegation
        </label>

        <div className="flex items-center gap-3">
          <Button
            data-testid="profile-save"
            disabled={saving || uploading}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save profile"}
          </Button>
          <Button
            variant="outline"
            data-testid="siwe-sign-out"
            onClick={() => {
              signOut().catch(() => {});
            }}
          >
            Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
