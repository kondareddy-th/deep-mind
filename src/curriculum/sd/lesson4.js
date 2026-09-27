// System Design Foundations, Lesson 4 — Databases: choosing, indexing, replicating, splitting
//
// Content uses the `md` tag from ../md.js: like String.raw, plus \` becomes a backtick.
// Code/diagram blocks use ~~~ fences. NEVER write the dollar-brace sequence in content.

import { md } from '../md.js'

export default {
  id: 'sd-l4',
  title: 'SD.4 Databases — choosing, indexing, replicating, splitting',
  subtitle:
    'A page that took 20 milliseconds at launch takes 9 seconds a year later, and nobody changed a line of code. Starting from that mystery, this lesson builds the four ideas behind every database decision: indexes, transactions, replication, and sharding — each one invented to fix a specific way that growth breaks things.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You launch a shopping app. The **"My orders"** page — the one that lists a customer's recent orders —
loads in **20 milliseconds**. Everyone is happy.

A year later, support tickets pile up: *"My orders page takes forever."* You measure it: **9 seconds**.

You check the history. **No code changed.** Same query, same server, same page. The only difference is
that the table holding the orders grew from **10,000 rows** to **50 million rows**.

So here is the question to hold onto for the next few pages: *how can the same query on the same
machine get 450 times slower, just because there is more data it doesn't even need?* The customer
wants their own 20 orders, not the other 49,999,980. Why is the database looking at them at all?

To answer that, we first need a precise picture of what a database stores and how you ask it things.

## Tables, rows, and primary keys

A **relational database** (Postgres, MySQL, SQLite) stores data in **tables**. A table is like a
spreadsheet with strict rules: every **row** is one record, every **column** has a name and a type.

Our app has two tables:

~~~text
customers                              orders
+----+---------+---------+             +---------+-------------+------------+--------+
| id | name    | city    |             | id      | customer_id | created_at | total  |
+----+---------+---------+             +---------+-------------+------------+--------+
|  1 | Asha    | Chennai |             | 9001    | 1           | 2026-01-04 | 499.00 |
|  2 | Ben     | London  |             | 9002    | 2           | 2026-01-04 |  75.50 |
|  3 | Chen    | Taipei  |             | 9003    | 1           | 2026-01-05 | 120.00 |
+----+---------+---------+             +---------+-------------+------------+--------+
~~~

Two words to own:

- A **primary key** is a column whose value is **unique per row** and never changes — here, \`id\` in
  each table. It's how you point at exactly one row. ("Order 9003" means one order and only one.)
- A **foreign key** is a column that holds *another* table's primary key — here, \`orders.customer_id\`
  says "this order belongs to customer 1." That's the *relation* in "relational database."

## Asking questions: SELECT and JOIN

You ask a relational database questions in **SQL**. The "My orders" page runs this:

~~~sql
SELECT id, created_at, total
FROM orders
WHERE customer_id = 1
ORDER BY created_at DESC
LIMIT 20;
~~~

Read it as English: *from the \`orders\` table, give me these three columns, only for rows where
\`customer_id\` is 1, newest first, at most 20 of them.*

When an answer needs data from two tables, you **JOIN** them on the matching key:

~~~sql
SELECT customers.name, orders.id, orders.total
FROM orders
JOIN customers ON customers.id = orders.customer_id
WHERE customers.city = 'Chennai';
~~~

*"For every order, find the customer whose \`id\` equals the order's \`customer_id\`, glue the two rows
side by side, and keep the ones where the customer lives in Chennai."* Result:

| name | id | total |
|---|---|---|
| Asha | 9001 | 499.00 |
| Asha | 9003 | 120.00 |

Notice what SQL *doesn't* say: it never says **how** to find the rows. You describe *what* you want; the
database decides how to get it. That freedom is exactly where our 9 seconds came from.
`,
    },
    {
      type: 'ponder',
      question: md`The orders table has **50 million rows**, stored in the order they were inserted (by
\`id\`), not grouped by customer. The query asks for \`WHERE customer_id = 1\`. If the database has *no
extra help* — just the rows as stored — how many rows must it look at to be **sure** it found all of
customer 1's orders? Now imagine the rows were instead kept **sorted by \`customer_id\`**: roughly how
many rows would it need to look at to find where customer 1's orders start? Write both numbers down.`,
      answer: md`**Unsorted: all 50,000,000.** Customer 1's orders are scattered across the table — one from
January, one from March, one from last week. The database can't stop after finding one, or even after
finding twenty, because the next unexamined row *might* also belong to customer 1. The only way to be
sure is to read every row. This is called a **full table scan**.

At 10,000 rows, a full scan is nothing — the whole table fits in memory and is read in about a
millisecond. At 50 million rows of ~100 bytes each, that's ~5 GB to read. At roughly 0.5 GB per second
from disk, that's about **10 seconds**. There's your 9-second page.

**Sorted: about 26.** With the rows in \`customer_id\` order you can play "guess the number": look at the
middle row; if its \`customer_id\` is bigger than 1, throw away the upper half; repeat. Each look halves
what's left, and $2^{26} \approx 67$ million, so **26 halvings** shrink 50 million rows down to one.
Then customer 1's orders are all *next to each other* — read them in a row and stop.

**50,000,000 versus 26.** That gap, about two million to one, is the whole idea of an index.`,
    },
    {
      type: 'text',
      md: md`
## The index, derived from a phone book

You already use this trick. A paper phone book lists **1 million** people. To find "Ramanathan," you
don't read from page one. You open near the middle, see "Mehta," know R is later, jump ahead, and keep
halving. How many halvings?

$$\log_2(1{,}000{,}000) \approx 19.9 \quad\Rightarrow\quad \text{about 20 looks}$$

Let's *derive* why it's a logarithm rather than recall it. After 1 look, at most $n/2$ entries remain;
after 2 looks, $n/4$; after $k$ looks, $n / 2^k$. You're done when one entry remains:

$$\frac{n}{2^k} = 1 \quad\Rightarrow\quad 2^k = n \quad\Rightarrow\quad k = \log_2 n$$

A handy way to compute it in your head: $2^{10} = 1{,}024 \approx 1{,}000$. So every factor of 1,000 costs
about 10 halvings.

| rows $n$ | full scan reads | $\log_2 n$ (sorted lookup) |
|---|---|---|
| 1,000 | 1,000 | ~10 |
| 10,000 | 10,000 | ~13.3 → 14 |
| 1,000,000 | 1,000,000 | ~20 |
| 50,000,000 | 50,000,000 | ~25.6 → 26 |
| 1,000,000,000 | 1,000,000,000 | ~30 |

Look at the right column: going from 10,000 rows to 50 million — a **5,000×** bigger table — only
takes the lookup from ~14 steps to ~26. The full scan got 5,000× worse. **That's the difference between
a system that survives growth and one that doesn't.**

But we can't keep the *table itself* sorted by \`customer_id\` — it's already stored in \`id\` order,
and tomorrow some other page will want it sorted by date. The fix: keep a **separate, sorted copy of just
the column you search on**, with a pointer back to each full row. That separate sorted structure is an
**index**:

~~~text
index on orders(customer_id)            orders table (stored by id)
customer_id -> row location             ...
  1 -> row 9001  ----------------------> 9001 | 1 | 2026-01-04 | 499.00
  1 -> row 9003  ----------------------> 9003 | 1 | 2026-01-05 | 120.00
  1 -> row 71044 ...
  2 -> row 9002
  ...
~~~

You create one with a single line:

~~~sql
CREATE INDEX idx_orders_customer ON orders (customer_id);
~~~

The query doesn't change at all — the database notices the index and uses it on its own.

## Why it's called a B-tree

A sorted list is great for lookups but terrible for inserts: adding a row in the middle means shifting
everything after it. Real databases store the index as a **B-tree** — a sorted tree where each node
holds hundreds of keys and points to hundreds of children. Inserting touches only a few nodes; searching
walks from the root down.

One honest refinement: $\log_2 n$ counts *comparisons*. Because each B-tree node has hundreds of
children rather than 2, the tree is very shallow — 50 million keys fit in a tree about **3–4 levels
deep**, so a lookup reads only 3–4 disk pages (and the top levels usually sit in memory). The
phone-book math tells you *why* it's fast; the wide nodes make it even faster in practice.

## Indexes are not free

If indexes are this good, why not index every column? Because each index is a **second copy of data that
must stay in sync**:

1. **Every write pays.** Inserting one order with 5 indexes means updating the table *and* 5 B-trees.
   A table with many indexes accepts writes noticeably slower.
2. **Storage.** An index on \`customer_id\` for 50 million rows stores ~50 million (key, pointer) pairs
   — at roughly 40 bytes each with overhead, about **2 GB**. That's disk, and ideally memory.
3. **Useless indexes still cost.** An index on a column you never search by is pure write tax.

The rule: **index the columns your frequent queries filter or sort by — no more.** The access patterns
choose the indexes, exactly as SD.1 promised they'd choose the data model.

## Composite indexes and the leftmost-prefix rule

The "My orders" query filters by \`customer_id\` *and* sorts by \`created_at\`. An index on just
\`customer_id\` finds the customer's 50 orders, but then the database still sorts them. Better: one index
on **both columns, in order**:

~~~sql
CREATE INDEX idx_orders_cust_time ON orders (customer_id, created_at);
~~~

This is a **composite index**: sorted by \`customer_id\` first, and *within* each customer, by
\`created_at\`. Exactly like a phone book sorted by **last name, then first name**.

Now the lookup finds customer 1 in ~26 steps, and their orders are *already in date order* — read the
last 20 and stop. No sorting, no extra rows.

But the phone book teaches the catch. A book sorted by (last name, first name) can instantly find:
- everyone named "Kumar" (last name alone), and
- "Kumar, Priya" (both).

It **cannot** help you find everyone whose *first* name is Priya — Priyas are scattered through every
last name. This is the **leftmost-prefix rule**: a composite index on (A, B, C) can serve queries on A,
on A and B, or on A, B and C — any *prefix* starting from the left — but not B alone or C alone.
`,
    },
    {
      type: 'ponder',
      question: md`A \`users\` table of 200 million rows has a composite index on **\`(country, city)\`**. For
each query, predict: can it use the index to jump straight to the answer, or must it scan?

1. \`WHERE country = 'IN' AND city = 'Chennai'\`
2. \`WHERE country = 'IN'\`
3. \`WHERE city = 'Chennai'\``,
      answer: md`**1 — yes, fully.** Both columns, in index order. The database jumps to the 'IN' section,
then within it to 'Chennai'. About $\log_2(2 \times 10^8) \approx 28$ comparisons to land on the first
match.

**2 — yes.** \`country\` is the leftmost column, so all 'IN' rows sit together in the index. Jump to the
start of 'IN' and read until the country changes.

**3 — no.** \`city\` is the *second* column; Chennai entries are sorted within each country but not
gathered together. (There *could* be a "Chennai" under several countries, and they'd be far apart.) The
database must scan — either the whole table or the whole index. Same as hunting for every "Priya" in a
phone book sorted by last name.

The tempting mistake is to think an index "contains" the city column, so it must help any query about
cities. Containing a column isn't enough; the column has to be at the **front of the sort order** for
your query. If query 3 is frequent, you'd add a separate index on \`(city)\` — and pay its write cost.`,
    },
    {
      type: 'example',
      title: 'fixing the 9-second orders page, step by step',
      md: md`
**The situation.** \`orders\` has 50 million rows, 1 million customers, ~50 orders per customer on
average. Indexes: only the primary key on \`id\`.

**Step 1 — find the dominant read.** Logs show the "My orders" page is 80% of all queries against this
table:

~~~sql
SELECT id, created_at, total
FROM orders
WHERE customer_id = ?
ORDER BY created_at DESC
LIMIT 20;
~~~

**Step 2 — ask the database how it runs it.** Most databases have an \`EXPLAIN\` command that prints the
plan. Simplified:

~~~text
Before:  Seq Scan on orders   (rows examined: 50,000,000)
           Filter: customer_id = 1
         Sort by created_at   (50 rows)
         Time: ~9,000 ms
~~~

"Seq Scan" means **sequential scan** — the full table scan from our ponder.

**Step 3 — add the index that matches filter + sort, in that order.**

~~~sql
CREATE INDEX idx_orders_cust_time ON orders (customer_id, created_at);
~~~

~~~text
After:   Index Scan (backward) using idx_orders_cust_time
           Index Cond: customer_id = 1
         rows examined: ~20  (+ ~26 comparisons, 3-4 page reads to find the start)
         Time: ~2 ms
~~~

**Step 4 — count the cost.**

| | before | after |
|---|---|---|
| rows examined per page view | 50,000,000 | ~20 |
| page latency | ~9 s | ~2 ms |
| extra storage | 0 | ~2–3 GB for the index |
| extra work per new order | 1 table write + 1 PK index | + 1 more B-tree update |

The app inserts a few hundred orders per second and serves tens of thousands of page views. Paying one
extra B-tree update per write to save ~50 million row reads per view is not a close call.

**Step 5 — check the order of columns.** Would \`(created_at, customer_id)\` work as well? No: sorted by
time first, customer 1's orders are scattered across the whole date range — the leftmost-prefix rule
says a query on \`customer_id\` alone can't use it. **Column order in a composite index is part of the
design.**

The lesson in one line: *the query never changed; the data grew past the point where "read everything"
was affordable, and the index restored "read only what you need."*
`,
    },
    {
      type: 'text',
      md: md`
## Transactions: both or neither

A new problem, not about speed but about correctness. Asha sends 100 to Ben. That's two changes:

~~~sql
UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- Asha
UPDATE accounts SET balance = balance + 100 WHERE id = 2;  -- Ben
~~~

Now suppose the server loses power **between** the two lines. Asha is 100 poorer; Ben got nothing; 100
has vanished from the universe. Or two transfers run at the same time and both read Asha's balance as
150 before either subtracts, so she spends 150 twice.

The fix is a **transaction** — a group of statements the database treats as one indivisible unit:

~~~sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
~~~

If anything fails before \`COMMIT\`, the database **rolls back** — undoes every change in the group as
if it never started. Relational databases promise four properties for transactions, remembered as
**ACID**:

| letter | plain words | in the transfer |
|---|---|---|
| **A**tomicity | all of it happens, or none of it | never debit without credit |
| **C**onsistency | the data's rules hold before and after | e.g. "balance never negative" is never violated |
| **I**solation | concurrent transactions don't see each other's half-done work | two transfers can't both spend the same 150 |
| **D**urability | once it says "committed," it survives a crash | the power cut after COMMIT loses nothing |

"Both or neither" is **atomicity** — the letter people most often misattribute to consistency, because
the word "consistent" sounds like it. Keep them apart: atomicity is about *all-or-nothing*; consistency
is about *rules staying true*.

## SQL or NoSQL? Let the access pattern decide

You'll hear people argue about databases like sports teams. Ignore that. Ask SD.1's question: **how will
this data be read and written?** Different access patterns genuinely favour different designs.

**Relational (Postgres, MySQL)** — when data is *related* and you'll query it in *many different ways*.
Orders, customers, products, inventory: today you look up by customer, tomorrow the finance team wants
"total sales by city last quarter," next week support searches by product. SQL's flexibility (JOINs, any
\`WHERE\` clause, add an index later) and ACID transactions are exactly what you want.

**Key-value / document stores (DynamoDB, Redis, MongoDB)** — when nearly every access is **"fetch the
thing with this key"** and the scale is huge. A shopping cart, a user session, a URL shortener's
\`short_code → long_url\`. There's nothing to JOIN and no ad-hoc query; you want one lookup, fast, at
millions per second, spread across many machines. These systems give up flexible queries (and often
multi-row transactions) in exchange for splitting across machines easily. A *document* store is a
key-value store whose values are structured (JSON-like) documents — handy when one "thing" is naturally
nested, like a product with a list of variants.

**Wide-column stores (Cassandra, Bigtable, ScyllaDB)** — for enormous volumes of **writes that arrive in
time order** and are read back as **ranges** of one key: sensor readings, metrics, event logs, chat
messages. Data is grouped by a partition key (\`device_id\`) and sorted within it by time, so "readings
for device 42 in the last hour" is one contiguous read, and writes are cheap appends.

**The honest note.** A single well-configured Postgres server with the right indexes handles far more
than most people expect — millions of rows are trivial, billions are feasible, thousands of queries
per second are routine. Most products should start there and switch **only when a specific access
pattern outgrows it** — not because a blog post said NoSQL scales. When you do switch, it's usually for
*one part* of the system, not all of it.

## Design for the read: denormalization

SD.1 said "design for the read." Here is its sharpest tool.

The textbook way to store data — each fact in exactly one place — is called **normalized**. A
customer's name lives only in \`customers\`; orders point to it with \`customer_id\`. Clean: change the
name once, and every order "sees" the new name.

But suppose the **dominant read** is an order-history page that shows, for each order, the *product
name* and *restaurant name*. Normalized, every page view needs a three-table JOIN, millions of times a
day. **Denormalization** means deliberately storing a copy of that data *inside the row that's read*:

~~~text
orders (denormalized)
id | customer_id | created_at | total | restaurant_id | restaurant_name   | item_summary
9001 | 1         | 2026-01-04 | 499   | 77            | Saravana Bhavan   | 2x dosa, 1x coffee
~~~

Now the dominant read touches one table, one index, 20 rows. **The price:** the same fact lives in many
places. When the restaurant renames itself, which copies change? Options: update every copy (a big
background job), accept that old orders keep the old name (often *correct* for receipts!), or keep the
copy fresh with an event (SD.6's queues). Denormalize when a read is frequent and a copy is either rarely
changed or allowed to be stale — and say out loud which copy is the source of truth.
`,
    },
    {
      type: 'example',
      title: 'one food-delivery app, three access patterns, three storage choices',
      md: md`
One app, 20 million users. Instead of picking "the" database, we list the features and read off each
one's access pattern.

| feature | access pattern | volume | choice | why |
|---|---|---|---|---|
| orders, payments, restaurants, menus | related data; queried many ways (by user, by restaurant, finance reports); money moves → needs transactions | ~200 orders/s | **Postgres** | JOINs, flexible queries, ACID for payments |
| shopping cart | get/put by \`user_id\`, nothing else; lives minutes to hours | ~20,000 reads/s at dinner peak | **key-value (Redis or DynamoDB)** | one-key lookups, huge rate, no JOINs needed |
| delivery-driver GPS pings | append-only, time-ordered; read as "last 10 min for driver X" | 100,000 drivers × 1 ping / 4 s = **25,000 writes/s** | **wide-column (Cassandra)** | partition by \`driver_id\`, sorted by time; cheap writes, range reads |

Now the design-for-the-read decision inside Postgres. The "My orders" page is 70% of order queries and
shows restaurant name + item summary. Normalized, it's:

~~~sql
SELECT o.id, o.created_at, r.name, oi.product_name, oi.qty
FROM orders o
JOIN restaurants r  ON r.id = o.restaurant_id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.customer_id = ?
ORDER BY o.created_at DESC
LIMIT 20;
~~~

Denormalized — store \`restaurant_name\` and \`item_summary\` on the order row at checkout time:

~~~sql
SELECT id, created_at, restaurant_name, item_summary
FROM orders
WHERE customer_id = ?
ORDER BY created_at DESC
LIMIT 20;
~~~

With the \`(customer_id, created_at)\` index, the second query reads ~20 rows from one table. **And the
sync problem mostly disappears here** — a receipt *should* show the restaurant's name as it was when you
ordered. Denormalization is cheapest when the copy is a snapshot that's supposed to be frozen.

Checks on the numbers: 25,000 GPS writes/s is ~2 billion rows a day ($25{,}000 \times 86{,}400 = 2.16 \times 10^9$).
That volume is precisely what wide-column stores are built for — and would bury a single Postgres
server's write capacity and disk within weeks.
`,
    },
    {
      type: 'text',
      md: md`
## Replication: more copies, more readers

Your indexed Postgres now answers each query in 2 ms. Traffic grows until the one server receives
**30,000 reads per second** and its CPU is pinned. The queries are fast; there are just too many. And a
second worry: if this one machine dies, the whole app is down.

The fix for both is **replication** — keeping copies of the same database on several machines.

The common design is **leader–follower** (also called primary–replica):

~~~text
            writes                   reads
  app ------------> [ LEADER ] <---------- app (some)
                       |   |   \
          change log   |   |    \
                       v   v     v
                 [FOLLOWER][FOLLOWER][FOLLOWER]  <---- app reads
~~~

- **All writes go to the leader.** It applies them and streams a log of changes to the followers.
- **Followers replay the log**, keeping their own full copy. They serve **reads** — which is why
  they're called **read replicas**.

**Scaling reads becomes addition.** If one machine comfortably serves 6,000 reads/s and reads go to the
replicas, then 5 replicas serve $5 \times 6{,}000 = 30{,}000$ reads/s. Need 60,000? Add 5 more. Writes
don't scale this way — every write still goes through the one leader and gets replayed on *every*
follower — which is why replication is a fix for **read-heavy** systems.

## Replication lag and "where's my post?"

Streaming the change log takes time — usually milliseconds, sometimes seconds when a follower is busy.
That delay is **replication lag**, and it causes one of the most famous bugs in web development:

1. You post a comment. The write goes to the **leader**. Success!
2. The page reloads and fetches comments from a **follower**, which is 800 ms behind.
3. Your comment isn't there. You post it again. Now there are two.

The guarantee you wanted is called **read-your-own-writes**: *a user always sees their own changes,
even if other people see them a moment later.* Common fixes:

- For a short window after a user writes (say, 5 seconds), send **that user's** reads to the leader.
- Remember the log position of the user's last write, and only read from a follower that has caught up
  past it.
- Show the new item from the client's own memory on the page it just submitted.

Note what's *not* required: everyone else seeing your comment 800 ms late is fine for comments. Money
balances, inventory counts, and "did my payment go through" are the reads you route to the leader.

## Failover and the price of lag

When the leader dies, a follower is promoted to be the new leader — **failover**. It can be automatic,
but lag bites here too. With **asynchronous** replication (the leader confirms a write to the user
*before* followers have it), any writes still in flight are lost when the leader dies. At 1,000 writes/s
and 2 seconds of lag, that's up to **2,000 confirmed writes** gone.

The alternative is **synchronous** replication: the leader waits until at least one follower has the
write before confirming. No loss on failover — but every write now pays a network round trip, and if
that follower is slow, writes stall. The usual compromise is **one synchronous follower plus the rest
asynchronous**. Once again: a tradeoff you name, not a free lunch.

## Sharding: when one machine can't hold it

Replication copies *all* the data to every machine. That fixes read load, but not two other walls:

- **Too much data:** 80 TB won't fit on one machine's disks.
- **Too many writes:** 50,000 writes/s exceed what one leader can apply.

The fix is **sharding** (also called **partitioning**): split the rows *across* machines, so each
machine — each **shard** — holds only a slice. Every row goes to exactly one shard, chosen by a
**partition key** (also called a shard key): a column whose value decides where the row lives.

For example, shard the \`orders\` table by \`customer_id\` across 4 machines:

~~~text
shard = hash(customer_id) mod 4

customer_id 1   -> hash -> ... mod 4 = 2  -> shard 2
customer_id 2   -> hash -> ... mod 4 = 0  -> shard 0
customer_id 3   -> hash -> ... mod 4 = 3  -> shard 3
~~~

A **hash** is a function that scrambles a key into a big, evenly spread number, so customers land
roughly evenly across shards. Each shard is usually *also* replicated — sharding splits the data,
replication protects each slice.
`,
    },
    {
      type: 'ponder',
      question: md`A team shards its \`events\` table by **\`created_at\` date**: each day's rows go to one
shard, rotating across 30 shards (day 1 → shard 1, day 2 → shard 2, …). It seems tidy: old data is easy
to find and to delete. The app writes 40,000 events per second, all stamped with the current time.
Predict: at 3 p.m. today, **which shards are receiving writes**, and what does each shard's load look
like?`,
      answer: md`**Exactly one shard receives all 40,000 writes per second** — today's. The other 29 sit idle
for writes, holding old days nobody is writing to. Tomorrow the whole firehose moves to the next shard.

This is a **hot spot**: a shard getting far more than its fair share of load. You bought 30 machines and
get the write capacity of **one**. Reads are skewed the same way, since most users look at recent data.

The root cause: everyone, everywhere, writes **"now."** Any partition key that tracks time — a date, an
auto-incrementing id, a timestamp — funnels the newest writes into the same place.

**The better key** spreads *current* traffic evenly: \`user_id\` or \`device_id\`, hashed. Millions of
users writing right now land on all 30 shards. You can still keep time order *within* a shard (sort by
\`created_at\` inside each partition) — that's exactly the wide-column design: partition by who, sort by
when.`,
    },
    {
      type: 'text',
      md: md`
## Choosing the partition key

A good partition key does two jobs at once:

1. **Spreads load evenly** — no hot shards, now or at any moment. (\`user_id\` hashed: yes.
   \`created_at\`: no — the ponder's hot spot. \`country\`: no — one big country swamps its shard.)
2. **Keeps each common query on one shard.** "My orders" asks for one \`customer_id\` → shard by
   \`customer_id\` and the query goes to exactly one shard.

These can conflict, and the second one is the one people forget. Which brings us to the pain.

## Cross-shard queries are painful

With orders sharded by \`customer_id\`, the restaurant dashboard asks *"all orders for restaurant 77
today."* Those orders belong to thousands of customers, spread over **every shard**. The database must
send the query to all shards, wait for the slowest, and merge the results — called
**scatter-gather**. It's slow, its latency is set by the worst shard, and JOINs across shards are worse
still. Transactions touching two shards (moving money between two customers on different shards) need
extra coordination protocols that are slow and complex.

Common responses: keep a second copy of the data partitioned the *other* way (denormalization again —
a \`restaurant_orders\` table sharded by \`restaurant_id\`), or send such queries to a separate analytics
system built for scans.

## Consistent hashing, at intuition level

The \`hash(key) mod 4\` scheme has a nasty problem when you add a 5th machine: \`mod 4\` becomes \`mod 5\`,
and a key stays put only when both give the same answer. Check keys 0–19: only 0, 1, 2, 3 agree — **4 out
of 20**. So **80% of all data moves** at once — a huge, risky migration.

**Consistent hashing** fixes that. Picture a clock face (a ring). Each shard is placed at a few points
on the ring; each key is hashed to a point and belongs to the **next shard clockwise**. Adding a 5th shard
places it at new points on the ring — it takes over only the keys just counterclockwise of those points,
about **1/5 of the data**, and every other key stays exactly where it was.

~~~text
          shard A
        .-------.
  shard D         shard B         key k hashes here -> walk clockwise
       |    ring   |              -> first shard you meet owns it
  new E  .       .                adding E steals only the keys
          shard C                 between E and its neighbour
~~~

You don't need the implementation details yet. Remember the intuition: **mod-N moves almost everything
when N changes; consistent hashing moves only about 1/N.**

## Shard late

Put it together. Sharding brings: cross-shard queries, lost JOINs, hard multi-shard transactions,
resharding migrations, and many more machines to operate. Those costs are permanent.

So the order of moves when a database struggles is roughly:

1. **Fix the queries and indexes** (the 9-second page was an index, not a scale problem).
2. **Bigger machine** — vertical scaling is boring and very effective.
3. **Read replicas** and a **cache** (SD.5) for read load.
4. **Move one hot access pattern** to a store built for it (the cart to key-value, GPS to wide-column).
5. **Shard** — when data size or write rate truly exceeds one leader, and you know your partition key
   from real access patterns.

Shard when the numbers force you, and not a moment before.
`,
    },
    {
      type: 'example',
      title: 'sizing and sharding a chat app’s message store',
      md: md`
**Requirements.** 100 million daily users; 500 million messages a day; each message ~200 bytes
including index overhead; keep 3 years. Main reads: *"last 50 messages of conversation X"* and *"load
older messages of X."*

**Step 1 — estimate.**

- Writes: $5 \times 10^8 \div 10^5 = 5{,}000$ messages/s on average; peak maybe 3× → **15,000/s**.
- Storage per day: $5 \times 10^8 \times 200 = 10^{11}$ bytes = **100 GB/day**.
- Three years: $100 \text{ GB} \times 1{,}095 \approx$ **110 TB**. With 3 replicas: ~330 TB of disk.

**Step 2 — one machine? No.** 110 TB is far past one server's comfortable disk (call it ~4 TB per shard,
leaving headroom), and 15,000 writes/s at peak is heavy for one leader. We need sharding:

$$\frac{110 \text{ TB}}{4 \text{ TB per shard}} = 27.5 \;\Rightarrow\; \text{28 shards (round up; plan ~32 for growth)}$$

**Step 3 — access pattern → store.** Append-heavy, read as "recent range of one conversation" →
wide-column fits naturally. Partition by \`conversation_id\`, sort by \`message_id\` (which increases with
time) within a partition.

**Step 4 — test the candidate keys.**

| partition key | spreads writes now? | "last 50 of X" on one shard? | verdict |
|---|---|---|---|
| \`created_at\` | no — all writes hit today's shard | no — one conversation spans many days | hot spot, reject |
| \`sender_id\` | yes | no — a conversation's messages are split across both senders' shards | scatter-gather on every read, reject |
| \`conversation_id\` (hashed) | yes — millions of active conversations | yes — the whole conversation is on one shard | **choose** |

**Step 5 — name the remaining risk.** A giant group chat (a 100,000-member channel) makes one
conversation very hot. Mitigation: split huge conversations into time buckets, e.g. partition key
\`(conversation_id, month)\`, so one chat's history spreads over several partitions while "recent
messages" still reads one.

**Step 6 — what we gave up.** "Search all my messages across every conversation" is now a
scatter-gather — so it goes to a separate search index, updated asynchronously. We traded a flexible
query for linear write scaling, deliberately.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **Tables, rows, primary and foreign keys**, and SQL's \`SELECT … WHERE … ORDER BY\` and \`JOIN\` —
   you say *what*, the database decides *how*.
2. **Why the page got slow:** without an index, a query must read every row (a full scan), so its cost
   grows with the table — 50 million rows ≈ seconds.
3. **The index, derived:** a sorted structure halving the search each step, so lookups cost about
   $\log_2 n$ — ~26 comparisons for 50 million rows — and B-trees make it 3–4 page reads.
4. **Indexes cost writes and storage**, so you index exactly the columns your frequent queries filter
   and sort by.
5. **Composite indexes and the leftmost-prefix rule:** (A, B) serves A, or A-and-B, but not B alone;
   column order is a design decision.
6. **Transactions and ACID:** atomicity is both-or-neither; consistency, isolation, durability in plain
   words.
7. **SQL vs NoSQL from access patterns:** relational for related, flexibly queried data; key-value for
   fetch-by-key at scale; wide-column for time-ordered firehoses — and Postgres goes further than
   people think.
8. **Denormalization:** copy data into the row that's read most, and pay for it in keeping copies in
   sync (cheapest when the copy is a frozen snapshot).
9. **Replication:** leader–follower, read replicas scale reads by addition, replication lag,
   read-your-own-writes, failover and the data a lagging async follower can lose.
10. **Sharding:** split by a partition key that spreads *current* load and keeps common queries on one
    shard; avoid time-based hot spots; consistent hashing moves ~1/N of data; cross-shard queries and
    resharding hurt — so shard late.

Next: SD.5 puts a layer of memory in front of all this — caching — and discovers that the two hardest
questions are what to keep and when to throw it away.
`,
    },
  ],
  questions: [
    {
      id: 'sd-l4-q1',
      kind: 'mcq',
      prompt: md`A table receives 5,000 inserts per second and is queried rarely. A teammate proposes adding
indexes on 8 different columns "so any future query will be fast." What is the most important cost of
this plan?`,
      options: [
        md`Nothing significant — indexes only affect reads, so writes are unchanged`,
        md`Every insert must now also update 8 B-trees, slowing the write path this table depends on, plus the storage for 8 extra sorted copies`,
        md`Indexes make reads slower because the database has to choose among them`,
        md`The table can no longer have a primary key`,
      ],
      answer: 1,
      explain: md`Each index is a second sorted copy that must stay in sync, so every insert pays for all 8
B-tree updates — a real tax on a table that is mostly written. Option A is the tempting misconception:
indexes feel like a pure read optimisation, but the bill arrives on every write. Option C has a grain of
truth (the planner does choose), but choosing is cheap and doesn't make reads slower in any meaningful
way. The right move is to index for the queries that actually exist, and add others when a real query
needs one.`,
    },
    {
      id: 'sd-l4-q2',
      kind: 'numeric',
      prompt: md`A sorted index covers a table of **1 billion** rows. About how many halving steps
($\log_2 n$) does a lookup take to find one key? Round to the nearest whole number.`,
      answer: 30,
      tolerance: 1,
      explain: md`$2^{10} \approx 10^3$, so $10^9 = (10^3)^3 \approx (2^{10})^3 = 2^{30}$: about **30
steps** (precisely $\log_2 10^9 \approx 29.9$). Compare a full scan of 1,000,000,000 rows. Growing the
table from 1 million (~20 steps) to 1 billion rows — 1,000× more data — adds only ~10 steps. Every
factor of 1,000 costs about 10 halvings.`,
    },
    {
      id: 'sd-l4-q3',
      kind: 'mcq',
      prompt: md`A user edits their profile bio, the page reloads, and the **old** bio is shown. Ten seconds
later a refresh shows the new one. Reads are served by read replicas. What's the best diagnosis and fix?`,
      options: [
        md`The write was lost; switch to synchronous replication everywhere`,
        md`Replication lag: the reload read from a follower that hadn't caught up. Route that user's reads to the leader for a short window after they write (read-your-own-writes)`,
        md`The index on the bio column is stale; rebuild the index`,
        md`The database needs to be sharded by user_id`,
      ],
      answer: 1,
      explain: md`The write wasn't lost — it appeared ten seconds later — so the follower was simply behind.
Read-your-own-writes fixes exactly this user-visible case without slowing everyone else. Option A is
tempting because synchronous replication would remove the lag, but it charges *every* write a round trip
to solve a problem that only affects the writer's own next read. Option C misunderstands indexes: they
are updated in the same transaction as the row. Option D addresses data size or write rate, which
aren't the problem here.`,
    },
    {
      id: 'sd-l4-q4',
      kind: 'numeric',
      prompt: md`A table has **20 million** rows, with an index on \`user_id\`; each user has about **100**
rows. For \`WHERE user_id = 42\`, roughly how many steps + rows does the database touch in total using
the index (halving comparisons to find the first match, plus the matching rows)? (Without the index it
would read all 20 million.)`,
      answer: 124,
      tolerance: 15,
      explain: md`$\log_2(2 \times 10^7)$: $2^{24} \approx 16.8$ million and $2^{25} \approx 33.5$ million,
so about **24** comparisons to land on user 42's first entry, then **100** matching rows read in a row:
$24 + 100 \approx 124$. Versus 20,000,000 for a full scan — about 160,000× less work. Notice the
matching rows now dominate the cost; the search itself is almost free.`,
    },
    {
      id: 'sd-l4-q5',
      kind: 'mcq',
      prompt: md`A bank transfer runs \`BEGIN; debit Asha; credit Ben; COMMIT;\`. The server crashes after the
debit and before the commit. On restart, Asha's money is back in her account. Which ACID property
produced that outcome?`,
      options: [
        md`Consistency`,
        md`Atomicity`,
        md`Isolation`,
        md`Durability`,
      ],
      answer: 1,
      explain: md`**Atomicity** is all-or-nothing: an uncommitted transaction is rolled back entirely, so the
debit disappears with the missing credit. Consistency is the tempting answer because the result "looks
consistent" — but consistency means the data's rules (like "balance never negative") hold before and
after. Durability is tempting because a crash is involved, but durability protects what *was*
committed; this transaction never was. Isolation concerns concurrent transactions, and nothing else was
running.`,
    },
    {
      id: 'sd-l4-q6',
      kind: 'numeric',
      prompt: md`**Fermi.** A messaging app stores **500 million** messages a day at about **200 bytes**
each (including index overhead) and keeps them **3 years**. Each shard should hold at most **4 TB**. How
many shards do you need (before replication)? (1 TB = 10¹² bytes.)`,
      answer: 28,
      tolerance: 5,
      explain: md`Per day: $5 \times 10^8 \times 200 = 10^{11}$ bytes = 100 GB. Three years ≈ 1,095 days →
$100 \text{ GB} \times 1{,}095 \approx 110$ TB. Shards: $110 \div 4 = 27.5$ → **28**. In practice you'd
round up to ~32 for growth and headroom, and each shard would have ~3 replicas, so the disk bill is
about 330 TB — but the *number of shards* is set by the unreplicated data size.`,
    },
    {
      id: 'sd-l4-q7',
      kind: 'mcq',
      prompt: md`A fitness app stores heart-rate readings: 2 million watches, one reading per second each,
read back as "the last 6 hours for watch X." Which storage choice best fits the access pattern?`,
      options: [
        md`A single Postgres table with foreign keys to users, joined on every read`,
        md`A wide-column store partitioned by watch_id and sorted by time within each partition`,
        md`A key-value store with the key "latest_reading" per watch`,
        md`Postgres sharded by reading timestamp so each day's data is together`,
      ],
      answer: 1,
      explain: md`2 million writes per second, append-only, read as a time range of one key: exactly the
shape wide-column stores are built for — cheap appends, one contiguous range read. Option A is tempting
because Postgres goes far, but 2 million writes/s is far beyond one leader. Option C only fetches one
value; it can't answer "last 6 hours." Option D is the time-based hot spot: every watch writes "now," so
all 2 million writes/s land on today's shard.`,
    },
    {
      id: 'sd-l4-q8',
      kind: 'numeric',
      prompt: md`Peak read load is **45,000 reads/s**. Reads go only to read replicas, each of which handles
**5,000 reads/s**. You want to survive **one** replica failing at peak without overload. How many
replicas do you need?`,
      answer: 10,
      tolerance: 0.5,
      explain: md`$45{,}000 \div 5{,}000 = 9$ replicas just to carry the peak. To survive one failure you need
9 still standing, so **10**. (This is called **N+1** capacity.) Reads scale by addition — but writes
don't: every one of those 10 replicas must replay every write, which is why replicas help read-heavy
systems and do nothing for a write bottleneck.`,
    },
    {
      id: 'sd-l4-q9',
      kind: 'written',
      prompt: md`**Derive, don't recall.** (a) Starting only from "look at the middle of a sorted list and
throw away the half that can't contain the key," derive how many looks it takes to find one key among
$n$ sorted entries. Show the algebra. (b) Use it to compute the looks for 1,000, 1 million, and 50
million entries. (c) Using the same picture of sorted order, explain why an index on
\`(last_name, first_name)\` can find "all Kumars" quickly but cannot find "all Priyas" quickly.`,
      rubric: md`**(a)** After 1 look at most $n/2$ remain; after 2, $n/4$; after $k$, $n/2^k$. Stop when one
remains: $n/2^k = 1 \Rightarrow 2^k = n \Rightarrow k = \log_2 n$.

**(b)** Using $2^{10} \approx 1{,}000$: 1,000 → ~10; 1 million → ~20; 50 million → $2^{25} \approx 33.5$M,
$2^{26} \approx 67$M, so ~25.6 → **~26**.

**(c)** The index is sorted by last name first, and by first name only *within* each last name. All
Kumars are therefore contiguous — halve down to the first Kumar and read forward. Priyas appear inside
every last name's block (Anand, Priya … Kumar, Priya … Shah, Priya), scattered through the whole index,
so there's no single place to halve toward; you must scan. This is the leftmost-prefix rule, and it
follows from what "sorted by (A, B)" means.

Full credit = the algebra in (a) (not just "it's log n"), correct numbers in (b), and (c) explained from
sort order rather than stated as a memorised rule.`,
    },
    {
      id: 'sd-l4-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "Why does a website get slow when it has lots of
stuff, and how do big websites stay fast?" Using an analogy you invent (a school library, a toy box, a
pile of trading cards), explain: (1) why looking through everything gets slow, (2) what an index is and
why it's so much faster, (3) why big sites keep **copies** of their data on several computers, and one
problem the copies cause. No jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **Why it gets slow** — e.g. finding your one book in a library with 10 books is easy by looking at
   each; with a million books piled in the order they arrived, you'd have to check every single one.
   More stuff, more checking.
2. **The index** — the library's catalogue sorted A to Z: open to the middle, "is my title before or
   after?", throw away half, repeat. A million books takes about 20 of those "halves," not a million
   looks. Strong answers include the halving idea, not just "it's organised."
3. **Copies** — one librarian can't help a thousand kids at once, so the library makes identical copies
   of the catalogue and hires more helpers; if one helper goes home sick, the others keep going.
4. **A problem the copies cause** — when a new book arrives, one helper's copy is updated first; a kid
   asking a different helper for a minute might hear "we don't have that book" even though it just
   arrived (replication lag).
5. **Jargon audit:** "B-tree," "full table scan," "query," "replica," "latency," "log₂," "database"
   used without a kid-level translation = partial credit at best.`,
    },
    {
      id: 'sd-l4-q11',
      kind: 'written',
      prompt: md`**Schema design.** Design the database for a **ride-hailing app** with these dominant
access patterns: (1) a rider's "My trips" page, newest first, 20 per page — 70% of reads; (2) a
driver's "earnings this week" screen; (3) finance's monthly report of total fares by city. Write: the
tables with columns, primary keys and foreign keys; the indexes you'd create (with column order) and
which access pattern each serves; **one** piece of denormalization you'd choose and its sync cost; and
one index you would deliberately **not** create, with the reason.`,
      rubric: md`**Tables (sample):**

~~~text
riders(id PK, name, phone, city)
drivers(id PK, name, city, vehicle_id)
trips(id PK, rider_id FK->riders, driver_id FK->drivers, city,
      requested_at, completed_at, fare, status,
      driver_name, pickup_summary)   -- last two denormalized
~~~

**Indexes, each tied to a pattern:**

- \`trips(rider_id, requested_at)\` → "My trips": filter by rider, already sorted by time; read 20
  and stop. Column order matters — \`(requested_at, rider_id)\` would scatter one rider's trips.
- \`trips(driver_id, completed_at)\` → earnings this week: range scan of one driver's recent trips.
- Finance report: a scan over a month by city — acceptable to run on a **read replica** or an
  analytics copy; optionally \`trips(city, completed_at)\`.

**Denormalization:** store \`driver_name\` (and a pickup summary) on the trip row so "My trips" needs no
JOIN. Sync cost: if a driver changes their name, old trips show the old name — arguably correct for a
historical receipt; name which is the source of truth (\`drivers\`).

**Deliberately not indexed** (any reasoned choice): \`fare\` or \`status\` alone — low-value filters for
these patterns; every extra index taxes every trip insert.

Full credit = correct PK/FK structure, every index justified by a named access pattern *with column order
explained*, a denormalization whose sync cost is stated, and an explicit "not indexed" decision with its
write-cost reason.`,
    },
    {
      id: 'sd-l4-q12',
      kind: 'written',
      prompt: md`**Shard now or later?** Your app runs on one Postgres server: 1.5 TB of data growing 50 GB a
month, **9,000 reads/s** (p99 climbing to 400 ms), **600 writes/s**, CPU at 90%. A teammate says: "We're
at scale — let's shard by \`created_at\` this sprint." Write your response: (1) what you'd check and try
first, in order, with the reason for each; (2) whether and when sharding becomes necessary, using the
numbers; (3) what's wrong with \`created_at\` as the partition key and what you'd use instead; (4) two
costs sharding would add permanently.`,
      rubric: md`**(1) First moves, in order:** check slow queries with \`EXPLAIN\` — missing indexes cause
exactly this pattern (high CPU, rising p99), as in the 9-second orders page; add the right composite
indexes. Then read replicas (reads are 15× writes: 9,000 vs 600) and/or a cache for hot reads. Consider
a bigger machine. Move any single hot access pattern to a better-suited store.

**(2) When to shard:** 600 writes/s is comfortably within one leader, and 1.5 TB + 50 GB/month reaches
~3 TB in about 30 months — still manageable on one well-provisioned server. Sharding becomes necessary
when data outgrows one machine's disk or the write rate exceeds one leader — neither is true now. Shard
late.

**(3) The key:** \`created_at\` sends every current write to one shard — a hot spot, since everyone writes
"now" — and one user's data spreads across many shards. Use a hashed key that matches the dominant query,
typically \`user_id\` (or \`tenant_id\`), so load spreads and common queries touch one shard.

**(4) Permanent costs** (any two): cross-shard queries become scatter-gather; JOINs across shards are
lost; multi-shard transactions need coordination; resharding migrations when shards fill; more machines
to operate and monitor.

Full credit = an ordered plan starting with indexes/replicas justified by the read:write ratio, numeric
reasoning about when sharding is actually needed, the hot-spot explanation, and two concrete permanent
costs.`,
    },
  ],
}
