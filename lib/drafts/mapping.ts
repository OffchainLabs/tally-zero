// Translation between the proposal form's state and the SIWE drafts API.
//
// The two models disagree in three ways, and every function here exists for one
// of them:
//
//   1. Governor naming — config/governors.ts uses "core" | "treasury";
//      the drafts API uses "CONSTITUTIONAL" | "TREASURY".
//   2. Titles — the form has no title of its own (a proposal's title is the
//      first heading of its markdown body), but the API requires a non-empty
//      one for the drafts list to be readable.
//   3. Validation strictness — the API rejects a draft whose action has a blank
//      target (requireAddress), while the form starts life with exactly that as
//      its placeholder row.
//
// (3) is the one that bites: posting the form's initial state verbatim is a
// guaranteed 400. So blank rows are dropped on the way out, and anything left
// that still would not pass is reported to the caller *before* the request.

import type { GovernorType } from "@/config/governors";
import {
  createFormProposalAction,
  type FormProposalAction,
} from "@/lib/create-proposal-form-utils";
import {
  hasActionErrors,
  type ProposalAction,
  validateAction,
} from "@/lib/propose-utils";
import type {
  Draft,
  DraftAction,
  DraftFields,
  DraftGovernorType,
} from "@/lib/siwe/types";

/**
 * Titles are a list-view affordance, not content — the full heading is always
 * in the description. Truncating keeps one runaway first line from making the
 * drafts list unreadable.
 */
export const DRAFT_TITLE_MAX_LENGTH = 120;

const FALLBACK_DRAFT_TITLE = "Untitled draft";

const GOVERNOR_TO_DRAFT: Record<GovernorType, DraftGovernorType> = {
  core: "CONSTITUTIONAL",
  treasury: "TREASURY",
};

const DRAFT_TO_GOVERNOR: Record<DraftGovernorType, GovernorType> = {
  CONSTITUTIONAL: "core",
  TREASURY: "treasury",
};

export function toDraftGovernorType(type: GovernorType): DraftGovernorType {
  return GOVERNOR_TO_DRAFT[type];
}

export function fromDraftGovernorType(type: DraftGovernorType): GovernorType {
  return DRAFT_TO_GOVERNOR[type];
}

/**
 * Best-effort title for a draft the user did not name: the markdown H1 if there
 * is one, else the first line with anything on it, else a placeholder. Never
 * returns an empty string — the API rejects those.
 */
export function deriveDraftTitle(description: string): string {
  const lines = description.split("\n").map((line) => line.trim());

  const heading = lines.find((line) => /^#\s+\S/.test(line));
  const candidate =
    heading?.replace(/^#\s+/, "") ?? lines.find((line) => line !== "");

  const title = (candidate ?? "").replace(/\s+/g, " ").trim();
  if (title === "") return FALLBACK_DRAFT_TITLE;

  return title.length > DRAFT_TITLE_MAX_LENGTH
    ? `${title.slice(0, DRAFT_TITLE_MAX_LENGTH - 1).trimEnd()}…`
    : title;
}

/**
 * A row the user has not filled in yet. The form always renders at least one,
 * so this is the normal state of a fresh proposal rather than an edge case.
 */
function isBlankAction(action: ProposalAction): boolean {
  const calldata = action.calldata.trim();
  return action.target.trim() === "" && (calldata === "" || calldata === "0x");
}

function toDraftAction(action: ProposalAction): DraftAction {
  return {
    target: action.target.trim(),
    // The API wants a decimal wei string; the form's own default is already
    // "0", but an emptied input is not.
    value: action.value.trim() === "" ? "0" : action.value.trim(),
    // Empty calldata means a plain ETH transfer. The API requires a non-empty
    // 0x-prefixed hex string, so spell that as "0x".
    calldata: action.calldata.trim() === "" ? "0x" : action.calldata.trim(),
  };
}

/**
 * The part of the proposal form a draft is made of. This is exactly the shape
 * CreateProposalForm already keeps in `draftSnapshotRef`, so saving to the
 * server needs no new state in that component.
 */
export type ProposalFormSnapshot = {
  description: string;
  governorType: GovernorType;
  actions: ProposalAction[];
};

/** A snapshot plus the draft's own name, which the proposal itself has no use for. */
export type DraftFormState = ProposalFormSnapshot & { title: string };

/**
 * Why the API would reject this draft, phrased for the user, or null if it
 * would accept it.
 *
 * Deliberately looser than the form's own `formInvalid`: a draft with no
 * actions at all is valid (the route defaults `actions` to `[]`), because
 * saving a half-written proposal is the entire point.
 */
export function getDraftBlocker(state: ProposalFormSnapshot): string | null {
  if (state.description.trim() === "") {
    return "Add a description before saving to your drafts.";
  }

  const filled = state.actions.filter((action) => !isBlankAction(action));
  if (filled.map(toDraftAction).map(validateAction).some(hasActionErrors)) {
    return "Fix the errors in your actions before saving to your drafts.";
  }

  return null;
}

/** Form state → request body. Assumes `getDraftBlocker` returned null. */
export function toDraftFields(state: DraftFormState): DraftFields {
  return {
    title: state.title.trim() || deriveDraftTitle(state.description),
    description: state.description,
    governorType: toDraftGovernorType(state.governorType),
    actions: state.actions.filter((a) => !isBlankAction(a)).map(toDraftAction),
  };
}

/** Form state restored from a stored draft, with form-ready action rows. */
export type RestoredDraftFormState = {
  title: string;
  description: string;
  governorType: GovernorType;
  actions: FormProposalAction[];
};

/**
 * A stored draft → form state. Actions get fresh form ids, and an actionless
 * draft is restored as one blank row so the form still has something to render.
 */
export function draftToFormState(draft: Draft): RestoredDraftFormState {
  const actions = draft.actions.map((action) => ({
    ...createFormProposalAction(),
    target: action.target,
    value: action.value,
    calldata: action.calldata,
  }));

  return {
    title: draft.title,
    description: draft.description,
    governorType: fromDraftGovernorType(draft.governorType),
    actions: actions.length > 0 ? actions : [createFormProposalAction()],
  };
}
