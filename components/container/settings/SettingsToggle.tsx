"use client";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

interface SettingsToggleProps {
  /** Label for the toggle */
  label: string;
  /** Description text shown below the label */
  description: string;
  /** Whether the toggle is enabled */
  enabled: boolean;
  /** Callback when toggle is clicked */
  onToggle: () => void;
}

/**
 * Reusable toggle component for settings with consistent styling
 */
export function SettingsToggle({
  label,
  description,
  enabled,
  onToggle,
}: SettingsToggleProps) {
  return (
    <div className="glass-subtle backdrop-blur rounded-lg p-4 flex items-center justify-between transition-all duration-200 hover:shadow-md">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button
        type="button"
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={onToggle}
        className="transition-all duration-200"
      >
        {enabled ? "On" : "Off"}
      </Button>
    </div>
  );
}
