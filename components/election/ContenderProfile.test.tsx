// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import registrationSnapshots from "@/data/election-candidate-registration-snapshots.json";
import electionCandidates from "@/data/election-candidates.json";
import type { TallyElectionCandidate } from "@/lib/tally-data/types";

import { ContenderProfile } from "./ContenderProfile";

// Voting widgets are independent of the profile copy and skills display.
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="voting-widget" />,
}));

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
    expect(screen.getAllByTestId("voting-widget")).toHaveLength(2);
    expect(screen.getByText(source.motivation)).toBeTruthy();
    expect(screen.getByText(source.skills.cyberSecurity)).toBeTruthy();
    expect(screen.queryByText(/immunefi/i)).toBeNull();
    expect(screen.queryByText(/^\d+\/10$/)).toBeNull();
    expect(screen.queryByText("Projects")).toBeNull();
    expect(
      screen.getByText("Can independently verify multisig transactions")
    ).toBeTruthy();
  });

  it("renders the original organization submission without duplicate voting widgets", () => {
    const original =
      registrationSnapshots["0x0cd9e52891A0a48d45b0C61A31086be8361Ef157"];
    render(
      <ContenderProfile
        address={original.address}
        candidate={{ ...candidate, ...original }}
        showVoting={false}
      />
    );

    expect(screen.getAllByText("Immunefi")).toHaveLength(2);
    expect(screen.getByText("Organization")).toBeTruthy();
    expect(screen.getByText(original.motivation)).toBeTruthy();
    expect(screen.getByText(original.country)).toBeTruthy();
    expect(screen.getAllByText("10/10")).toHaveLength(4);
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.queryByTestId("voting-widget")).toBeNull();
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
