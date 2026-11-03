import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { SpoilerModeSelector } from "@/components/layout/SpoilerModeSelector";
import { Wordmark } from "@/components/layout/Wordmark";
import { SearchProvider, SearchTrigger } from "@/components/search/SearchCommand";
import { SpoilerProvider } from "@/context/SpoilerContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "NBA Hub",
  description: "Plataforma NBA en tiempo real y en español, con modo sin spoilers.",
};

export const viewport: Viewport = {
  themeColor: "#020617",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <SpoilerProvider>
          <SearchProvider>
            <Sidebar />
            <div className="flex min-h-screen flex-col pb-20 md:pb-0 md:pl-60">
              {/* Barra superior móvil: el selector de spoilers siempre a un toque */}
              <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
                <div className="flex h-14 items-center justify-between gap-3 px-4">
                  <Wordmark />

                  <div className="flex items-center gap-1">
                    <SearchTrigger variant="icon" />
                    <SpoilerModeSelector />
                  </div>
                </div>
              </header>
              <main className="flex-1 p-4 md:p-8">{children}</main>
            </div>
            <BottomNav />
          </SearchProvider>
        </SpoilerProvider>
      </body>
    </html>
  );
}
