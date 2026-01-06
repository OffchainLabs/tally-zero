"use client";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useSettingsSheet } from "@/context/SettingsSheetContext";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

interface TenderlySetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TenderlySetupDialog({
  open,
  onOpenChange,
}: TenderlySetupDialogProps) {
  const { openSettings } = useSettingsSheet();

  const handleOpenSettings = () => {
    onOpenChange(false);
    openSettings("advanced");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tenderly Setup Required</DialogTitle>
          <DialogDescription>
            To simulate transactions, you need to configure your Tenderly
            credentials in Settings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">You&apos;ll need:</p>
            <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
              <li>A Tenderly account (free tier available)</li>
              <li>Your organization/username</li>
              <li>A project slug</li>
              <li>An access token from your Tenderly dashboard</li>
            </ul>
          </div>
          <a
            href="https://dashboard.tenderly.co/account/authorization"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Get your access token from Tenderly
            <ExternalLinkIcon className="w-3 h-3" />
          </a>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleOpenSettings}>Open Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
