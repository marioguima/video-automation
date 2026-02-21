import "./globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";

const title = Space_Grotesk({ subsets: ["latin"], variable: "--font-title" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Video Automation Studio",
  description: "Script segmentation and manifest visualization",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${title.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
