import "@styles/globals.css";

import { siteConfig } from "@config/site";
import { GeistSans } from "geist/font/sans";

import { Web3ModalProvider } from "@components/Web3ModalProvider";
import { marketingConfig } from "@config/marketing";
import { cn } from "@lib/utils";

import { Toaster } from "@/components/ui/Sonner";
import { jsonLdScript, siteOpenGraph, websiteJsonLd } from "@/lib/seo";
import { ButtonNav } from "@components/navigation/ButtonNav";
import { MainNav } from "@components/navigation/MainNav";
import { SiteFooter } from "@components/navigation/SiteFooter";

import { PostHogProvider } from "@components/PostHogProvider";
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
  keywords: [
    "Arbitrum governance",
    "ArbitrumDAO",
    "Arbitrum DAO voting",
    "Arbitrum proposals",
    "ARB delegation",
    "Arbitrum delegates",
    "Security Council election",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
  authors: [
    {
      name: "Offchain Labs",
      url: `${siteConfig.url}`,
    },
  ],
  creator: "Offchain Labs",
  openGraph: siteOpenGraph,
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [{ url: siteConfig.ogImage, alt: siteConfig.ogImageAlt }],
    site: siteConfig.twitterSite,
    creator: siteConfig.twitterCreator,
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
          "flex min-h-screen min-h-[100dvh] flex-col font-sans antialiased bg-[#0b0c10] transition-colors duration-200 ease-in-out",
          GeistSans.className
        )}
      >
        {/* schema.org WebSite record; see lib/seo.ts */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
        />
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
          <PostHogProvider>
            <Web3ModalProvider>
              <NerdModeProvider>
                <DeepLinkProvider>
                  <SettingsSheetProvider>
                    <header className="sticky top-0 z-50 w-full backdrop-blur-md">
                      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
                        <div className="relative flex h-16 items-center justify-between gap-2">
                          <MainNav items={marketingConfig.mainNav} />
                          <ButtonNav />
                        </div>
                      </div>
                    </header>

                    <main className="flex-1">{children}</main>
                    <SiteFooter />

                    <Toaster />
                  </SettingsSheetProvider>
                </DeepLinkProvider>
              </NerdModeProvider>
            </Web3ModalProvider>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
