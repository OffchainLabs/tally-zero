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
    <>
      {/* Left: wordmark + search + mobile menu */}
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="flex items-center drop-shadow-sm"
          aria-label={siteConfig.name}
        >
          <Icons.wordmark className="h-8 w-auto" />
        </Link>

        <Link
          href="/proposals"
          aria-label="Search proposals"
          className={cn(
            "hidden size-[42px] items-center justify-center rounded-[10px] border border-[#212121] bg-white/5 text-foreground/60 transition-colors md:flex",
            "hover:bg-white/10 hover:text-foreground"
          )}
        >
          <Icons.search className="size-5" />
        </Link>

        {items && <MobileNav items={items}>{children}</MobileNav>}
      </div>

      {/* Center: desktop pill nav (viewport-centered) */}
      {items?.length ? (
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full p-1 drop-shadow-sm lg:flex">
          {items.map((item, index) => {
            const isActive = item.href.startsWith(`/${segment}`);
            return (
              <Link
                key={index}
                href={item.disabled ? "#" : item.href}
                className={cn(
                  "whitespace-nowrap rounded-full border px-5 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "border-primary bg-white/5 text-foreground"
                    : "border-[#212121] text-foreground/70 hover:bg-white/5 hover:text-foreground",
                  item.disabled && "cursor-not-allowed opacity-50"
                )}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
