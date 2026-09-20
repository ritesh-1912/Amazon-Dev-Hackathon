import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus Ops — Alexa+ Simulator",
  description: "Academic operations assistant with dependency tracking and human-guarded actions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
