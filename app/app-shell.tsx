"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConsultantSelection } from "@/components/consultant-context";
import O2CConsultant from "@/components/o2c-consultant";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/catalog", label: "Catalog" },
  { href: "/order-capture-edi", label: "Order Capture - EDI" },
  { href: "/agents", label: "Agents" },
];

function getConsultantContext(pathname: string) {
  if (pathname === "/") {
    return { areaId: "portfolio", areaLabel: "O2C Control Tower" };
  }
  if (pathname === "/catalog") {
    return { areaId: "portfolio", areaLabel: "O2C Catalog" };
  }
  if (pathname === "/agents") {
    return { areaId: "portfolio", areaLabel: "O2C Agent Workspace" };
  }
  if (pathname === "/order-capture") {
    return { areaId: "order-capture", areaLabel: "Order Capture Agent" };
  }
  if (pathname === "/order-capture-edi") {
    return { areaId: "order-capture-edi", areaLabel: "Order Capture - EDI" };
  }
  if (pathname === "/collections") {
    return { areaId: "collections-strategy", areaLabel: "Collections Strategy Agent" };
  }
  if (pathname === "/payments") {
    return { areaId: "cash-application", areaLabel: "Cash Application Agent" };
  }
  if (pathname === "/disputes") {
    return { areaId: "dispute-triage-resolution", areaLabel: "Dispute Triage & Resolution Agent" };
  }
  return null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { area } = useConsultantSelection();
  const isEmbedded = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("embed") === "1";
  }, []);

  const consultantContext = pathname === "/agents" ? area : getConsultantContext(pathname);

  return (
    <div className="app-shell">
      {!isEmbedded && (
        <header className="app-header">
          <Link href="/" className="brand-mark">
            <span className="brand-logo-text">SBB</span>
            <span>
              <strong>SBB Bedding</strong>
              <span className="brand-sub">Agentic O2C Platform</span>
            </span>
          </Link>
          <nav className="primary-nav">
            {nav.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
      )}
      <main className="workspace-main">{children}</main>
      {!isEmbedded && consultantContext && (
        <O2CConsultant areaId={consultantContext.areaId} areaLabel={consultantContext.areaLabel} />
      )}
    </div>
  );
}
