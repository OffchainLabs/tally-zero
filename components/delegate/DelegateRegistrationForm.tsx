"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { Upload, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FocusAreaSelector } from "@/components/delegate/FocusAreaSelector";
import { MarkdownEditor } from "@/components/form/MarkdownEditor";
import { SiweGate } from "@/components/siwe/SiweGate";
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
  const { session, actingAs, effectiveAddress, signOut, refreshSession } =
    useSiwe();

  const [form, setForm] = useState<FormState>(EMPTY_REGISTRATION_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const hydratedFor = useRef<string | null>(null);

  // Hydrate once per edited address. Keying on the whole session would let a
  // background refetch (refetchOnWindowFocus, staleTime 30s) overwrite whatever
  // the user has typed but not yet submitted. The key is the *effective*
  // address, so switching to a Safe re-hydrates onto that Safe's profile
  // instead of leaving the signer's values in the fields.
  useEffect(() => {
    const address = effectiveAddress ?? session?.address ?? null;
    if (!address || hydratedFor.current === address) return;
    hydratedFor.current = address;
    setForm(toRegistrationForm(session?.profile));
  }, [session, effectiveAddress]);

  // The upload route commits `picture` itself, so the session is the only
  // source of truth for it — never a form field.
  const picture = session?.profile.picture ?? null;
  const errors = validateRegistrationForm(form);
  const busy = saving || uploading;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function onAvatar(file: File) {
    setUploading(true);
    try {
      await siweApi.uploadAvatar(file);
      await refreshSession();
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
      if (session?.address) router.push(`/delegates/${session.address}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SiweGate>
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
            {/* When acting as a Safe the form writes the Safe's profile, not
                the signer's — name the subject here so Save is never a
                surprise. */}
            <p
              className="pt-1 text-xs text-muted-foreground"
              data-testid="siwe-address"
            >
              {actingAs ? (
                <>
                  Editing <span className="font-mono">{effectiveAddress}</span>{" "}
                  <span className="text-amber-500">(Safe)</span> · signed in as{" "}
                  <span className="font-mono">{session?.address}</span>
                </>
              ) : (
                <>Signed in as {session?.address}</>
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="avatar">Avatar</Label>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                  {picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={picture}
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
              <p className="text-xs text-muted-foreground">
                Uploading requires delegated voting power. You can add one
                later.
              </p>
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
                aria-invalid={showErrors && Boolean(errors.name)}
                aria-describedby={
                  showErrors && errors.name ? "name-error" : undefined
                }
                onChange={(e) => set("name", e.target.value)}
              />
              <FieldError
                id="name-error"
                show={showErrors}
                message={errors.name}
              />
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
              Why do you wish to be a delegate? Share what members can expect
              from you if they delegate to you.
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
    </SiweGate>
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

function FieldError({
  id,
  show,
  message,
}: {
  id: string;
  show: boolean;
  message?: string;
}) {
  if (!show || !message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}
