"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:glass group-[.toaster]:backdrop-blur-md group-[.toaster]:text-foreground group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg",
          cancelButton:
            "group-[.toast]:glass-subtle group-[.toast]:backdrop-blur-md group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg",
          success:
            "group-[.toaster]:border-emerald-500/30 group-[.toaster]:text-emerald-600 dark:group-[.toaster]:text-emerald-400",
          error:
            "group-[.toaster]:border-red-500/30 group-[.toaster]:text-red-600 dark:group-[.toaster]:text-red-400",
          warning:
            "group-[.toaster]:border-amber-500/30 group-[.toaster]:text-amber-600 dark:group-[.toaster]:text-amber-400",
          info: "group-[.toaster]:border-blue-500/30 group-[.toaster]:text-blue-600 dark:group-[.toaster]:text-blue-400",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
