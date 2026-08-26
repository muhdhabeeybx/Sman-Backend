require("dotenv").config();
const { client } = require("./db");
(async () => {
  const idle = await client`
    SELECT pid, state, query, xact_start, state_change, now() - xact_start AS xact_age
    FROM pg_stat_activity
    WHERE state = 'idle in transaction' OR (state = 'active' AND now() - query_start > interval '5 seconds')
    ORDER BY xact_start
  `;
  console.log("=== idle-in-transaction / long-running ===", idle.length);
  console.log(idle);

  const locks = await client`
    SELECT l.pid, l.mode, l.granted, a.state, a.query, l.relation::regclass AS table_name
    FROM pg_locks l
    JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE l.relation IS NOT NULL AND l.relation::regclass::text IN ('orders', 'order_trucks', 'tickets')
    ORDER BY l.pid
  `;
  console.log("=== locks on orders/order_trucks/tickets ===", locks.length);
  console.log(locks);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
