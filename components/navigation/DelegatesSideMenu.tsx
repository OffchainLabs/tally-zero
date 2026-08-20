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

const items: SideMenuItem[] = [
  { href: "/delegates", title: "Delegates", icon: Users },
  { href: "/delegates/my-delegation", title: "My Delegation", icon: Vote },
  {
    href: "/delegates/register",
    title: "Create Delegate Profile",
    icon: UserPlus,
  },
];

export function DelegatesSideMenu() {
  const pathname = usePathname();

  // Longest matching href wins, so "/delegates" stays active on the explorer
  // and on individual delegate pages while its siblings claim their own routes.
  // Adding a route is a one-line edit to `items` above.
  const activeHref = items.reduce(
    (best, item) =>
      pathname.startsWith(item.href) && item.href.length > best.length
        ? item.href
        : best,
    items[0].href
  );

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
        const active = item.href === activeHref;
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
