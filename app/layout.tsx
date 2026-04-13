import "@styles/globals.css";

import { siteConfig } from "@config/site";
import { GeistSans } from "geist/font/sans";

import { Web3ModalProvider } from "@components/Web3ModalProvider";
import { marketingConfig } from "@config/marketing";
import { cn } from "@lib/utils";

import { Toaster } from "@/components/ui/Sonner";
import { ButtonNav } from "@components/navigation/ButtonNav";
import { MainNav } from "@components/navigation/MainNav";
import { SiteFooter } from "@components/navigation/SiteFooter";

import { Analytics } from "@components/Analytics";
import { ThemeProvider } from "@components/ThemeProvider";
import { DeepLinkProvider } from "@context/DeepLinkContext";
import { NerdModeProvider } from "@context/NerdModeContext";
import { SettingsSheetProvider } from "@context/SettingsSheetContext";

export const metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: ["Arbitrum Governance", "Arbitrum DAO", "ArbitrumDAO"],
  authors: [
    {
      name: "Offchain Labs",
      url: `${siteConfig.url}`,
    },
  ],
  creator: "Offchain Labs",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
    images: [siteConfig.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
    creator: "@offchain",
  },
  icons: {
    icon: "/favicon/favicon.ico",
    shortcut: "/favicon/favicon-16x16.png",
    apple: "/favicon/apple-touch-icon.png",
  },
  manifest: siteConfig.manifest,
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />

      <body
        className={cn(
          "min-h-screen font-sans antialiased bg-[#f0f8ff] dark:bg-[#040019] transition-colors duration-200 ease-in-out",
          GeistSans.className
        )}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Web3ModalProvider>
            <NerdModeProvider>
              <DeepLinkProvider>
                <SettingsSheetProvider>
                  <header className="sticky top-0 z-50 w-full">
                    <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4">
                      <div className="glass rounded-2xl px-4 sm:px-6 backdrop-blur-md">
                        <div className="flex h-14 sm:h-16 items-center justify-between gap-2">
                          <MainNav items={marketingConfig.mainNav} />
                          <ButtonNav />
                        </div>
                      </div>
                    </div>
                  </header>

                  {children}
                  <SiteFooter />

                  <Toaster />
                  <Analytics />
                </SettingsSheetProvider>
              </DeepLinkProvider>
            </NerdModeProvider>
          </Web3ModalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
