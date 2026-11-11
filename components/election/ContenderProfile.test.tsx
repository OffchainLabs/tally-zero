// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import electionCandidates from "@/data/election-candidates.json";
import type { TallyElectionCandidate } from "@/lib/tally-data/types";

import { ContenderProfile } from "./ContenderProfile";

// Voting widgets are independent of the profile copy and skills display.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

const source = electionCandidates["0x0cd9e52891A0a48d45b0C61A31086be8361Ef157"];
const candidate: TallyElectionCandidate = {
  ...source,
  twitter: null,
  representative: null,
  registeredAt: source.registered_at,
  message: null,
  signatureHash: null,
};

afterEach(cleanup);

describe("ContenderProfile skills", () => {
  it("shows Alejandro's personal profile without inherited company ratings", () => {
    render(
      <ContenderProfile address={candidate.address} candidate={candidate} />
    );

    expect(screen.getByText("Alejandro Munoz-McDonald")).toBeTruthy();
    expect(screen.getByText("Individual")).toBeTruthy();
    expect(screen.getByText(source.motivation)).toBeTruthy();
    expect(screen.getByText(source.skills.cyberSecurity)).toBeTruthy();
    expect(screen.queryByText(/immunefi/i)).toBeNull();
    expect(screen.queryByText(/^\d+\/10$/)).toBeNull();
    expect(screen.queryByText("Projects")).toBeNull();
    expect(
      screen.getByText("Can independently verify multisig transactions")
    ).toBeTruthy();
  });

  it("keeps supplied language ratings, including an explicit zero", () => {
    const ratedCandidate = {
      ...candidate,
      address: "0x358E76A0C6224dCABCe39ff395b284e7da9bf413",
      name: "Another member",
      skills: {
        canVerifySigning: true,
        solidity: 0,
        rust: 7,
        golang: 3,
        javascript: 5,
        cyberSecurity: "Security research",
      },
    };
    render(
      <ContenderProfile
        address={ratedCandidate.address}
        candidate={ratedCandidate}
      />
    );

    expect(
      screen.getAllByText(/^\d+\/10$/).map((node) => node.textContent)
    ).toEqual(["0/10", "7/10", "3/10", "5/10"]);
  });
});
