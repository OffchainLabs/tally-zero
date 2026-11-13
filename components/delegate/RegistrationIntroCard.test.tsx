// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { siweApi } from "@/lib/siwe/client";
import { siweKeys } from "@/lib/siwe/keys";
import type { CurrentElection } from "@/lib/siwe/types";

import { RegistrationIntroCard } from "./RegistrationIntroCard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function card(current: CurrentElection) {
  const client = new QueryClient();
  client.setQueryData(siweKeys.currentElection, current);
  vi.spyOn(siweApi, "getCurrentElection").mockResolvedValue(current);
  return render(
    <QueryClientProvider client={client}>
      <RegistrationIntroCard />
    </QueryClientProvider>
  );
}

it("links candidates to the profile editor while contenders can register", () => {
  const view = card({
    election: null,
    contenderSubmissionOpen: true,
    nextElectionAt: null,
  });

  const link = view.getByText("Publish your candidate profile");
  expect(link.getAttribute("href")).toBe("/security-council/candidate");
});

it("hides the editor link outside Contender Submission", () => {
  const view = card({
    election: null,
    contenderSubmissionOpen: false,
    nextElectionAt: "2027-03-15T12:00:00.000Z",
  });

  expect(view.queryByText("Publish your candidate profile")).toBeNull();
});
