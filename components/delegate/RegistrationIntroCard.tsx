import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

/**
 * Static explainer shown alongside the registration form (the "DYOR" card in
 * the design).
 */
export function RegistrationIntroCard() {
  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-2xl">Register as a delegate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Your profile will be featured in the delegate explorer, gaining
          visibility among potential delegators.
        </p>
        <div className="space-y-2">
          <p className="font-medium text-foreground">Please note</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Creating a delegate profile is optional.</li>
            <li>
              You can choose to skip this step and return during the claim
              period to delegate your votes to another delegate.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
