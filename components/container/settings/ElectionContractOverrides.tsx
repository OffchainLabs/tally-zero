"use client";

import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { STORAGE_KEYS } from "@/config/storage-keys";
import type { ElectionContractOverrides as Overrides } from "@/hooks/use-election-contracts";
import { useLocalStorage } from "@/hooks/use-local-storage";

const EMPTY_OVERRIDES: Overrides = {};

const FIELDS: { key: keyof Overrides; label: string }[] = [
  { key: "nomineeGovernor", label: "Nominee Election Governor" },
  { key: "memberGovernor", label: "Member Election Governor" },
  { key: "tokenAddress", label: "Token Address" },
];

export function ElectionContractOverrides(): React.ReactElement {
  const [overrides, setOverrides] = useLocalStorage<Overrides>(
    STORAGE_KEYS.ELECTION_CONTRACT_OVERRIDES,
    EMPTY_OVERRIDES
  );

  const hasOverrides = Object.values(overrides).some((v) => !!v);

  function updateField(key: keyof Overrides, value: string): void {
    setOverrides((prev) => ({ ...prev, [key]: value || undefined }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-yellow-500" />
        <Label className="text-sm font-medium">
          Election Contract Overrides
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Override election contract addresses for testing against custom
        deployments. Leave blank to use defaults for the connected chain.
      </p>
      <div className="space-y-2">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <Input
              type="text"
              placeholder="0x..."
              value={overrides[key] ?? ""}
              onChange={(e) => updateField(key, e.target.value)}
              className="font-mono text-xs h-8"
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOverrides(EMPTY_OVERRIDES)}
        disabled={!hasOverrides}
        className="text-xs"
      >
        Clear All
      </Button>
      {hasOverrides && (
        <p className="text-xs text-yellow-500">
          Contract overrides active — election reads/writes target custom
          addresses
        </p>
      )}
    </div>
  );
}
