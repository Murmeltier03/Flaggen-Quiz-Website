import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flaggenfieber – Das Live-Flaggenquiz",
  description: "Das rasante Flaggenquiz für dich und deine Freunde.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
