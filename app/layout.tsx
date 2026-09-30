import type { Metadata } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FASTRANK DIGITAL — Digital Marketing Agency",
  description:
    "Rank Higher. Get More Customers. FastRank Digital is a full-service digital marketing agency specializing in SEO, Google Ads, Social Media, and Web Development.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#07060e] text-white selection:bg-purple-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
