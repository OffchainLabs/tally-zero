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

describe("StageDataDisplay L2-to-L1 messages", () => {
  it("lists each message with its outbox position and L1 block", () => {
    const html = renderToStaticMarkup(
      <StageDataDisplay
        status="PENDING"
        data={
          {
            messageCount: 1,
            l2ToL1Messages: [
              {
                position: "7",
                l2TxHash: null,
                caller: "0x0000000000000000000000000000000000000002",
                destination: "0x0000000000000000000000000000000000000001",
                arbBlockNum: "500",
                ethBlockNum: "400",
                timestamp: "0",
                callvalue: "0",
                data: "0x",
              },
            ],
          } as unknown as TrackedStage["data"]
        }
      />
    );
    expect(html).toContain('data-testid="l2-to-l1-messages"');
    expect(html).toContain('data-position="7"');
    expect(html).toContain("L1 block 400");
  });
});
