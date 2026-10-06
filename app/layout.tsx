import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Луник — AI-репетитор Софьи",
  description: "Персональный AI-репетитор для практики и осмысленного обучения.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
