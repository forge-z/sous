import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sous",
  description: "Seu inventário de cozinha, simples e persistente."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
