import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Predictor1 — ליגות ניחושי כדורגל",
  description: "ליגות פרטיות לניחוש תוצאות כדורגל במצב הדגמה.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
