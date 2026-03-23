/**
 * Candidate profile data from Tally.xyz
 *
 * Single flat file at data/candidates.json, updated by the cron job.
 * No manual imports needed — just run `npm run fetch:candidates`.
 *
 * Safe fallback: if the file is missing or malformed, everything still
 * works — candidates just show as addresses (same as before this feature).
 */

import { getDelegateLabel } from "@/lib/delegate-cache";

export interface TechnicalSkills {
  solidity: number | null;
  javascript: number | null;
  rust: number | null;
  golang: number | null;
  cybersecurityYears: number | null;
}

export interface CandidateProfile {
  address: string;
  name: string | null;
  bio: string | null;
  picture: string | null;
  entityType: string | null;
  country: string | null;
  motivation: string | null;
  qualifications: string | null;
  projectsInvolved: string | null;
  technicalSkills: TechnicalSkills | null;
  registeredAtBlock: number;
  registrationTxHash: string;
  delegateLabel: string | null;
  tallyProfileUrl: string;
  arbiscanUrl: string;
}

interface CandidatesFile {
  updatedAt: string;
  candidates: Record<string, CandidateProfile>;
}

let candidates: Record<string, CandidateProfile> = {};

try {
  const raw = require("@data/candidates.json") as CandidatesFile;
  if (raw?.candidates && typeof raw.candidates === "object") {
    candidates = raw.candidates;
  }
} catch {
  // File missing or malformed — degrade to address-only display
}

/**
 * Look up a candidate profile by address.
 */
export function getCandidateProfile(
  address: string
): CandidateProfile | undefined {
  return candidates[address.toLowerCase()];
}

/**
 * Display name for a candidate: profile name → delegate label → undefined.
 */
export function getCandidateDisplayName(address: string): string | undefined {
  const profile = getCandidateProfile(address);
  if (profile?.name) return profile.name;
  return getDelegateLabel(address);
}
