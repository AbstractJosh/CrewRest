import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppHeader from "@/components/chrome/AppHeader";
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
  title: "CrewRest",
  description: "Plan commute trips home around your flight schedule",
};

/*
 * Must run before first paint, or a pilot who chose dark gets a flash of light paper on every
 * load. Only dark is applied: light is what the stylesheet already is, so there is nothing to set.
 *
 * A plain <script> rather than next/script because this needs to be synchronous and inline. The
 * try/catch is load-bearing: localStorage throws outright in some privacy modes, and an uncaught
 * throw here would take the whole document down.
 */
const THEME_SCRIPT =
  "try{if(localStorage.getItem('crewrest-theme')==='dark')" +
  "document.documentElement.setAttribute('data-theme','dark')}catch(e){}";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <AppHeader />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
