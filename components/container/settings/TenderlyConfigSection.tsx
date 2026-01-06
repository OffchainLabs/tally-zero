"use client";

import { FormInputField } from "@/components/ui/FormInputField";
import { Label } from "@/components/ui/Label";
import {
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
} from "@/config/storage-keys";

interface TenderlyConfigSectionProps {
  tenderlyOrgInput: string;
  setTenderlyOrgInput: (value: string) => void;
  tenderlyProjectInput: string;
  setTenderlyProjectInput: (value: string) => void;
  tenderlyAccessTokenInput: string;
  setTenderlyAccessTokenInput: (value: string) => void;
}

/**
 * Tenderly simulation configuration section
 */
export function TenderlyConfigSection({
  tenderlyOrgInput,
  setTenderlyOrgInput,
  tenderlyProjectInput,
  setTenderlyProjectInput,
  tenderlyAccessTokenInput,
  setTenderlyAccessTokenInput,
}: TenderlyConfigSectionProps) {
  return (
    <div className="glass-subtle rounded-lg p-4 space-y-3 transition-all duration-200 hover:shadow-md">
      <div>
        <Label className="text-sm font-medium">Tenderly Simulation</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Configure Tenderly project for simulating retryable ticket executions
        </p>
      </div>
      <div className="space-y-3 pt-2 border-t border-[var(--glass-border)]">
        <FormInputField
          id="tenderly-org"
          label="Organization/User Name"
          value={tenderlyOrgInput}
          onChange={setTenderlyOrgInput}
          placeholder={DEFAULT_TENDERLY_ORG}
          labelClassName="text-xs"
        />
        <FormInputField
          id="tenderly-project"
          label="Project Slug"
          value={tenderlyProjectInput}
          onChange={setTenderlyProjectInput}
          placeholder={DEFAULT_TENDERLY_PROJECT}
          labelClassName="text-xs"
        />
        <FormInputField
          id="tenderly-token"
          label="Access Token"
          type="password"
          value={tenderlyAccessTokenInput}
          onChange={setTenderlyAccessTokenInput}
          placeholder="Enter your Tenderly access token"
          helpText="Required for simulation. Get from dashboard.tenderly.co"
          labelClassName="text-xs"
          helpTextClassName="text-[10px] text-muted-foreground"
        />
      </div>
    </div>
  );
}
