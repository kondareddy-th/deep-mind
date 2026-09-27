// System Design Foundations, Lesson 5 — Caching
//
// Content uses the `md` tag from ../md.js: like String.raw, plus \` becomes a backtick.
// Code/diagram blocks use ~~~ fences. NEVER write the dollar-brace sequence in content.

import { md } from '../md.js'

export default {
  id: 'sd-l5',
  title: 'SD.5 Caching — the fastest request is the one you don\'t make',
  subtitle:
    'A database answering the same question fifty thousand times a second is not busy, it is wasteful. This lesson derives the two formulas that govern every cache, then walks through where caches live, how they are written and emptied, and the handful of ways they fail at exactly the wrong moment.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You run an online shop. The product page does one database query — "give me product 48213: name,
price, photos, stock" — and that query takes **20 ms**. At peak, the site serves **50,000 product-page
requests per second**.

Your database team is in pain. The database is pinned at full CPU, p99 latency is climbing, and they
want budget for three more database servers.

Then someone looks at the access logs and finds something odd: **90% of all requests are for the same
1% of products** — this week's bestsellers, the item on the homepage banner, the phone everyone is
buying. The database is not doing 50,000 different jobs a second. It is answering *the same few
thousand questions*, over and over, and getting exactly the same answers each time.

How much of that work could you simply... not do?

That's the whole of this lesson. Remember the ponder from SD.1: **put each piece of data on the cheapest
rung of the latency ladder that still meets its latency requirement.** The database's disk-backed
storage is the right home for all ten million products. But the few thousand that everyone is reading
right now deserve a higher rung — memory — and a copy of them kept there is called a **cache**.

## Naming the pieces

A **cache** is a small, fast store holding *copies* of data whose real, authoritative home (the
**source of truth**) is somewhere slower. When a request arrives, you check the cache first:

- If the data is there, that's a **hit** — you answer from the fast store.
- If it isn't, that's a **miss** — you go to the slow store, and usually put a copy in the cache for
  next time.

The **hit rate** $h$ is the fraction of requests that are hits. If 9 out of 10 requests find their data
in the cache, $h = 0.9$. Everything about a cache's value follows from this one number.

## Deriving the first formula: effective latency

Suppose a cache lookup takes $t_{cache}$ and a database lookup takes $t_{db}$. Take 100 requests.

- $100h$ of them hit and each costs $t_{cache}$.
- $100(1-h)$ of them miss and each costs roughly $t_{db}$. (Strictly a miss costs $t_{cache} + t_{db}$ —
  you checked the cache first — but $t_{cache}$ is tiny next to $t_{db}$, so we drop it.)

Total time over 100 requests, divided by 100, is the average — the **effective latency**:

$$L_{eff} = h \cdot t_{cache} + (1-h) \cdot t_{db}$$

It's just a weighted average: each path's cost, weighted by how often you take it.

## Deriving the second formula: load on the database

Only misses reach the database. If the site serves $Q$ requests per second (**QPS**, queries per
second), then the database sees:

$$Q_{db} = (1-h) \times Q$$

This second formula is the one that decides whether you need three more database servers.

## Working the puzzle at h = 0.9

Suppose we cache the hot 1% of products in an in-memory store sitting in the same datacenter. A
lookup there is a network round trip inside the datacenter — about **0.5 ms** on the SD.1 ladder. Since
90% of requests are for that 1%, the hit rate is about $h = 0.9$.

**Latency:** $0.9 \times 0.5 + 0.1 \times 20 = 0.45 + 2.0 = 2.45$ ms. Down from 20 ms — about 8× faster
on average.

**Database load:** $0.1 \times 50{,}000 = 5{,}000$ QPS. Down from 50,000 — the database now does a
tenth of the work. The three new servers are no longer needed; the existing one has slack.

Notice something about the latency number: of the 2.45 ms, only 0.45 ms comes from the 90% of requests
that hit. **2.0 ms comes from the 10% that miss.** The misses dominate the average even though they are
rare. That is the key to the next question.
`,
    },
    {
      type: 'ponder',
      question: md`Marketing wants more products on the homepage, and you have spare memory, so you grow the
cache. The hit rate climbs from **90% to 99%**. Before computing anything: by how much does the load on
the database fall? Most people's instinct says "about 10% less, since the hit rate went up by about
10%." Commit to a number, then check it with $Q_{db} = (1-h) \times Q$ at 50,000 QPS.`,
      answer: md`The database load falls **10×**, not 10%.

- At $h = 0.90$: $Q_{db} = 0.10 \times 50{,}000 = 5{,}000$ QPS.
- At $h = 0.99$: $Q_{db} = 0.01 \times 50{,}000 = 500$ QPS.

The trick is to look at the **miss rate** $1-h$, not the hit rate. The hit rate moved from 0.90 to 0.99
— a small-looking change. The miss rate moved from 0.10 to 0.01 — divided by ten. And the database only
ever sees misses.

Latency follows the same logic: $0.99 \times 0.5 + 0.01 \times 20 = 0.495 + 0.2 = 0.695$ ms, down
from 2.45 ms — about 3.5× faster. (It improves less than the load does, because now the 0.5 ms cache
lookups themselves are most of the cost.)

The lesson generalises and it cuts both ways: **each extra "nine" of hit rate divides the database load
by ten** — and a hit rate *dropping* from 99% to 90% multiplies the database load by ten. A cache that
"only" gets a little worse can flatten the database behind it. Keep that in mind for the failure modes
later in this lesson.`,
    },
    {
      type: 'text',
      md: md`
## Where caches live: the ladder again

"The cache" is not one place. A single request for a product page can pass through five of them, each on
a different rung of the ladder, and each can answer before the request reaches the next:

| where | what it holds | rough cost of a hit | who sees it |
|---|---|---|---|
| **browser cache** | images, scripts, pages the user already fetched | ~0 ms — no network at all | one user |
| **CDN** (content delivery network — servers in many cities) | static files, whole pages, popular images | ~10–30 ms (a nearby city, instead of ~100–150 ms to your datacenter) | everyone near that city |
| **application memory** (a dict inside your server process) | small, very hot objects: config, top products | microseconds | one server |
| **shared cache** (a separate in-memory server such as Redis or Memcached) | objects, query results, sessions | ~0.5 ms (one datacenter round trip) | all your servers |
| **the database's own cache** (its buffer pool: recently read pages kept in RAM) | table and index pages | ~1 ms (avoids the disk, not the query work) | the database |

A few things this table teaches:

- **The closer to the user, the bigger the win and the harder the control.** A browser hit costs nothing,
  but once a stale price is sitting in ten million browsers you cannot reach in and delete it. A shared
  cache you own completely.
- **Application memory is fastest on the server side but not shared.** With 40 app servers, each keeps
  its own copy and each warms up separately; an update must be made in 40 places. The shared cache is one
  network hop slower but has a single copy that every server sees.
- **The database's cache helps, but only a little.** It saves the disk read, yet the database still parses
  the query, plans it, and uses a connection. Your 50,000 QPS still arrive at its door.

Most of this lesson is about the shared cache, because that's where the design decisions live. But the
formulas apply to every rung — and they **stack**: if the CDN absorbs 60% of requests and the shared cache
catches 90% of what's left, the database sees $0.4 \times 0.1 = 0.04$ — just 4% of the original traffic.
`,
    },
    {
      type: 'text',
      md: md`
## Strategy 1: cache-aside (lazy loading)

The most common pattern, and the one to reach for first. The **application** manages the cache itself:
read the cache; on a miss, read the database and put the result in the cache. The cache sits "aside" —
the database doesn't know it exists.

~~~python
import json

TTL_SECONDS = 300   # how long a cached copy may live before it expires (explained below)

def get_product(product_id):
    key = f"product:{product_id}"
    cached = cache.get(key)              # ~0.5 ms
    if cached is not None:
        return json.loads(cached)        # HIT

    product = db.query("SELECT * FROM products WHERE id = %s", product_id)   # ~20 ms, MISS
    cache.set(key, json.dumps(product), ex=TTL_SECONDS)
    return product

def update_price(product_id, new_price):
    db.execute("UPDATE products SET price = %s WHERE id = %s", new_price, product_id)
    cache.delete(f"product:{product_id}")    # next read will miss and reload the fresh row
~~~

**Why it's popular:** only data that someone actually reads ever gets cached, so memory is spent on the
hot set automatically. And if the cache server dies, reads still work — they just all go to the database
(slowly — we'll come back to how slowly).

**Its costs:** the first read of anything is a miss (a **cold** cache has $h = 0$). And the cache can hold
a copy that is older than the database — **stale** data — which is the invalidation problem below.

## Strategy 2: write-through

Every write goes to the cache **and** the database, synchronously, before the write is confirmed.

~~~python
def update_price_write_through(product_id, new_price):
    db.execute("UPDATE products SET price = %s WHERE id = %s", new_price, product_id)
    product = db.query("SELECT * FROM products WHERE id = %s", product_id)
    cache.set(f"product:{product_id}", json.dumps(product))   # cache updated in the same request
~~~

**Gain:** the cache is always fresh for data written through it; reads right after a write hit.
**Cost:** every write pays for two stores, so writes are slower; and you cache things on write that may
never be read (a product nobody looks at still occupies memory). Usually combined with cache-aside for
reads.

## Strategy 3: write-back (write-behind)

Writes go **only** to the cache and are confirmed immediately; the cache flushes them to the database
later, in batches.

**Gain:** writes are as fast as memory, and a thousand increments of the same counter can be folded into
one database write.
**Risk: data loss.** Between the write and the flush, the only copy of the data lives in RAM. If the cache
server crashes, those writes are gone — even though the user was told "saved."

## When each fits

| strategy | fits when | example |
|---|---|---|
| cache-aside | reads dominate, a little staleness is tolerable | product pages, user profiles, article bodies |
| write-through | data is read soon after it's written, and must be fresh | a user's settings page, shopping cart |
| write-back | very high write rate, losing a few seconds of writes is acceptable | view counters, "likes," metrics |

A useful test for write-back: *"If we lost the last 5 seconds of these writes, would anyone notice or
be harmed?"* A view counter being off by 40: no. A bank transfer: absolutely — never write-back money.
`,
    },
    {
      type: 'text',
      md: md`
## Eviction: when memory is full, what goes?

A cache is small by design — that's why it's affordable. So eventually it's full, a new item arrives, and
something must be thrown out (**evicted**). Which item?

Think about what you'd want: throw out the item *least likely to be needed soon*. You can't see the
future, but you can see the past, and in most workloads the recent past predicts the near future — a
product viewed a second ago is more likely to be viewed again than one last viewed yesterday. So:

> **If memory is full, throw out what you haven't used for the longest time.**

That's **LRU** — *least recently used*. To implement it you need two things: fast lookup by key, and an
ordering by recency where you can move an item to the "just used" end and pop from the "oldest" end
cheaply. Python's \`OrderedDict\` does exactly both:

~~~python
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.data = OrderedDict()          # oldest at the front, newest at the back

    def get(self, key):
        if key not in self.data:
            return None                    # miss
        self.data.move_to_end(key)         # it was just used: move to the "newest" end
        return self.data[key]

    def put(self, key, value):
        if key in self.data:
            self.data.move_to_end(key)
        self.data[key] = value
        if len(self.data) > self.capacity:
            self.data.popitem(last=False)  # evict from the "oldest" end
~~~

Every operation is $O(1)$ — constant time regardless of cache size — which is why LRU (or a cheap
approximation of it) is the most common eviction policy. Memcached uses LRU out of the box. Redis is a
useful surprise: its *default* policy is \`noeviction\` (refuse new writes when memory is full), so for a
cache you must set \`maxmemory-policy allkeys-lru\` (or \`allkeys-lfu\`) yourself.

**Two alternatives worth knowing:**

- **LFU — least *frequently* used.** Evict the item with the fewest accesses. Better when popularity is
  stable over long periods (a site's logo, the top 100 products all year). Worse when popularity shifts:
  last month's viral item has a huge count and squats in the cache long after everyone stopped caring.
- **TTL — time to live.** Not really an eviction policy but an *expiry*: each item carries a lifetime
  ("300 seconds") after which it's treated as gone, whether memory is full or not. TTL bounds how stale
  data can get; LRU/LFU decide what to drop when space runs out. Real caches use both.
`,
    },
    {
      type: 'example',
      title: 'tracing an LRU cache by hand',
      md: md`
A cache with **capacity 3**. Requests arrive for keys in this order:

~~~text
A  B  C  A  D  B  E  A
~~~

Track the order (oldest on the left, newest on the right) after each request:

| request | hit or miss? | cache after (oldest → newest) | evicted |
|---|---|---|---|
| A | miss | A | — |
| B | miss | A B | — |
| C | miss | A B C | — |
| A | **hit** | B C A | — (A moves to newest) |
| D | miss | C A D | **B** (oldest) |
| B | miss | A D B | **C** |
| E | miss | D B E | **A** |
| A | miss | B E A | **D** |

**Hit rate:** 1 hit out of 8 requests, $h = 1/8 = 0.125$. Terrible — but look at why. There are **5
distinct keys** and room for **3**. When the set of items being actively used (the **working set**) is
larger than the cache, LRU keeps throwing out things just before they're needed again. This is called
**thrashing**.

**Now double the capacity to 6** and replay the same sequence: A, B, C miss; A hits; D misses; B hits;
E misses; A hits. That's 3 hits out of 8, $h = 0.375$ — and on the *next* round of the same pattern,
every request would hit because all 5 keys fit.

The lesson: a cache only works when it's at least as big as the hot working set. Below that size the hit
rate collapses; above it, extra memory buys very little. Sizing a cache (later in this lesson) is about
finding that knee.
`,
    },
    {
      type: 'text',
      md: md`
## Invalidation: "one of the two hard things"

There's an old joke: *"There are only two hard things in computer science: cache invalidation and naming
things."* It's a joke because it's true.

The problem: a cache holds a **copy**. The moment the source of truth changes, the copy is wrong — and the
cache doesn't know.

**A concrete disaster.** A laptop costs 1,200. At 10:00 the merchant drops the price to 999 for a flash
sale and updates the database. But the product page is cached with a 1-hour TTL at 9:55. Until 10:55,
every shopper sees 1,200 — the sale is invisible, and the merchant is furious. Worse, reverse it: the
price goes *up*, the cache still shows the old low price, and customers order at a price you no longer
honour.

**Invalidation** means making the cache stop serving a copy that no longer matches the truth. Three
tools:

**1. TTL — let it expire.** Every entry lives at most $T$ seconds, so data is never more than $T$
seconds stale. Simple, and a good safety net for everything. But you're choosing a tradeoff with one
knob: short TTL → fresher data but more misses (lower $h$, more database load); long TTL → high $h$ but
staler data. For the laptop price, a 1-hour TTL was simply the wrong setting.

**2. Delete-on-write — invalidate explicitly.** When you write to the database, delete the cache key
(as \`update_price\` did above). The next read misses and loads the fresh row. Precise, but you must
remember to do it on *every* code path that writes the data — miss one, and that path produces stale
reads until the TTL rescues you.

**3. Versioned keys — never overwrite, change the name.** Put a version in the key:
\`product:48213:v7\`. When the product changes, bump the version to \`v8\` (stored somewhere
authoritative, e.g. a column in the row). Readers ask for \`v8\`, which isn't cached, so they miss and load
fresh data; the old \`v7\` entry is never read again and quietly ages out via LRU/TTL. This is exactly how
websites handle static files: \`app.3f9a2c.js\` — a new file name for each build, so the CDN and browsers can
cache each one forever.

## The race: how delete-then-write lets stale data back in

Here is a subtle bug. You decide to invalidate *before* writing, reasoning "delete the old copy, then
update the database." Two requests run at the same time — **W** (updating the price from 1,200 to 999)
and **R** (reading the product):

~~~text
time   W (writer)                          R (reader)
 t1    cache.delete("product:48213")
 t2                                        cache.get(...)  -> MISS
 t3                                        db.query(...)   -> price 1,200  (old!)
 t4    db.update(... price = 999)
 t5                                        cache.set(..., price 1,200)
~~~

After $t_5$ the database says 999 and the cache says 1,200 — **and the cache will keep saying it until
the TTL expires**, because nobody will delete it again. The reader slipped in between the delete and the
write, fetched the old value, and put it back.

**The fix: write first, then delete.** Update the database, *then* delete the key. Now any reader that
misses afterwards sees the new row. (A much rarer race remains: a reader that fetched the old row
*before* the write could still set it *after* the delete. Defences: a short TTL as a backstop, a second
"delayed delete" a moment later, or versioned keys, which make the race impossible because a stale
value would be stored under an old name nobody reads.)

The general principle: **always keep a TTL, even when you invalidate explicitly.** Explicit
invalidation makes data fresh in the common case; the TTL caps the damage when a bug or race slips
through.
`,
    },
    {
      type: 'text',
      md: md`
## When caches fail: three ways to flatten a database

The formulas said it: the database sees $(1-h) \times Q$. A database sized for 5,000 QPS at $h = 0.9$
is safe only as long as $h$ stays near 0.9. Every failure mode below is a story of $h$ suddenly
collapsing — for one key, for every key, or for keys that don't exist.

### 1. Thundering herd (cache stampede)

The homepage's featured product is one key, read **10,000 times a second**, cached with a TTL. At some
instant the TTL runs out. What happens next?
`,
    },
    {
      type: 'ponder',
      question: md`The hot key expires. Refilling it takes one database query of **20 ms**. With plain
cache-aside and no protection, every request that misses goes to the database itself. Predict: how many
requests hit the database for that one key during those 20 ms? And why is the real number often *worse*
than your estimate?`,
      answer: md`Requests arrive at 10,000 per second, which is $10{,}000 \times 0.02 = 200$ requests in 20 ms.
Every one of them checks the cache, misses (the first request hasn't finished refilling it yet), and
sends **the same query** to the database. So about **200 identical queries** land at once, where one
would have done.

Why it's often worse: those 200 simultaneous queries make the database slower — say each now takes
100 ms instead of 20 — so the window stays open longer and even more requests pile in:
$10{,}000 \times 0.1 = 1{,}000$. The overload lengthens the window, which increases the overload. That
feedback loop is why it's called a **stampede**, and it can take down a database that was comfortably
handling its normal load one second earlier.

This is the ponder's point: the average hit rate can be 99%, and yet a *single* expiry at the wrong
moment produces a burst the average never showed.`,
    },
    {
      type: 'text',
      md: md`
**Three fixes, often combined:**

**Request coalescing (single-flight).** Let only *one* request refill a given key; the others wait for
its result instead of querying themselves. 200 database queries become 1.

~~~python
import threading

inflight = {}               # key -> Event the waiters block on
inflight_lock = threading.Lock()

def get_coalesced(key, load_from_db):
    value = cache.get(key)
    if value is not None:
        return value
    with inflight_lock:
        event = inflight.get(key)
        leader = event is None
        if leader:
            event = inflight[key] = threading.Event()
    if leader:
        try:
            value = load_from_db(key)      # only ONE request per key does this
            cache.set(key, value, ex=300)
            return value
        finally:                           # runs even if the load raises, so waiters are never stuck
            with inflight_lock:
                del inflight[key]
            event.set()                    # wake the waiters
    event.wait(timeout=1.0)                # everyone else waits for the leader
    return cache.get(key)                  # None if the leader failed or was slow: caller falls back
~~~

(This coalesces within one server. Across 40 servers you'd still get up to 40 queries — fine — or use a
short-lived lock key in the shared cache to get it down to one.)

**Jittered TTLs.** If you cache 10,000 products at startup, all with TTL = 300 s, they all expire at the
same moment 300 s later — a synchronized mass miss. Add randomness:
\`ttl = 300 + random.randint(0, 60)\`. Expiries spread over a minute instead of landing in one instant.

**Early refresh.** Refresh a hot key *before* it expires — e.g. when a read finds the entry within its
last 10% of lifetime, one background task reloads it while everyone keeps getting the (still valid) old
value. The key never actually goes missing, so there's no window at all.

### 2. The cold cache

A cache that has just started — after a restart, a deploy, or a new server — is empty. $h = 0$.
`,
    },
    {
      type: 'ponder',
      question: md`The shared cache server restarts at peak: 50,000 QPS, a database sized for the 5,000 QPS
it sees at $h = 0.9$. Predict what happens in the first few seconds, step by step. Then: how would you
design so that this event is a blip rather than an outage?`,
      answer: md`**What happens.** The cache comes back empty, so $h$ drops from 0.9 to 0. The database load
jumps from $0.1 \times 50{,}000 = 5{,}000$ to $1.0 \times 50{,}000 = 50{,}000$ QPS — **10× its normal
load**. It can't keep up: queries queue, latency goes from 20 ms to seconds, requests time out, and users
(and their apps) retry — adding even more load. Worse, the cache can't warm up, because warming it
requires successful database reads, and the database is too overloaded to return them. The system can
stay stuck down long after the cache itself is healthy again.

**Design so it's a blip:**

1. **Don't have one cache server.** Replicate it, or spread keys across many cache nodes, so one restart
   loses a fraction of the hot set, not all of it.
2. **Warm before serving.** Preload the known hot keys (yesterday's top products) before putting a new
   cache into rotation, or keep a persistent snapshot to reload from.
3. **Ramp traffic gradually.** Send a new cache node 5% of traffic, then 20%, then all — letting its hit
   rate climb while the database copes.
4. **Protect the database.** Cap the number of concurrent queries it accepts (a connection pool limit),
   and coalesce misses so each hot key is loaded once. Rejecting some requests quickly is far better than
   accepting all of them and completing none.
5. **Size the database for some miss surge.** If you've literally designed it for 5,000 QPS with zero
   headroom, any drop in $h$ becomes an outage.

The deep principle: **once a cache exists, the database behind it is sized for the cache's hit rate.**
The cache has stopped being an optimisation; it has become load-bearing. Design it like one.`,
    },
    {
      type: 'text',
      md: md`
### 3. Cache penetration: misses for things that don't exist

Cache-aside caches what the database *returns*. So what happens when someone requests
\`product:99999999\`, which doesn't exist? Miss → database → "no such row" → nothing to cache → next
request misses again. Every single request goes to the database.

Usually harmless. But a buggy client looping on a deleted product ID, or an attacker requesting random
IDs at 20,000 per second, gets a **0% hit rate on purpose** and walks straight past your cache.

**Fixes:**

- **Cache the absence.** Store a "not found" marker (\`product:99999999 → NULL\`) with a short TTL like
  60 s. Repeats now hit.
- **A Bloom filter in front** — a compact data structure that can answer "this key *definitely does not*
  exist" using about 10 bits per key (for a ~1% false-positive rate). Keys it rules out never reach the cache or the database. (Random IDs
  from an attacker are almost all ruled out.)
- **Validate input** — reject IDs outside the valid range before looking anything up.

## Sizing a cache: the 80/20 rule

How much memory does the cache need? Not "all the data" — that's the database's job. Just enough to hold
the hot working set.

Real access patterns are heavily skewed. A common rule of thumb (the **80/20 rule**, or Pareto
principle): **about 20% of the items receive about 80% of the requests.** Often it's more extreme — like
the puzzle's 1% getting 90%.

**Worked sizing.** 10 million products, each cached as about 2 KB of JSON.

- Everything: $10^7 \times 2$ KB $= 20$ GB. Possible, but mostly wasted on products nobody views.
- The puzzle's hot 1%: $10^5 \times 2$ KB $= 200$ MB → roughly $h \approx 0.9$.
- The 80/20 hot 20%: $2 \times 10^6 \times 2$ KB $= 4$ GB → roughly $h \approx 0.8$ by the rule of thumb
  — but in this skewed workload, higher, since the top 1% alone gives 0.9.

Then add overhead: a cache stores keys, pointers, and bookkeeping for every entry, so budget roughly
**1.5–2×** the raw data size. The 200 MB hot set needs perhaps 300–400 MB of cache memory — tiny next to
what it saves.

The shape to remember: the first few hundred megabytes buy most of the hit rate; each additional
gigabyte buys less. You stop adding memory when the next gigabyte no longer changes the database load
enough to matter.

## A modern example: caching for LLMs

Everything above applies directly to AI systems, where the "slow store" is a large model and a miss is
expensive in both time and money.

- **Response caching.** If many users ask the exact same question ("what are your return policies?"),
  store the model's answer keyed by the question and serve repeats from the cache. It works only for
  exact or near-exact repeats, and it carries the invalidation problem in a new form: when the policy
  document changes, cached answers are stale. A **semantic cache** looks up by meaning (similar
  questions) rather than exact text — higher hit rate, but a risk of returning an answer to a question
  that was only *almost* the same.
- **Prompt caching.** Many requests share a long identical *prefix* — the same system instructions, the
  same 50-page document, with only a short question at the end. Processing that prefix is the bulk of
  the work. Providers can cache the model's internal computation for the prefix, so later requests
  sharing it skip most of the work: faster time to the first word, and cached input billed at a fraction
  of the normal price. The design lesson is the same as versioned keys: **put the stable content first
  and the changing content last**, because any change early in the prompt makes everything after it a
  miss.

Same two formulas, new rung of the ladder.
`,
    },
    {
      type: 'example',
      title: 'the complete design — caching the product page',
      md: md`
Back to the puzzle, now designed properly with the six-step method from SD.1.

**Requirements.** Product pages must be fast (p99 under 50 ms). Prices must be correct within
**10 seconds** of a change. Stock counts can lag by a minute. Survive a cache node restart without an
outage.

**Estimate.**

- 50,000 QPS at peak; 90% on the hot 1% (100,000 products).
- Hot set: $10^5 \times 2$ KB $= 200$ MB, ×2 overhead → **400 MB**. We give the cache 4 GB anyway so it
  holds the hot 20% too, pushing $h$ to about **0.97**.
- Database load at $h = 0.97$: $0.03 \times 50{,}000 = 1{,}500$ QPS.
- Effective latency: $0.97 \times 0.5 + 0.03 \times 20 = 0.485 + 0.6 = 1.085$ ms.

**Design.**

~~~text
 browser ──> CDN (product images, 1-day TTL, versioned file names)
    │
    └──> app servers ──> shared cache (3 nodes, keys spread across them)
                              │  miss (3% ≈ 1,500 QPS)
                              └──> database (sized for ~5,000 QPS: 3× headroom)
~~~

**Decisions, each tied to a number or requirement:**

| decision | because |
|---|---|
| cache-aside for product reads | read-dominated; only hot items take memory |
| write DB, *then* delete key on price change | prices must be fresh; avoids the delete-then-write race |
| TTL 5 min + jitter of 0–60 s on product entries | safety net if an invalidation is missed; jitter prevents mass expiry |
| stock count cached separately with TTL 30 s | "can lag a minute" — short TTL is enough, no invalidation code |
| request coalescing on misses | hot keys at ~10,000 QPS would otherwise stampede |
| cache "not found" for 60 s | stops loops on deleted product IDs from bypassing the cache |
| 3 cache nodes, database with 3× headroom | a node restart loses ~1/3 of keys: $h$ falls to ~0.65, DB load rises to $0.35 \times 50{,}000 = 17{,}500$ QPS for a few seconds — so also cap DB concurrency and warm the replacement node before it takes traffic |
| product images on the CDN with versioned names | images are the bulk of the bytes, never change in place, and can be cached forever |

Notice the last-but-one row: the arithmetic exposed that even with 3 nodes, losing one briefly pushes
the database to 3.5× its planned capacity. That's why the design needs *both* multiple nodes *and*
warm-up plus concurrency limits. Numbers found the weakness before production did.
`,
    },
    {
      type: 'example',
      title: 'a news site on election night — diagnosing a stampede',
      md: md`
**The situation.** A news site caches each article for 60 s. On election night the results article gets
**30,000 reads per second**. Rendering it from the database takes **50 ms**. Every minute, on the dot,
the database spikes to 100% CPU for a few seconds and the site returns errors.

**Diagnosis with numbers.** Every 60 s the key expires. In the 50 ms refill window:
$30{,}000 \times 0.05 = 1{,}500$ identical render requests reach the database. Rendering 1,500 at once
slows each render to perhaps 500 ms, so the window widens to $30{,}000 \times 0.5 = 15{,}000$ requests.
That's the once-a-minute spike — a textbook stampede on a single key.

**Fix, step by step:**

1. **Coalesce.** One render per key per server. With 20 app servers, a refill costs at most 20 renders
   instead of 1,500+.
2. **Early refresh.** When a read sees the entry in its last 6 s (10% of the 60 s TTL), trigger one
   background re-render. Readers keep getting the current copy, so the key never goes missing.
3. **Serve stale on error.** If the re-render fails, keep serving the previous version for a while.
   A 90-second-old election result is far better than an error page.
4. **Put it on the CDN** with a short TTL (say 10 s): the 30,000 reads per second now land mostly on
   edge servers, and your origin sees roughly one request per edge location every 10 s.

**Result.** Database work for this article drops from bursts of thousands of renders to about one per
minute. And the freshness requirement — readers see new results within about a minute — is still met.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The two formulas, derived:** effective latency $L_{eff} = h \cdot t_{cache} + (1-h) \cdot t_{db}$
   (a weighted average) and database load $Q_{db} = (1-h) \times Q$ (only misses get through).
2. **Think in miss rate.** Going from 90% to 99% hits divides database load by 10 — and dropping from 99%
   to 90% multiplies it by 10. Rare misses dominate both latency and load.
3. **Where caches live** — browser, CDN, application memory, shared cache, database buffer pool — each a
   rung on the SD.1 ladder, with the rule "cheapest rung that meets the latency requirement." Hit rates
   stack across layers.
4. **Write strategies:** cache-aside (default for reads), write-through (fresh after writes, slower
   writes), write-back (fast writes, risk of data loss — never for money).
5. **Eviction:** LRU derived from "throw out what you haven't used longest," built with an
   \`OrderedDict\`; LFU for stable popularity; TTL to bound staleness. A cache smaller than its working set
   thrashes.
6. **Invalidation:** TTL, delete-on-write, versioned keys; write the database *then* delete, because
   delete-then-write lets stale data back in; always keep a TTL as a backstop.
7. **Failure modes:** stampede (fix with coalescing, jittered TTLs, early refresh), cold cache (replicate,
   warm, ramp, protect the database), penetration (cache "not found," Bloom filters).
8. **Sizing:** cache the hot working set (80/20 or steeper), add 1.5–2× overhead, stop when the next
   gigabyte stops mattering — and the same ideas power prompt and response caching for LLMs.

Next: SD.6. Some work is too slow to do while the user waits, so we'll hand it to a queue and let
it happen in the background.
`,
    },
  ],
  questions: [
    {
      id: 'sd-l5-q1',
      kind: 'mcq',
      prompt: md`Which caching write strategy can **lose data that the user was told had been saved**?`,
      options: [
        md`Cache-aside, because the cache can hold stale data`,
        md`Write-through, because it writes to two places`,
        md`Write-back, because writes are confirmed while they exist only in the cache, before reaching the database`,
        md`TTL expiry, because entries disappear after their lifetime`,
      ],
      answer: 2,
      explain: md`Write-back acknowledges the write when it lands in cache memory and flushes to the database
later; a crash in between loses it. Option A tempts because stale data *feels* like lost data — but the
truth is still safe in the database; the cache just shows an old copy. Option D tempts for the same
reason: an expired entry is only a *copy* disappearing, and the next read reloads it. Write-through
(B) is the safest of all — the write is confirmed only after both stores have it.`,
    },
    {
      id: 'sd-l5-q2',
      kind: 'numeric',
      prompt: md`A cache hit takes **1 ms** and a database read takes **30 ms**. The hit rate is **95%**.
What is the effective (average) latency in milliseconds?`,
      answer: 2.45,
      tolerance: 0.1,
      explain: md`$L_{eff} = 0.95 \times 1 + 0.05 \times 30 = 0.95 + 1.5 = 2.45$ ms. Notice that the 5% of
misses contribute 1.5 ms — more than the 95% of hits combined. (If you add the cache check to each miss,
$0.05 \times 31 = 1.55$, giving 2.5 ms — also within tolerance.) To make this faster, the lever is the miss
rate, not the cache speed: halving cache latency saves 0.475 ms; halving the miss rate (5% → 2.5%) saves
0.725 ms ($2.45 - (0.975 \times 1 + 0.025 \times 30) = 2.45 - 1.725$).`,
    },
    {
      id: 'sd-l5-q3',
      kind: 'mcq',
      prompt: md`An LRU cache has **capacity 3**. Starting empty, it receives requests for keys in the order
\`A, B, C, A, D\`. Which key is evicted when \`D\` arrives?`,
      options: [md`\`A\``, md`\`B\``, md`\`C\``, md`Nothing — \`D\` is a miss but there is room`],
      answer: 1,
      explain: md`After \`A, B, C\` the order (oldest → newest) is A B C. The second \`A\` is a hit and moves A
to the newest end: B C A. Now \`D\` needs space, and the least recently used is **B**. Option A is the
classic trap — A was *inserted* first, so a **FIFO** (first in, first out) cache would evict it; LRU cares
about the most recent *use*, and A was just used. Option D forgets that the cache already holds three
items.`,
    },
    {
      id: 'sd-l5-q4',
      kind: 'numeric',
      prompt: md`A service handles **100,000 QPS** with a cache hit rate of **99%**, so its database sees
1,000 QPS. After a bad deploy changes the cache key format, the hit rate falls to **95%**. How many QPS
does the database now receive?`,
      answer: 5000,
      tolerance: 100,
      explain: md`$Q_{db} = (1 - 0.95) \times 100{,}000 = 5{,}000$ QPS. The hit rate fell by only 4 percentage
points, but the miss rate went from 1% to 5% — **5× the database load**. If the database was sized with
2× headroom above 1,000 QPS, it is now overloaded. This is why hit rate is one of the most important
metrics to alert on: a small-looking drop is a large jump in load.`,
    },
    {
      id: 'sd-l5-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Without looking back: (a) derive the effective-latency formula for a
cache with hit rate $h$, hit cost $t_{cache}$ and miss cost $t_{db}$, starting from "take 100 requests";
(b) derive the database-load formula; (c) with $t_{cache} = 0.5$ ms and $t_{db} = 20$ ms, find the
**minimum hit rate** needed for an average latency of **1 ms or less**, and the database load at that
hit rate for 50,000 QPS; (d) explain in two sentences why raising $h$ from 0.9 to 0.99 cuts database load
10× but cuts latency by less.`,
      rubric: md`**(a)** Of 100 requests, $100h$ hit at $t_{cache}$ each and $100(1-h)$ miss at $t_{db}$ each.
Total $= 100h \cdot t_{cache} + 100(1-h) \cdot t_{db}$; divide by 100:
$L_{eff} = h \cdot t_{cache} + (1-h) \cdot t_{db}$. (Bonus: noting a miss really costs
$t_{cache} + t_{db}$, and why dropping $t_{cache}$ is fine.)

**(b)** Only misses reach the database, and a fraction $(1-h)$ of the $Q$ requests per second miss, so
$Q_{db} = (1-h) \times Q$.

**(c)** $0.5h + 20(1-h) \le 1$ → $20 - 19.5h \le 1$ → $h \ge 19/19.5 \approx 0.974$. So about **97.4%**.
Database load: $(1 - 0.974) \times 50{,}000 \approx 1{,}300$ QPS (1,282 with the exact fraction).

**(d)** Database load depends only on the miss rate, which falls from 0.1 to 0.01 — ten times smaller.
Latency also contains the hits' cost, $h \cdot t_{cache}$, which doesn't shrink (it grows slightly), so
once misses are rare the cache's own latency sets a floor: 2.45 ms → 0.695 ms, about 3.5×.

Full credit requires the derivations as reasoning (not the formulas stated from memory), the inequality
solved correctly, and the "miss rate vs hit-cost floor" explanation in (d).`,
    },
    {
      id: 'sd-l5-q6',
      kind: 'mcq',
      prompt: md`Monitoring shows thousands of requests per second for product IDs that **don't exist**, every
one reaching the database even though you use cache-aside. What's the most direct fix?`,
      options: [
        md`Increase the cache's memory so more keys fit`,
        md`Switch the eviction policy from LRU to LFU`,
        md`Cache the "not found" result with a short TTL, and/or put a Bloom filter in front to reject keys that definitely don't exist`,
        md`Lengthen the TTL on all existing entries`,
      ],
      answer: 2,
      explain: md`This is **cache penetration**: cache-aside only caches what the database returns, and a
missing row returns nothing, so every repeat misses. Caching the absence makes repeats hit; a Bloom filter
stops never-existing keys before any lookup. Option A tempts because "more misses → bigger cache" is
usually right — but no amount of memory helps when there's nothing being stored. Options B and D change
how *existing* entries are kept, and these keys never become entries at all.`,
    },
    {
      id: 'sd-l5-q7',
      kind: 'numeric',
      prompt: md`**Fermi.** A marketplace has **20 million** product listings. A cached listing is about
**5 KB**. Using the 80/20 rule, you decide to cache the hottest **20%** of listings. Roughly how many
**gigabytes** of raw data is that, before any overhead? (1 GB = 10⁶ KB.)`,
      answer: 20,
      tolerance: 3,
      explain: md`$20\%$ of $2 \times 10^7$ is $4 \times 10^6$ listings; $4 \times 10^6 \times 5$ KB
$= 2 \times 10^7$ KB $= 20$ GB. With 1.5–2× per-entry overhead, plan for 30–40 GB — comfortably held by a
small cluster of cache nodes, versus 100 GB (raw) to hold every listing. And if access is more skewed than
80/20, the hottest 1% (1 GB) might already give most of the hit rate.`,
    },
    {
      id: 'sd-l5-q8',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "Why do websites sometimes show me an old price
even after it changed?" Explain, with an analogy you invent (a school library, a fridge, a notebook of
phone numbers): what a cache is and why websites use one, why it makes things faster, why it can show
old information, and one way to fix it. No jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **What a cache is and why** — a strong analogy: the school office keeps the lunch menu in a big binder
   in the back room (slow to fetch). So many kids ask "what's for lunch?" that the secretary writes today's
   menu on a sticky note on the desk. Most questions get answered from the sticky note instantly.
2. **Why it's faster** — the sticky note is right there; the binder is a walk away. And the secretary
   isn't worn out walking to the back room hundreds of times a day.
3. **Why it can be old** — if the cook changes the menu in the binder, the sticky note still says the old
   thing until someone updates it. The website's "sticky note" showed the old price.
4. **A fix** — throw the sticky note away whenever the binder changes (delete on write), or write a new
   one every hour no matter what (expiry / TTL), and explain the tradeoff simply (more often = more
   walking, but fresher).
5. **Jargon audit:** "cache," "hit rate," "TTL," "invalidation," "latency," "database," "server" used without
   a kid-level translation = partial credit at best. The word "cache" is fine *once it has been explained*.`,
    },
    {
      id: 'sd-l5-q9',
      kind: 'mcq',
      prompt: md`To update a price, a service runs **delete the cache key, then update the database**. Now and
then the cache ends up holding the old price for the whole TTL. Why?`,
      options: [
        md`The cache server ignored the delete because the key was being read at that moment`,
        md`A reader missed right after the delete, read the old price from the database before the update landed, and put it back in the cache`,
        md`The database update is slower than the delete, so the delete is lost`,
        md`LRU evicted the new value and kept the old one`,
      ],
      answer: 1,
      explain: md`Between the delete and the database write there is a window; any reader in that window
misses, fetches the *old* row, and re-caches it — and nobody deletes it again. Fix: update the database
first, then delete (plus a TTL backstop, or versioned keys). Option A tempts because it sounds like a
concurrency bug, but caches do process deletes correctly — the problem is the *order* in the application.
Option D confuses eviction with staleness: the cache never held the new value at all.`,
    },
    {
      id: 'sd-l5-q10',
      kind: 'numeric',
      prompt: md`A hot key receives **8,000 requests per second**. Its TTL expires, and reloading it from the
database takes **50 ms**. With plain cache-aside and **no request coalescing**, roughly how many requests
go to the database for this key during that reload window?`,
      answer: 400,
      tolerance: 20,
      explain: md`$8{,}000 \times 0.05 = 400$ identical queries — where one would do. And that's the optimistic
count: 400 simultaneous queries slow the database, which widens the window and lets in more (at 200 ms,
it would be 1,600). Coalescing turns 400 into 1 (per server); early refresh makes the window disappear
entirely; jittered TTLs stop many hot keys expiring in the same instant.`,
    },
    {
      id: 'sd-l5-q11',
      kind: 'written',
      prompt: md`**Design exercise.** Design the caching for a **social media profile page**: 200 million
profiles, each about 1 KB (name, bio, photo URL, follower count); **200,000 reads/s** at peak, **2,000
profile edits/s**; celebrities' profiles get enormous traffic; users expect to see their *own* edit
immediately; follower counts can lag by a minute. Your database comfortably handles **20,000 QPS**. On
paper: (1) the hit rate required and the resulting DB load; (2) the cache size, with your assumption about
the hot set; (3) your read and write strategy with invalidation; (4) how you handle celebrities' keys;
(5) what happens if one cache node dies, with numbers.`,
      rubric: md`**(1) Hit rate.** Need $(1-h) \times 200{,}000 \le 20{,}000$ → $h \ge 0.9$. But leave headroom
(and edits also hit the DB — 2,000/s): target $h \approx 0.98$–$0.99$ → DB reads 2,000–4,000 QPS,
plus 2,000 writes, well under 20,000.

**(2) Size.** Total data: $2 \times 10^8 \times 1$ KB $= 200$ GB. Assume a hot 20% (80/20): 40 GB raw, ×1.5–2
→ 60–80 GB across several cache nodes. (Any stated, reasonable assumption with correct arithmetic earns
credit.)

**(3) Strategies.** Cache-aside for reads; on edit, write the DB **then** delete the key (not
delete-then-write — explain the race). TTL (e.g. 10 min + jitter) as a backstop. Read-your-own-writes:
the editing user reads their own profile from the database (or a freshly written copy) for a short time
after an edit. Follower counts: separate key with a short TTL (~60 s) — no invalidation needed, since
lag is allowed; could use write-back-style batched counters.

**(4) Celebrity keys.** A hot key at tens of thousands of reads/s: request coalescing on miss, early
refresh so it never expires, possibly an application-memory copy on each server (a few seconds' TTL) so
reads don't even reach the shared cache; jittered TTLs.

**(5) Node failure.** With, say, 4 nodes, losing one drops $h$ from ~0.99 to ~0.74 for its keys' share:
DB reads jump to about $0.26 \times 200{,}000 = 52{,}000$ QPS — more than double capacity. So: replicas per
node, warm the replacement, limit DB concurrency, coalesce misses. Credit for any correct calculation that
shows the surge and a matching mitigation.

Full credit requires numbers in (1), (2), and (5); the correct write-then-delete order; and a specific
treatment for hot keys.`,
    },
    {
      id: 'sd-l5-q12',
      kind: 'written',
      prompt: md`**Pick the strategy.** For each of these three kinds of data, choose cache-aside, write-through,
or write-back, choose an invalidation approach (TTL length, delete-on-write, and/or versioned keys), and
justify each choice in one or two sentences: (a) the view counter on videos; (b) a user's shopping cart;
(c) a website's compiled JavaScript file served to browsers and a CDN.`,
      rubric: md`**(a) View counter → write-back.** Writes are extremely frequent (every view), and losing a few
seconds of increments on a crash is harmless — the count is approximate anyway. Batch-flush to the
database every few seconds, turning thousands of writes into one. Invalidation: none needed in the usual
sense; readers see the cache's running count. Must mention the data-loss risk and why it's acceptable
*here*.

**(b) Shopping cart → write-through** (or cache-aside with delete-on-write). The user reads their cart
immediately after changing it and must see the change; losing a cart item is harmful, so **not**
write-back. A long TTL (hours/days) is fine because writes keep it fresh; the TTL just cleans up abandoned
carts.

**(c) JavaScript file → versioned keys with a very long TTL.** Name each build by its content
(\`app.3f9a2c.js\`); cache it "forever" in browsers and the CDN. A new build gets a new name, so there's
nothing to invalidate — the page simply references the new file. Must explain why delete-on-write would
fail here (you can't delete copies sitting in millions of browsers).

Full credit = a defensible strategy for each with the *reason* tied to that data's read/write pattern
and tolerance for staleness or loss. Choosing write-back for the cart without flagging the loss risk is a
significant error.`,
    },
  ],
}
