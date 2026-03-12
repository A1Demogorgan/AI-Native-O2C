import duckdb from "duckdb";
import path from "node:path";

const db = new duckdb.Database(path.join(process.cwd(), "data", "o2c.duckdb"));

function query(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ?? []);
    });
  });
}

const checks = {
  validation_queue: `
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT action_id, capture_id, action,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    )
    SELECT COUNT(*) AS count
    FROM order_capture_orders o
    LEFT JOIN latest_validation v ON v.capture_id = o.capture_id
    WHERE v.capture_id IS NULL OR v.action <> 'accept'
  `,
  credit_queue: `
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT action_id, capture_id, action,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    ),
    latest_credit AS (
      SELECT *
      FROM (
        SELECT capture_id,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      )
      WHERE rn = 1
    )
    SELECT COUNT(*) AS count
    FROM order_capture_orders o
    INNER JOIN latest_validation v ON v.capture_id = o.capture_id
    LEFT JOIN latest_credit c ON c.capture_id = o.capture_id
    WHERE v.action = 'accept' AND c.capture_id IS NULL
  `,
  hold_queue: `
    WITH latest_credit AS (
      SELECT *
      FROM (
        SELECT capture_id, final_decision,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      )
      WHERE rn = 1
    ),
    latest_hold AS (
      SELECT *
      FROM (
        SELECT capture_id, final_decision,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM hold_resolution_actions
      )
      WHERE rn = 1
    )
    SELECT COUNT(*) AS count
    FROM order_capture_orders o
    INNER JOIN latest_credit c ON c.capture_id = o.capture_id
    LEFT JOIN latest_hold h ON h.capture_id = o.capture_id
    WHERE c.final_decision = 'hold'
      AND (h.capture_id IS NULL OR h.final_decision NOT IN ('release', 'conditional_release', 'escalate'))
  `,
  allocation_queue: `
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT capture_id, action,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    ),
    latest_credit AS (
      SELECT *
      FROM (
        SELECT capture_id, final_decision,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      )
      WHERE rn = 1
    ),
    latest_hold AS (
      SELECT *
      FROM (
        SELECT capture_id, final_decision,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM hold_resolution_actions
      )
      WHERE rn = 1
    ),
    latest_inventory AS (
      SELECT *
      FROM (
        SELECT capture_id,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM inventory_allocation_actions
      )
      WHERE rn = 1
    )
    SELECT COUNT(*) AS count
    FROM order_capture_orders o
    INNER JOIN latest_validation v ON v.capture_id = o.capture_id
    INNER JOIN latest_credit c ON c.capture_id = o.capture_id
    LEFT JOIN latest_hold h ON h.capture_id = o.capture_id
    LEFT JOIN latest_inventory i ON i.capture_id = o.capture_id
    WHERE v.action = 'accept'
      AND (
        c.final_decision IN ('approve', 'conditional')
        OR (c.final_decision = 'hold' AND h.final_decision IN ('release', 'conditional_release'))
      )
      AND i.capture_id IS NULL
  `,
  shipment_queue: `
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT capture_id, action,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    ),
    latest_credit AS (
      SELECT *
      FROM (
        SELECT capture_id, final_decision,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      )
      WHERE rn = 1
    ),
    latest_inventory AS (
      SELECT *
      FROM (
        SELECT capture_id, final_decision,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM inventory_allocation_actions
      )
      WHERE rn = 1
    ),
    latest_shipment AS (
      SELECT *
      FROM (
        SELECT subject_id,
          ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'shipment-planning' AND subject_type = 'order'
      )
      WHERE rn = 1
    )
    SELECT COUNT(*) AS count
    FROM order_capture_orders o
    INNER JOIN latest_validation v ON v.capture_id = o.capture_id
    INNER JOIN latest_credit c ON c.capture_id = o.capture_id
    INNER JOIN latest_inventory i ON i.capture_id = o.capture_id
    LEFT JOIN latest_shipment s ON s.subject_id = o.capture_id
    WHERE v.action = 'accept'
      AND i.final_decision = 'accepted'
      AND s.subject_id IS NULL
  `,
  billing_queue: `
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT capture_id, action,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    ),
    latest_credit AS (
      SELECT *
      FROM (
        SELECT capture_id, final_decision,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      )
      WHERE rn = 1
    ),
    latest_shipment AS (
      SELECT *
      FROM (
        SELECT subject_id,
          ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'shipment-planning' AND subject_type = 'order'
      )
      WHERE rn = 1
    ),
    latest_billing AS (
      SELECT *
      FROM (
        SELECT subject_id,
          ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'billing-intelligence' AND subject_type = 'order'
      )
      WHERE rn = 1
    )
    SELECT COUNT(*) AS count
    FROM order_capture_orders o
    INNER JOIN latest_validation v ON v.capture_id = o.capture_id
    INNER JOIN latest_credit c ON c.capture_id = o.capture_id
    INNER JOIN latest_shipment s ON s.subject_id = o.capture_id
    LEFT JOIN latest_billing b ON b.subject_id = o.capture_id
    WHERE v.action = 'accept'
      AND s.subject_id IS NOT NULL
      AND b.subject_id IS NULL
  `,
  invoice_matching_queue: `
    WITH latest_matching AS (
      SELECT *
      FROM (
        SELECT subject_id, final_decision,
          ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'invoice-matching' AND subject_type = 'invoice'
      )
      WHERE rn = 1
    )
    SELECT COUNT(*) AS count
    FROM invoices i
    LEFT JOIN latest_matching m ON m.subject_id = i.invoice_id
    WHERE m.subject_id IS NULL OR m.final_decision IN ('variance_detected', 'investigate')
  `,
  payment_prediction_queue: `
    WITH latest_prediction AS (
      SELECT *
      FROM (
        SELECT subject_id,
          ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'payment-prediction' AND subject_type = 'customer'
      )
      WHERE rn = 1
    )
    SELECT COUNT(*) AS count
    FROM customers c
    WHERE EXISTS (
      SELECT 1
      FROM invoices i
      WHERE i.customer_id = c.customer_id AND i.amount_open > 0
    )
      AND NOT EXISTS (
        SELECT 1
        FROM latest_prediction p
        WHERE p.subject_id = c.customer_id
      )
  `,
  collections_queue: `
    WITH latest_comms AS (
      SELECT *
      FROM (
        SELECT subject_id,
          ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'collections-communications' AND subject_type = 'collection_action'
      )
      WHERE rn = 1
    )
    SELECT COUNT(*) AS count
    FROM collections_actions c
    LEFT JOIN latest_comms m ON m.subject_id = c.action_id
    WHERE c.status <> 'resolved' AND m.subject_id IS NULL
  `,
  cash_application_queue: `
    SELECT COUNT(*) AS count
    FROM payments p
    WHERE p.amount_unapplied > 0
      AND EXISTS (
        SELECT 1
        FROM invoices i
        WHERE i.customer_id = p.customer_id AND i.amount_open > 0
      )
  `,
  dispute_queue: `
    SELECT COUNT(*) AS count
    FROM disputes
    WHERE status <> 'resolved'
  `,
  golden_traces: `
    SELECT COUNT(*) AS count
    FROM order_journey_trace
    WHERE golden_tag IS NOT NULL AND lifecycle_status = 'dispute_resolved'
  `,
  golden_complete: `
    SELECT COUNT(*) AS count
    FROM order_journey_trace
    WHERE golden_tag IS NOT NULL
      AND invoice_id IS NOT NULL
      AND payment_id IS NOT NULL
      AND collection_action_id IS NOT NULL
      AND dispute_id IS NOT NULL
      AND resolved_at IS NOT NULL
  `,
};

for (const [name, sql] of Object.entries(checks)) {
  const rows = await query(sql);
  console.log(`${name}:${rows[0].count}`);
}
