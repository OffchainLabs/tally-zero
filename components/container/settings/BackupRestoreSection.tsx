"use client";

import { Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

interface BackupRestoreSectionProps {
  onExportSettings: () => void;
  onImportSettings: () => void;
}

/**
 * Backup and restore settings section
 */
export function BackupRestoreSection({
  onExportSettings,
  onImportSettings,
}: BackupRestoreSectionProps) {
  return (
    <div className="glass-subtle rounded-lg p-4 space-y-3 transition-all duration-200 hover:shadow-md">
      <Label className="text-sm font-medium">Backup & Restore</Label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExportSettings}
          className="transition-all duration-200"
        >
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onImportSettings}
          className="transition-all duration-200"
        >
          <Upload className="w-4 h-4 mr-2" />
          Import
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Export settings to a file or import from a backup
      </p>
    </div>
  );
}
