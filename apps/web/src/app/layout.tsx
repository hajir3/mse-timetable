import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MSE Timetable",
  description: "Personal timetable for ZHAW MSE students",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <Show when="signed-in">
            <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
              <nav className="flex items-center gap-4 text-sm font-medium">
                <Link href="/calendar" className="hover:underline">
                  Calendar
                </Link>
                <Link href="/catalog" className="hover:underline">
                  Catalog
                </Link>
              </nav>
              <UserButton />
            </header>
          </Show>
          <main className="flex flex-1 flex-col">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
