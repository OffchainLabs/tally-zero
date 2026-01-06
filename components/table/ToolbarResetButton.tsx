"use client";

import { memo } from "react";

import { Cross2Icon } from "@radix-ui/react-icons";

import { Button } from "@components/ui/Button";

export interface ToolbarResetButtonProps {
  onClick: () => void;
}

export const ToolbarResetButton = memo(function ToolbarResetButton({
  onClick,
}: ToolbarResetButtonProps) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="h-11 sm:h-12 px-2 lg:px-3 hover:bg-red-500 min-w-[44px]"
    >
      <span className="hidden sm:inline">Reset</span>
      <Cross2Icon className="sm:ml-2 h-4 w-4" />
    </Button>
  );
});
