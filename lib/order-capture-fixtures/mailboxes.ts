export type Mailbox = {
  mailbox_id: string;
  display_name: string;
  address: string;
};

export type MailMessage = {
  message_id: string;
  mailbox_id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  received_at: string;
  attachment: {
    file_name: string;
    public_url: string;
    content_type: string;
  };
};

export const MAILBOXES: Mailbox[] = [
  {
    mailbox_id: "hospitality-east",
    display_name: "Hospitality East Orders",
    address: "hospitality-east-orders@mattressco.example",
  },
  {
    mailbox_id: "hospitality-central",
    display_name: "Hospitality Central Orders",
    address: "hospitality-central-orders@mattressco.example",
  },
  {
    mailbox_id: "hospitality-west",
    display_name: "Hospitality West Orders",
    address: "hospitality-west-orders@mattressco.example",
  },
];

export const MESSAGES: MailMessage[] = [
  {
    message_id: "msg-east-001",
    mailbox_id: "hospitality-east",
    from: "procurement@harborviewsuites.com",
    to: "hospitality-east-orders@mattressco.example",
    subject: "Purchase Order HVS-PO-2026-0310 for King/Queen mattress replenishment",
    body: "Hello team,\nPlease process attached replenishment order for HarborView Suites Boston.\nNeed dispatch in this week due to occupancy uplift.\nRegards,\nLena Ortiz\nRegional Procurement",
    received_at: "2026-03-09T08:15:00.000Z",
    attachment: {
      file_name: "HVS_PO_2026_0310.pdf",
      public_url: "/synthetic-mail/HVS_PO_2026_0310.pdf",
      content_type: "application/pdf",
    },
  },
  {
    message_id: "msg-central-001",
    mailbox_id: "hospitality-central",
    from: "supplychain@lotushospitalitygroup.com",
    to: "hospitality-central-orders@mattressco.example",
    subject: "Urgent order placement - Lotus Riverside Chicago",
    body: "Hi Mattress Co Team,\nThe signed order form is attached for Lotus Riverside Chicago renovation rooms.\nPlease confirm ATP and expected ship date by EOD.\nThanks,\nEvan Kim",
    received_at: "2026-03-09T10:25:00.000Z",
    attachment: {
      file_name: "LOTUS_RIVERSIDE_ORDER_77A.pdf",
      public_url: "/synthetic-mail/LOTUS_RIVERSIDE_ORDER_77A.pdf",
      content_type: "application/pdf",
    },
  },
  {
    message_id: "msg-west-001",
    mailbox_id: "hospitality-west",
    from: "opsbuying@sunsetresortcollection.com",
    to: "hospitality-west-orders@mattressco.example",
    subject: "Order submitted for Sunset Resort Las Vegas tower expansion",
    body: "Good morning,\nAttached is the completed PDF order form for new tower rollout.\nPlease split shipment by floor and mark priority.\nBest,\nRiya Menon",
    received_at: "2026-03-09T11:45:00.000Z",
    attachment: {
      file_name: "SUNSET_RESORT_PO_1182.pdf",
      public_url: "/synthetic-mail/SUNSET_RESORT_PO_1182.pdf",
      content_type: "application/pdf",
    },
  },
];
