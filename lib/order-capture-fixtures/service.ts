import { MAILBOXES, MESSAGES } from "@/lib/order-capture-fixtures/mailboxes";
import { extractTextFromSyntheticPdf } from "@/lib/order-capture-fixtures/pdfText";
import type { OrderMailbox, OrderMailboxMessage } from "@/lib/types";

export function listOrderMailboxes(): OrderMailbox[] {
  return MAILBOXES;
}

export function getLatestMailboxMessage(mailboxId: string): (OrderMailboxMessage & { attachment_text: string }) | null {
  const latest = MESSAGES.filter((msg) => msg.mailbox_id === mailboxId)
    .sort((a, b) => (a.received_at > b.received_at ? -1 : 1))[0];

  if (!latest) {
    return null;
  }

  const attachmentText = extractTextFromSyntheticPdf(latest.attachment.public_url);
  return {
    ...latest,
    attachment_text: attachmentText,
  };
}
