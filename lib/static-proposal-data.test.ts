import { describe, expect, it } from "vitest";

import {
  getStaticProposalById,
  listStaticProposalIds,
} from "./static-proposal-data";

describe("listStaticProposalIds", () => {
  it("returns every cached proposal id once", async () => {
    const ids = await listStaticProposalIds();

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^\d+$/);
    }
  });

  it("lists exactly the proposals getStaticProposalById can resolve", async () => {
    const ids = await listStaticProposalIds();

    for (const id of ids) {
      expect(getStaticProposalById(id)?.id).toBe(id);
    }
  });
});
