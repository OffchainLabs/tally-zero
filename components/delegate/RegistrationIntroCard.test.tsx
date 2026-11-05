import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { RegistrationIntroCard } from "./RegistrationIntroCard";

it("links candidates to the profile editor rather than the legacy election route", () => {
  const markup = renderToStaticMarkup(<RegistrationIntroCard />);

  expect(markup).toContain('href="/profile/candidate"');
  expect(markup).toContain("Publish your candidate profile");
});
