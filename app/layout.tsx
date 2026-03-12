import type { Metadata } from "next";
import AppShell from "@/app/app-shell";
import { ConsultantSelectionProvider } from "@/components/consultant-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic O2C POC",
  description: "Next.js + DuckDB + OpenAI Agents SDK",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ConsultantSelectionProvider>
          <AppShell>{children}</AppShell>
        </ConsultantSelectionProvider>
      </body>
    </html>
  );
}
