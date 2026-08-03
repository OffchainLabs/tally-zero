import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { STATUS_BADGE_COLORS } from "@/lib/badge-colors";
import {
  COUNCIL_ACTIONS_TAG_URL,
  formatCouncilActionDate,
} from "@/lib/council-actions/helpers";
import type {
  CouncilAction,
  CouncilActionKind,
} from "@/lib/council-actions/types";
import { cn } from "@/lib/utils";

interface CouncilActionsListProps {
  actions: CouncilAction[];
  /** Set when the forum feed could not be loaded. */
  failed?: boolean;
}

const KIND_STYLES: Record<
  "emergency" | "non-emergency",
  { label: string; className: string }
> = {
  emergency: { label: "Emergency", className: STATUS_BADGE_COLORS.error },
  "non-emergency": {
    label: "Non-emergency",
    className: STATUS_BADGE_COLORS.info,
  },
};

function KindBadge({ kind }: { kind: CouncilActionKind }) {
  if (!kind) return null;
  const { label, className } = KIND_STYLES[kind];
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 border-transparent font-medium", className)}
    >
      {label}
    </Badge>
  );
}

/**
 * Title text with a trailing external-link glyph.
 *
 * The last word and the glyph share a `whitespace-nowrap` span so they always
 * wrap as one unit. A non-breaking space is not enough: Chromium still takes a
 * break opportunity before an atomic inline (the svg), which left the glyph
 * stranded alone on a final line for titles that wrapped just so.
 */
function ActionTitle({ title }: { title: string }) {
  const words = title.split(" ");
  const lastWord = words.pop() ?? "";

  return (
    <>
      {words.length > 0 && `${words.join(" ")} `}
      <span className="whitespace-nowrap">
        {lastWord}
        <ExternalLink
          className="ml-1 inline size-3 align-[-0.1em] text-muted-foreground group-hover:text-primary transition-colors"
          aria-hidden
        />
      </span>
    </>
  );
}

function ForumTagLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={COUNCIL_ACTIONS_TAG_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function CouncilActionsList({
  actions,
  failed = false,
}: CouncilActionsListProps): React.ReactElement {
  if (failed) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Could not load Security Council actions from the governance forum.{" "}
          <ForumTagLink>View them on the forum</ForumTagLink>
        </p>
      </Card>
    );
  }

  if (actions.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          No Security Council actions have been posted yet.{" "}
          <ForumTagLink>Browse the forum tag</ForumTagLink>
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <ul>
        {actions.map((action) => (
          <li
            key={action.id}
            className="flex flex-col gap-2 p-4 border-b border-border/50 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          >
            {/* Not a flex container: the glyph has to sit in the text flow so
                it trails the last word of a wrapped title instead of floating
                beside the first line. */}
            <a
              href={action.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group text-sm font-medium hover:text-primary transition-colors sm:min-w-0"
            >
              <ActionTitle title={action.title} />
            </a>
            <div className="flex shrink-0 items-center gap-2">
              <KindBadge kind={action.kind} />
              <time
                dateTime={action.createdAt}
                className="text-xs text-muted-foreground"
              >
                {formatCouncilActionDate(action.createdAt)}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
