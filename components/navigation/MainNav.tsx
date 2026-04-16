"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import * as React from "react";

import { siteConfig } from "@config/site";
import { cn } from "@lib/utils";

import { Icons } from "@/components/Icons";
import { MobileNav } from "@components/navigation/MobileNav";

import { MainNavItem } from "@types";

interface MainNavProps {
  items?: MainNavItem[];
  children?: React.ReactNode;
}

export function MainNav({ items, children }: MainNavProps) {
  const segment = useSelectedLayoutSegment();

  return (
    <div className="flex gap-6 md:gap-10">
      <Link href="/" className="hidden items-center space-x-2 md:flex">
        <Icons.logo />
        <span className="hidden font-bold sm:inline-block">
          {siteConfig.name}
        </span>
      </Link>
      {items?.length ? (
        <nav className="hidden gap-1 md:flex glass-subtle backdrop-blur rounded-xl p-1">
          {items?.map((item, index) => (
            <Link
              key={index}
              href={item.disabled ? "#" : item.href}
              className={cn(
                "flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                "hover:bg-primary/20 dark:hover:bg-primary/25 hover:text-foreground",
                item.href.startsWith(`/${segment}`)
                  ? "text-foreground bg-primary/20 dark:bg-primary/25"
                  : "text-foreground/60",
                item.disabled && "cursor-not-allowed opacity-80"
              )}
            >
              {item.title}
            </Link>
          ))}
        </nav>
      ) : null}
      {items && <MobileNav items={items}>{children}</MobileNav>}
    </div>
  );
}
