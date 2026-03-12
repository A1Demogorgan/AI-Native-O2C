import EdiOrderCaptureWorkspace from "@/components/edi-order-capture-workspace";

export default function OrderCaptureEdiPage() {
  return (
    <section>
      <h2>Order Capture - EDI</h2>
      <p>Review inbound X12 850 purchase orders, run business-rule validation, and take disposition actions.</p>
      <EdiOrderCaptureWorkspace />
    </section>
  );
}
