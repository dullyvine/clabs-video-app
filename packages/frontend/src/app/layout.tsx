import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { QueueProvider } from "@/contexts/QueueContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Video Generator - YouTube Content Creator",
  description: "Transform scripts into stunning videos with AI-powered voiceovers and visuals",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <AppProvider>
            <QueueProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </QueueProvider>
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
