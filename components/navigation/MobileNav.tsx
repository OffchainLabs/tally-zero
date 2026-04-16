"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import * as React from "react";

import { siteConfig } from "@config/site";
import { cn } from "@lib/utils";

import { Icons } from "@/components/Icons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/Sheet";

import { MainNavItem } from "@types";

interface MobileNavProps {
  items: MainNavItem[];
  children?: React.ReactNode;
}

export function MobileNav({ items, children }: MobileNavProps) {
  const segment = useSelectedLayoutSegment();
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex items-center space-x-2 md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <Icons.close /> : <Icons.logo />}
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] sm:w-[320px] glass">
        <SheetHeader className="pb-6">
          <SheetTitle asChild>
            <Link
              href="/"
              className="flex items-center space-x-2"
              onClick={() => setOpen(false)}
            >
              <Icons.logo />
              <span className="font-bold text-lg">{siteConfig.name}</span>
            </Link>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-1 glass-subtle backdrop-blur rounded-xl p-3">
          {items.map((item, index) => (
            <Link
              key={index}
              href={item.disabled ? "#" : item.href}
              onClick={() => !item.disabled && setOpen(false)}
              className={cn(
                "flex items-center px-3 py-3 rounded-lg text-base font-medium transition-all duration-200",
                "hover:bg-primary/20 dark:hover:bg-primary/25",
                item.href.startsWith(`/${segment}`)
                  ? "text-foreground bg-primary/20 dark:bg-primary/25"
                  : "text-foreground/70",
                item.disabled && "cursor-not-allowed opacity-50"
              )}
            >
              {item.title}
            </Link>
          ))}
        </nav>

        {children && (
          <div className="mt-6 pt-6 border-t border-white/10">{children}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
