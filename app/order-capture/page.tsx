"use client";

import { useMemo, useState } from "react";
import OrderCaptureWorkspace from "@/components/order-capture-workspace";

export default function OrderCapturePage() {
  const params = useMemo(() => {
    if (typeof window === "undefined") {
      return { embed: false, mailboxId: "", autoloadNonce: 0 };
    }
    const params = new URLSearchParams(window.location.search);
    const isEmbed = params.get("embed") === "1";
    const mailbox = params.get("mailbox") ?? "";
    const autoload = params.get("autoload") === "1";
    return {
      embed: isEmbed,
      mailboxId: mailbox,
      autoloadNonce: autoload && mailbox ? 1 : 0,
    };
  }, []);
  const [embed] = useState(params.embed);
  const [autoloadNonce] = useState(params.autoloadNonce);
  const [mailboxId] = useState<string>(params.mailboxId);

  return (
    <OrderCaptureWorkspace
      showTitle={!embed}
      hideMailboxControls={embed}
      externalMailboxId={mailboxId}
      autoloadNonce={autoloadNonce}
      showCapturedOrders={!embed}
    />
  );
}
