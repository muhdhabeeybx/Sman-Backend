require("dotenv").config();
const { client } = require("./db");
(async () => {
  for (const id of [11332, 11441, 11442]) {
    const [order] = await client`
      SELECT o.id, o.order_number, o.status, o.payment_status, o.quantity, o.pfi_id, p.pfi_number, o.completed_at
      FROM orders o LEFT JOIN pfis p ON p.id = o.pfi_id
      WHERE o.id = ${id}
    `;
    console.log(`=== id ${id} ===`, order);
    if (order) {
      const trucks = await client`SELECT quantity FROM order_trucks WHERE order_id = ${order.id}`;
      const ticketed = trucks.reduce((s,t)=>s+Number(t.quantity),0);
      console.log("trucks:", trucks.length, "ticketed:", ticketed, "order qty:", order.quantity, "balance:", Number(order.quantity)-ticketed);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
