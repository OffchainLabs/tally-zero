"use client";

import { UserPlus, Users, Vote } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@lib/utils";

interface SideMenuItem {
  href: string;
  title: string;
  icon: typeof Users;
}

const MY_DELEGATION_PATH = "/delegates/my-delegation";
const REGISTER_PATH = "/delegates/register";

const items: SideMenuItem[] = [
  { href: "/delegates", title: "Delegates", icon: Users },
  { href: MY_DELEGATION_PATH, title: "My Delegation", icon: Vote },
  { href: REGISTER_PATH, title: "Create Delegate Profile", icon: UserPlus },
];

export function DelegatesSideMenu() {
  const pathname = usePathname();

  // "Delegates" is the catch-all: it stays active on the explorer and on any
  // individual delegate page, but not on the sibling routes above.
  const isActive = (item: SideMenuItem) => {
    if (item.href === MY_DELEGATION_PATH || item.href === REGISTER_PATH) {
      return pathname === item.href;
    }
    return pathname !== MY_DELEGATION_PATH && pathname !== REGISTER_PATH;
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

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={linkClassName(active)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
