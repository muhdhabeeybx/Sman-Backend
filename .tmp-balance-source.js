require("dotenv").config();
const { client } = require("./db");

(async () => {
  const byPfi = await client`
    SELECT d.pfi_id, p.pfi_number, d.type, COUNT(*)::int AS n, COALESCE(SUM(d.amount),0)::text AS total
    FROM deposits d LEFT JOIN pfis p ON p.id = d.pfi_id
    WHERE d.customer_id = 8041
    GROUP BY d.pfi_id, p.pfi_number, d.type
    ORDER BY SUM(d.amount) DESC
  `;
  console.log("=== Ben Odu deposits grouped by tagged PFI ===");
  console.log(byPfi);

  const current = await client`
    SELECT id, order_number, status, payment_status, total_amount, created_at
    FROM orders WHERE pfi_id = 45 ORDER BY created_at
  `;
  console.log("=== CURRENT live orders on PFI 45 (fresh check) ===", current.length);
  console.log(current);

  const holds = await client`SELECT * FROM wallet_holds WHERE customer_id = 8041 AND status = 'active'`;
  console.log("=== active holds on Ben Odu right now ===", holds.length);
  console.log(holds);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
