import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
 * Must run before first paint, or every load flashes the wrong theme. A plain <script> rather
 * than next/script because this needs to be synchronous and inline. The try/catch is load-bearing:
 * localStorage throws outright in some privacy modes, and an uncaught throw here would take the
 * whole document down.
 */
const THEME_SCRIPT =
  "try{var t=localStorage.getItem('crewrest-theme');" +
  "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
