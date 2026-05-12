/**
 * Validates a delegate profile registration form submission against
 * .github/ISSUE_TEMPLATE/delegate-profile-registration.yml.
 *
 * Run: npx tsx scripts/validate-delegate-registration.ts <form-json-path>
 *
 * The input file should be a JSON object whose keys match the issue-form
 * field ids (address, ens, display-name, bio, picture, twitter,
 * statement-summary, statement, seeking-delegation, confirmations).
 *
 * Exits 0 on success, 1 if any errors were found. Warnings do not fail.
 *
 * Note on ENS: wagmi's useEnsName / useEnsResolver are React hooks and
 * cannot run in a Node script. This script uses the underlying viem
 * actions that those hooks wrap (getEnsResolver, getEnsAddress for
 * forward resolution, getEnsName for reverse resolution).
 */

import fs from "node:fs";

import { createPublicClient, getAddress, http, isAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

import { ETHEREUM_RPC_URL } from "@config/arbitrum-governance";

interface FormSubmission {
  address?: string;
  "display-name"?: string;
  ens?: string;
  bio?: string;
  picture?: string;
  twitter?: string;
  "statement-summary"?: string;
  statement?: string;
  "seeking-delegation"?: string;
  confirmations?: string[];
}

interface ValidationIssue {
  field: string;
  level: "error" | "warning";
  message: string;
}

const MAX_DISPLAY_NAME = 100;
const MAX_BIO = 280;
const MAX_TWITTER_LENGTH = 15;
const MAX_STATEMENT_SUMMARY = 600;
const MAX_STATEMENT = 20_000;

const TWITTER_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const ENS_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

const REQUIRED_CONFIRMATIONS = [
  "I control the wallet address listed above and authorize this profile to be displayed on tally-zero.",
  "The information I have provided is accurate to the best of my knowledge.",
];

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETHEREUM_RPC_URL || ETHEREUM_RPC_URL),
});

async function validate(form: FormSubmission): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const rawAddress = form.address?.trim();
  let address: `0x${string}` | null = null;

  if (!rawAddress) {
    issues.push({
      field: "address",
      level: "error",
      message: "Delegate address is required.",
    });
  } else if (!isAddress(rawAddress)) {
    issues.push({
      field: "address",
      level: "error",
      message: `'${rawAddress}' is not a valid Ethereum address.`,
    });
  } else {
    address = getAddress(rawAddress);
  }

  const displayName = form["display-name"]?.trim();
  if (displayName && displayName.length > MAX_DISPLAY_NAME) {
    issues.push({
      field: "display-name",
      level: "error",
      message: `Display name must be ${MAX_DISPLAY_NAME} characters or fewer (got ${displayName.length}).`,
    });
  }

  const bio = form.bio?.trim();
  if (bio && bio.length > MAX_BIO) {
    issues.push({
      field: "bio",
      level: "error",
      message: `Bio must be ${MAX_BIO} characters or fewer (got ${bio.length}).`,
    });
  }

  const picture = form.picture?.trim();
  if (picture) {
    try {
      const url = new URL(picture);
      if (url.protocol !== "https:") {
        issues.push({
          field: "picture",
          level: "error",
          message: "Profile picture URL must use https://.",
        });
      }
    } catch {
      issues.push({
        field: "picture",
        level: "error",
        message: `'${picture}' is not a valid URL.`,
      });
    }
  }

  const twitter = form.twitter?.trim().replace(/^@/, "");
  if (twitter) {
    if (twitter.length > MAX_TWITTER_LENGTH) {
      issues.push({
        field: "twitter",
        level: "error",
        message: `Twitter handle must be ${MAX_TWITTER_LENGTH} characters or fewer.`,
      });
    } else if (!TWITTER_PATTERN.test(twitter)) {
      issues.push({
        field: "twitter",
        level: "error",
        message:
          "Twitter handle must contain only letters, numbers, or underscores.",
      });
    }
  }

  const summary = form["statement-summary"]?.trim();
  if (summary && summary.length > MAX_STATEMENT_SUMMARY) {
    issues.push({
      field: "statement-summary",
      level: "error",
      message: `Statement summary must be ${MAX_STATEMENT_SUMMARY} characters or fewer (got ${summary.length}).`,
    });
  }

  const statement = form.statement?.trim();
  if (statement && statement.length > MAX_STATEMENT) {
    issues.push({
      field: "statement",
      level: "error",
      message: `Statement must be ${MAX_STATEMENT} characters or fewer (got ${statement.length}).`,
    });
  }

  const seeking = form["seeking-delegation"]?.trim();
  if (seeking !== "Yes" && seeking !== "No") {
    issues.push({
      field: "seeking-delegation",
      level: "error",
      message: `Seeking delegation must be 'Yes' or 'No' (got '${seeking ?? ""}').`,
    });
  }

  const confirmations = form.confirmations ?? [];
  for (const required of REQUIRED_CONFIRMATIONS) {
    if (!confirmations.includes(required)) {
      issues.push({
        field: "confirmations",
        level: "error",
        message: `Missing required confirmation: "${required}"`,
      });
    }
  }

  const ens = form.ens?.trim();
  if (ens) {
    if (!ENS_PATTERN.test(ens)) {
      issues.push({
        field: "ens",
        level: "error",
        message: `'${ens}' is not a valid ENS name (e.g. alice.eth).`,
      });
    } else if (address) {
      issues.push(...(await verifyEns(ens, address)));
    } else {
      issues.push({
        field: "ens",
        level: "warning",
        message: "Skipped ENS verification because the address is invalid.",
      });
    }
  }

  return issues;
}

