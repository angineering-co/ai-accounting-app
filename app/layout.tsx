import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Noto_Serif_TC } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { MetaPixel } from "@/components/meta-pixel";
import { MetaPixelPageView } from "@/components/meta-pixel-page-view";

const defaultUrl =
  process.env.NODE_ENV === "production"
    ? "https://snapbooks.ai"
    : "http://localhost:3000";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "SnapBooks.ai | AI 記帳事務所",
  description:
    "SnapBooks.ai 協助一人公司與小型團隊，拍照上傳單據與 AI 整理流程，更快完成記帳與報稅。",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SnapBooks.ai",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "facebook-domain-verification": "ohe3ooztor7oanwjdrgq4dfrginbca",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

const notoSerifTC = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <MetaPixel pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID} />
        )}
      </head>
      <body className={`${geistSans.className} ${notoSerifTC.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <ServiceWorkerRegister />
        </ThemeProvider>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <Suspense fallback={null}>
            <MetaPixelPageView />
          </Suspense>
        )}
      </body>
    </html>
  );
}
