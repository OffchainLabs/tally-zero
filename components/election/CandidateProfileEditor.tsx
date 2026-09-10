"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCandidateProfile } from "@/hooks/use-candidate-profile";
import { useSiwe } from "@/hooks/use-siwe";
import type {
  CandidateProfileFields,
  CandidateProfileVersion,
  ElectionSummary,
} from "@/lib/siwe/types";

type FormState = {
  name: string;
  title: string;
  twitter: string;
  type: string;
  representative: string;
  motivation: string;
  experience: string;
  skills: string;
  projects: string;
  country: string;
};

const EMPTY: FormState = {
  name: "",
  title: "",
  twitter: "",
  type: "",
  representative: "",
  motivation: "",
  experience: "",
  skills: "",
  projects: "",
  country: "",
};

/** Comma-separated in the form, `string[]` on the wire. */
function toForm(current: CandidateProfileFields | null): FormState {
  if (!current) return EMPTY;
  return {
    name: current.name ?? "",
    title: current.title ?? "",
    twitter: current.twitter ?? "",
    type: current.type ?? "",
    representative: current.representative ?? "",
    motivation: current.motivation ?? "",
    experience: current.experience ?? "",
    skills: (current.skills ?? []).join(", "),
    projects: current.projects ?? "",
    country: current.country ?? "",
  };
}

function toFields(form: FormState): CandidateProfileFields {
  const str = (v: string) => (v.trim() === "" ? null : v.trim());
  const skills = form.skills
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");

  return {
    // `name` is the one required field on the route; everything else is
    // nullable, and a cleared input means null rather than "".
    name: form.name.trim(),
    title: str(form.title),
    twitter: str(form.twitter),
    type: str(form.type),
    representative: str(form.representative),
    motivation: str(form.motivation),
    experience: str(form.experience),
    skills: skills.length > 0 ? skills : null,
    projects: str(form.projects),
    country: str(form.country),
  };
}

/**
 * Edit the effective subject's candidate profile for one election.
 *
 * Saves are append-only — each one mints a new version rather than overwriting —
 * so the history is shown alongside the form. A completed election rejects
 * writes with 409, so the form is read-only in that state instead of letting a
 * save fail.
 */
export function CandidateProfileEditor({
  election,
}: {
  election: ElectionSummary;
}) {
  const { current, versions, isLoading, error, save, isSaving, saveError } =
    useCandidateProfile(election.id);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="candidate-error">
        {error.message}
      </p>
    );
  }

  // Mount the form only once the stored profile has arrived, so its state can be
  // seeded directly. Hydrating from an effect instead would let a background
  // refetch overwrite edits already in progress.
  return (
    <ProfileForm
      election={election}
      initial={toForm(current)}
      versions={versions}
      save={save}
      isSaving={isSaving}
      saveError={saveError}
    />
  );
}

function ProfileForm({
  election,
  initial,
  versions,
  save,
  isSaving,
  saveError,
}: {
  election: ElectionSummary;
  initial: FormState;
  versions: { version: number; createdAt: string }[];
  save: (fields: CandidateProfileFields) => Promise<CandidateProfileVersion>;
  isSaving: boolean;
  saveError: Error | null;
}) {
  const { actingAs, effectiveAddress } = useSiwe();
  const [form, setForm] = useState<FormState>(initial);

  const isWritable = election.status !== "complete";

  async function submit() {
    if (form.name.trim() === "") {
      toast.error("A name is required.");
      return;
    }
    try {
      const version = await save(toFields(form));
      toast.success(`Saved as version ${version.version}.`);
    } catch {
      // saveError renders below.
    }
  }

  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setForm((prev) => ({ ...prev, [key]: event.target.value })),
    disabled: !isWritable || isSaving,
  });

  return (
    <Card variant="glass">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="text-base">
          Cohort {election.cohort} candidate profile
        </CardTitle>
        <Badge variant="outline">{election.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="text-sm text-muted-foreground"
          data-testid="candidate-subject"
        >
          {actingAs ? (
            <>
              Authoring as <span className="font-mono">{effectiveAddress}</span>{" "}
              <span className="text-amber-500">(Safe)</span>
            </>
          ) : (
            <>
              Authoring as <span className="font-mono">{effectiveAddress}</span>
            </>
          )}
        </p>

        {!isWritable ? (
          <p className="text-sm text-amber-400">
            This election has closed. Its profile is frozen to the last version
            written before it ended.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="candidate-name" label="Name" {...field("name")} />
          <TextField id="candidate-title" label="Title" {...field("title")} />
          <TextField
            id="candidate-twitter"
            label="Twitter handle"
            placeholder="handle, not a URL"
            {...field("twitter")}
          />
          <TextField
            id="candidate-type"
            label="Type"
            placeholder="individual or organization"
            {...field("type")}
          />
          <TextField
            id="candidate-representative"
            label="Representative"
            {...field("representative")}
          />
          <TextField
            id="candidate-country"
            label="Country"
            {...field("country")}
          />
          <TextField
            id="candidate-skills"
            label="Skills"
            placeholder="comma separated"
            {...field("skills")}
          />
        </div>

        <AreaField
          id="candidate-motivation"
          label="Motivation"
          {...field("motivation")}
        />
        <AreaField
          id="candidate-experience"
          label="Experience"
          {...field("experience")}
        />
        <AreaField
          id="candidate-projects"
          label="Projects"
          {...field("projects")}
        />

        {saveError ? (
          <p
            className="text-sm text-destructive"
            data-testid="candidate-save-error"
          >
            {saveError.message}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {versions.length > 0
              ? `${versions.length} version${versions.length === 1 ? "" : "s"} saved · latest ${new Date(
                  versions[versions.length - 1].createdAt
                ).toLocaleString()}`
              : "No versions saved yet."}
          </p>
          <Button
            data-testid="candidate-save"
            onClick={submit}
            disabled={!isWritable || isSaving}
          >
            {isSaving ? "Saving…" : "Save new version"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TextField({
  id,
  label,
  placeholder,
  ...rest
}: {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  disabled: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        data-testid={id}
        placeholder={placeholder}
        autoComplete="off"
        {...rest}
      />
    </div>
  );
}

function AreaField({
  id,
  label,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        data-testid={id}
        rows={5}
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        {...rest}
      />
    </div>
  );
}