async function verifyEns(
  ens: string,
  expectedAddress: `0x${string}`
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  let normalized: string;
  try {
    normalized = normalize(ens);
  } catch (err) {
    return [
      {
        field: "ens",
        level: "error",
        message: `Could not normalize '${ens}': ${(err as Error).message}`,
      },
    ];
  }

  // Step 1: getEnsResolver — equivalent to wagmi's useEnsResolver. Confirms
  // the name has a resolver contract assigned. If this fails, the name
  // is not configured for resolution at all.
  let resolver: `0x${string}`;
  try {
    resolver = await ensClient.getEnsResolver({ name: normalized });
  } catch (err) {
    return [
      {
        field: "ens",
        level: "error",
        message: `'${ens}' has no resolver configured: ${(err as Error).message}`,
      },
    ];
  }

  // Step 2: getEnsAddress — forward resolution. Proves the name owner
  // has set the address record to expectedAddress.
  let forward: `0x${string}` | null;
  try {
    forward = await ensClient.getEnsAddress({ name: normalized });
  } catch (err) {
    return [
      {
        field: "ens",
        level: "error",
        message: `Forward ENS resolution failed via resolver ${resolver}: ${(err as Error).message}`,
      },
    ];
  }

  if (!forward) {
    return [
      {
        field: "ens",
        level: "error",
        message: `'${ens}' does not resolve to any address (resolver ${resolver} returned null).`,
      },
    ];
  }

  if (getAddress(forward) !== expectedAddress) {
    return [
      {
        field: "ens",
        level: "error",
        message: `'${ens}' resolves to ${forward}, not ${expectedAddress}.`,
      },
    ];
  }

  // Step 3: getEnsName — equivalent to wagmi's useEnsName. Reverse
  // resolution confirms the address has a primary ENS record pointing
  // back to the same name. This is a soft check: forward resolution
  // already proved the match, but reverse alignment is the canonical
  // signal that this is the user's primary identity.
  let reverse: string | null;
  try {
    reverse = await ensClient.getEnsName({ address: expectedAddress });
  } catch (err) {
    issues.push({
      field: "ens",
      level: "warning",
      message: `Reverse ENS lookup failed: ${(err as Error).message}`,
    });
    return issues;
  }

  if (!reverse) {
    issues.push({
      field: "ens",
      level: "warning",
      message: `Forward resolution matches, but ${expectedAddress} has no primary ENS set. Consider setting one for stronger ownership signaling.`,
    });
  } else if (normalize(reverse) !== normalized) {
    issues.push({
      field: "ens",
      level: "warning",
      message: `Forward resolution matches, but the address's primary ENS is '${reverse}' rather than '${ens}'.`,
    });
  }

  return issues;
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(
      "Usage: npx tsx scripts/validate-delegate-registration.ts <form-json-path>"
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  let form: FormSubmission;
  try {
    form = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse ${inputPath}: ${(err as Error).message}`);
    process.exit(1);
  }

  const issues = await validate(form);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  if (issues.length === 0) {
    console.log("OK: submission validates cleanly.");
    process.exit(0);
  }

  for (const issue of issues) {
    const tag = issue.level === "error" ? "ERROR" : "WARN ";
    console.log(`[${tag}] ${issue.field}: ${issue.message}`);
  }

  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(errors.length > 0 ? 1 : 0);
}

void main();
