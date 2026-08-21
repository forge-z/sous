import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sous",
  description: "Your kitchen has an inventory. Sous makes it useful."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
