import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Magic — Your Personal Cloud Computer",
  description:
    "A computer that works like magic. AI-powered email, agents, dev tools, and more — all in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
