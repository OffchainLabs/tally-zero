"use client";

import { ExternalLink, UserPlus, Users, Vote } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@lib/utils";

interface SideMenuItem {
  href: string;
  title: string;
  icon: typeof Users;
  external?: boolean;
}

const items: SideMenuItem[] = [
  { href: "/delegates", title: "Delegates", icon: Users },
  { href: "/delegates/my-delegation", title: "My Delegation", icon: Vote },
  {
    href: "https://github.com/OffchainLabs/tally-zero/issues/new?template=delegate-profile-registration.yml",
    title: "Create Delegate Profile",
    icon: UserPlus,
    external: true,
  },
];

const MY_DELEGATION_PATH = "/delegates/my-delegation";

export function DelegatesSideMenu() {
  const pathname = usePathname();

  const isActive = (item: SideMenuItem) => {
    if (item.external) return false;
    if (item.href === MY_DELEGATION_PATH) {
      return pathname === MY_DELEGATION_PATH;
    }
    return pathname !== MY_DELEGATION_PATH;
  };

  const linkClassName = (active: boolean) =>
    cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
      "hover:bg-primary/20 dark:hover:bg-primary/25 hover:text-foreground",
      active
        ? "text-foreground bg-primary/20 dark:bg-primary/25"
        : "text-foreground/60"
    );

  return (
    <nav
      aria-label="Delegates section"
      className="glass-subtle backdrop-blur rounded-xl p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible"
    >
      {items.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        const content = (
          <>
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.title}</span>
            {item.external && (
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
            )}
          </>
        );

        if (item.external) {
          return (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName(active)}
            >
              {content}
            </a>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={linkClassName(active)}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
