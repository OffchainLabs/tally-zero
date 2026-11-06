"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { candidateProfileFormSchema } from "@/config/schema";
import {
  useCandidateProfile,
  useLatestCandidateProfile,
} from "@/hooks/use-candidate-profile";
import { useSiwe } from "@/hooks/use-siwe";
import { ELECTION_PHASE_LABEL, electionLabel } from "@/lib/election-profile";
import type {
  CandidateProfileFields,
  CandidateProfileVersion,
  CandidateWriteBlock,
  ElectionSummary,
} from "@/lib/siwe/types";
import type * as z from "zod";

/** The form's raw strings; `candidateProfileFormSchema` turns them into fields. */
type FormState = z.input<typeof candidateProfileFormSchema>;

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

/** Why the indexer will refuse a save, in the words a candidate needs. */
const BLOCKED: Record<CandidateWriteBlock, string> = {
  election_complete:
    "This election has closed. Its profile is frozen to the last version written before it ended.",
  contender_submission_closed:
    "Contender Submission for this election has closed. New candidate profiles are accepted only while contenders can register.",
  not_candidate:
    "This address is not a contender in this election. Register on chain during Contender Submission, then publish your profile here.",
};

/**
 * Edit the effective subject's candidate profile for one election.
 *
 * Saves are append-only — each one mints a new version rather than overwriting —
 * so the history is shown alongside the form. The indexer reports whether a
 * save would be accepted, and the form is read-only when it would not.
 */
export function CandidateProfileEditor({
  election,
}: {
  election: ElectionSummary;
}) {
  const { effectiveAddress } = useSiwe();
  const {
    current,
    versions,
    canWrite,
    writeBlockedReason,
    isLoading,
    error,
    save,
    isSaving,
    saveError,
  } = useCandidateProfile(election.id);
  const latest = useLatestCandidateProfile();

  if (isLoading || latest.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="candidate-error">
        {error.message}
      </p>
    );
  }

  // Candidates run again, so a first profile for this election starts from the
  // one they published most recently for another. It is a starting point only:
  // nothing is written until they save it here.
  const carried =
    !current && canWrite && latest.data?.electionId !== election.id
      ? (latest.data ?? null)
      : null;

  // Mount the form only once the stored profile has arrived, so its state can be
  // seeded directly. Hydrating from an effect instead would let a background
  // refetch overwrite edits already in progress. Remount when the subject or
  // election changes so cached data cannot carry edits across identities.
  return (
    <ProfileForm
      key={`${effectiveAddress?.toLowerCase()}:${election.id}`}
      election={election}
      initial={toForm(current ?? carried)}
      carried={carried !== null}
      versions={versions}
      canWrite={canWrite}
      blocked={writeBlockedReason}
      save={save}
      isSaving={isSaving}
      saveError={saveError}
    />
  );
}

function ProfileForm({
  election,
  initial,
  carried,
  versions,
  canWrite,
  blocked,
  save,
  isSaving,
  saveError,
}: {
  election: ElectionSummary;
  initial: FormState;
  carried: boolean;
  versions: { version: number; createdAt: string }[];
  canWrite: boolean;
  blocked: CandidateWriteBlock | null;
  save: (fields: CandidateProfileFields) => Promise<CandidateProfileVersion>;
  isSaving: boolean;
  saveError: Error | null;
}) {
  const { actingAs, effectiveAddress } = useSiwe();
  const [form, setForm] = useState<FormState>(initial);

  const isWritable = canWrite;

  async function submit() {
    const parsed = candidateProfileFormSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      const version = await save(parsed.data);
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
          {electionLabel(election)} candidate profile · Cohort {election.cohort}
        </CardTitle>
        <Badge variant="outline">{ELECTION_PHASE_LABEL[election.phase]}</Badge>
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

        {blocked ? (
          <p className="text-sm text-amber-400" data-testid="candidate-blocked">
            {BLOCKED[blocked]}
          </p>
        ) : null}
        {carried ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="candidate-carried"
          >
            Started from the profile you published for an earlier election.
            Saving publishes it for this one.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="candidate-name" label="Name" {...field("name")} />
          <TextField id="candidate-title" label="Title" {...field("title")} />
          <TextField
            id="candidate-twitter"
            label="Twitter / X handle"
            placeholder="@handle"
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
