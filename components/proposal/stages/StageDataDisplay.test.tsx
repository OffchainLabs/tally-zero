import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TrackedStage } from "@gzeoneth/gov-tracker";

import { StageDataDisplay } from "./StageDataDisplay";

// 2026-05-11T15:30:00Z
const ETA_SECONDS = 1_778_513_400;

const dataWithEta = {
  proposalState: "Queued",
  eta: ETA_SECONDS,
} as unknown as TrackedStage["data"];

function renderDisplay(status: string) {
  return renderToStaticMarkup(
    <StageDataDisplay data={dataWithEta} status={status} />
  );
}

describe("StageDataDisplay", () => {
  it("shows the ETA while the stage is waiting or ready", () => {
    expect(renderDisplay("PENDING")).toContain("ETA:");
    expect(renderDisplay("READY")).toContain("ETA:");
  });

  it("renders nothing at all when the ETA was the only content", () => {
    // no empty glass box left behind for completed stages
    expect(renderDisplay("COMPLETED")).toBe("");
  });

  it("hides the ETA for failed or canceled stages", () => {
    expect(renderDisplay("FAILED")).not.toContain("ETA:");
    expect(renderDisplay("CANCELED")).not.toContain("ETA:");
    expect(renderDisplay("SKIPPED")).not.toContain("ETA:");
  });

  it("still renders the box when other content remains", () => {
    const html = renderToStaticMarkup(
      <StageDataDisplay
        data={
          {
            proposalState: "Queued",
            eta: ETA_SECONDS,
            note: "Waiting for execution",
          } as unknown as TrackedStage["data"]
        }
        status="COMPLETED"
      />
    );

    expect(html).not.toContain("ETA:");
    expect(html).toContain("Waiting for execution");
  });
});
