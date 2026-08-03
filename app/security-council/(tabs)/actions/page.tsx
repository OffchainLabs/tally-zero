import { CouncilActionsList } from "@/components/security-council/CouncilActionsList";
import { getCachedCouncilActions } from "@/lib/council-actions/server";
import type { CouncilAction } from "@/lib/council-actions/types";

/** Refresh hourly so newly posted actions appear without a redeploy. */
export const revalidate = 3600;

export const metadata = {
  title: "Security Council Actions | Arbitrum Governance",
  description:
    "Emergency and non-emergency actions taken by the Arbitrum Security Council, as announced on the governance forum.",
};

export default async function SecurityCouncilActionsPage() {
  let actions: CouncilAction[] = [];
  let failed = false;

  try {
    actions = await getCachedCouncilActions();
  } catch {
    // Forum unavailable: render the fallback instead of failing the page.
    failed = true;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Emergency and non-emergency actions taken by the Security Council, as
        announced on the Arbitrum governance forum.
      </p>

      <CouncilActionsList actions={actions} failed={failed} />
    </div>
  );
}
