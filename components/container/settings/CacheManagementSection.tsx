"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

interface CacheManagementSectionProps {
  cacheStats: { count: number; size: string };
  totalStorage: string;
  onClearCache: () => void;
}

/**
 * Cache management section showing stats and clear button
 */
export function CacheManagementSection({
  cacheStats,
  totalStorage,
  onClearCache,
}: CacheManagementSectionProps) {
  return (
    <div className="glass-subtle rounded-lg p-4 space-y-3 transition-all duration-200 hover:shadow-md">
      <Label className="text-sm font-medium">Cache Management</Label>
      <div className="pt-2 border-t border-[var(--glass-border)] space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cached items:</span>
          <span className="font-mono">{cacheStats.count}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cache size:</span>
          <span className="font-mono">{cacheStats.size} KB</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total storage:</span>
          <span className="font-mono">{totalStorage} KB</span>
        </div>
      </div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-full transition-all duration-200"
        onClick={onClearCache}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Clear Cache
      </Button>
    </div>
  );
}
