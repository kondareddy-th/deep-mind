// System Design Foundations, Lesson 2 — back-of-envelope estimation
//
// Content uses the `md` tag from ../md.js: like String.raw, plus \` becomes a backtick.
// Code/diagram blocks use ~~~ fences. NEVER write the dollar-brace sequence in content.

import { md } from '../md.js'

export default {
  id: 'sd-l2',
  title: 'SD.2 Back-of-envelope estimation — sizing a system in two minutes',
  subtitle:
    'Two engineers argue for an hour about whether a feature is huge or tiny. Ten minutes of arithmetic would have ended it. This lesson turns estimation into a six-step procedure you can run on paper, then runs it on a timeline, a video site, and a chat service.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Your team is adding **emoji reactions** to posts — tap a heart, a laugh, a fire. In the design meeting,
two engineers disagree.

> **Priya:** "This will be huge. Every user reacts to things all day. It needs its own database cluster."
> **Sam:** "It's a tiny row — a user id, a post id, an emoji. Stick it in the existing database."

They argue for an hour. Both are experienced; both sound convincing. Neither writes down a single
number.

Here is what's strange: the question *"is this huge or tiny?"* has an answer, and it takes about ten
minutes of multiplication to find it. The app has 50 million daily users. You could guess how many
reactions each makes, how big a reaction is, how often reaction counts are displayed — and the argument
would dissolve into arithmetic. Almost nobody does this. By the end of this lesson you will, and we'll
come back and settle Priya and Sam's argument with numbers.

(Spoiler, so you know where we're heading: **they're both partly right**, and the arithmetic tells you
*which part* of the feature is huge and which part is tiny. That's a better answer than either of them
had.)

In SD.1 you met estimation as step 2 of the six-step method, and one trick: *one day ≈ 100,000
seconds*. This lesson turns that trick into a complete, repeatable procedure.

## Why "rough" is the right precision

A first worry: *"How can a guess be useful? I don't know how many reactions a user makes."*

The answer is that design decisions don't change smoothly with the numbers — they change in **steps**.
One database handles a few thousand writes per second. Whether you need 800 or 1,600 writes per
second, the answer is "one database." Whether you need 800 or 80,000, the answer changes completely.

So you're not trying to be *right*. You're trying to land in the right **order of magnitude** — the
right power of ten. A guess that's within a factor of 2 or 3 almost never changes the design; a guess
that's off by 10× or 100× does. That's why every technique below is about getting the power of ten
right, fast.

## The procedure — six quantities, always in this order

~~~text
 users ──► actions/user/day ──► requests/day ──► average QPS ──► PEAK QPS
                                                                    │
            read/write ratio ◄──────────────────────────────────────┘
                   │
      ┌────────────┼──────────────┬────────────────┐
      ▼            ▼              ▼                ▼
   storage     bandwidth     cache memory      servers
~~~

Two terms first:

- **QPS** means *queries per second* — really "requests per second," of any kind. It's the unit almost
  every capacity number in system design is quoted in.
- **Payload** means the bytes carried by one request or response.

Now the six steps.

### Step 1 — Traffic: from users to peak QPS

Start from people, because people are what you can reason about.

$$\text{requests/day} = \text{daily active users} \times \text{actions per user per day}$$

Then use the SD.1 shortcut:

$$\text{average QPS} \approx \frac{\text{requests/day}}{10^5}$$

Then — and this is the step beginners forget — convert average to **peak**:

$$\text{peak QPS} \approx \text{average QPS} \times (2 \text{ to } 5)$$

**Why does traffic peak?** Because people aren't spread evenly across the clock. They sleep, they
commute, they use apps in the evening. A service whose users live mostly in one region sees a strong
evening peak and a dead night. A global service is smoother (someone is always awake), so its
peak-to-average ratio is lower — around 2×. Regional services, or ones driven by events (a sports
final, New Year's midnight, a flash sale), can hit 5× or much more. When in doubt, say *"peak ≈ 3×
average"* out loud and move on.

Worked instantly: 20 million daily users × 10 requests each = $2 \times 10^8$ requests/day →
$2 \times 10^8 \div 10^5 = 2{,}000$ QPS average → **~6,000 QPS peak**.
`,
    },
    {
      type: 'ponder',
      question: md`You sized a service for its **average** load of 2,000 QPS — each server is exactly
busy enough to handle it. Then the evening peak arrives at **3× average**, 6,000 QPS, and lasts one
minute. Predict, before revealing: what happens to a request that arrives at the *end* of that minute?
Does the system run "3× slower," or something worse?`,
      answer: md`Something much worse. Walk through it second by second.

- Requests arrive at 6,000/s. The system can finish only 2,000/s.
- So every second, **4,000 requests** that can't be served join a queue (a waiting line).
- After 60 seconds, the queue holds $60 \times 4{,}000 = 240{,}000$ requests.
- A request arriving now waits behind all of them: $240{,}000 \div 2{,}000 = 120$ **seconds** before it
  even starts.

Normal latency might be 50 ms. Now it's two minutes — not 3× slower, **thousands of times slower**.
Users (and client code) time out long before that and **retry**, which *adds* more requests to a
system that's already drowning. Memory fills with queued work, servers crash, and the crash moves the
load to the survivors. This is how "a bit over capacity" becomes a full outage.

The lesson: capacity isn't a dial where 3× the load means 3× the slowness. **Below capacity, things
are fine; above it, the backlog grows every second and latency explodes.** That cliff is why you size
for the peak — and then leave headroom on top, because even *near* capacity queues start to form
(SD.7 on reliability comes back to this).`,
    },
    {
      type: 'text',
      md: md`
### Step 2 — Read/write ratio

Split the traffic into **reads** (fetching data) and **writes** (creating or changing it). Most
consumer products are heavily read-dominated: a tweet is written once and read hundreds of times.

This ratio matters because reads and writes scale differently. Reads can be served from **copies** —
caches, read replicas (extra copies of a database that only answer reads), CDNs. Writes have to reach
the real, durable copy. So a 100:1 read-heavy system and a 1:1 write-heavy system (like a logging
service) end up with very different designs even at the same total QPS.

### Step 3 — Storage

$$\text{storage} = \text{size per item} \times \text{items per day} \times \text{retention (days)} \times \text{replication factor}$$

- **Size per item:** add up the fields. An id is 8 bytes, a timestamp 8 bytes, a short text a few
  hundred bytes. Photos are ~hundreds of KB to a few MB; a minute of video is tens of MB.
- **Retention:** how long you keep it. "Forever" → estimate per year, and say so.
- **Replication factor:** real systems keep **copies** of every piece of data on different machines, so
  a disk failure doesn't lose anything. The usual number is **3**. Beginners almost always forget this
  ×3 — and it's a factor of 3 on your hardware bill.

### Step 4 — Bandwidth

$$\text{bandwidth} = \text{QPS} \times \text{payload size}$$

One trap lives here. Networks are measured in **bits** per second (Gbps = gigabits per second), but
storage and payloads are measured in **bytes**. One byte is 8 bits. A "10 Gbps" network card moves
$10 \div 8 = 1.25$ **gigabytes** per second — not 10. Always convert before comparing.

### Step 5 — Cache memory: the 80/20 rule

A **cache** is a fast copy of data kept in memory (RAM) so most requests never reach the slower
database. The question is: how much RAM does it need?

Here's the empirical fact that makes caching work: **access is skewed**. A few items are wildly
popular; most are rarely touched. A common rule of thumb — the **80/20 rule** — says roughly **20% of
items receive 80% of the requests**. (It's a rough pattern observed everywhere from web pages to
products, not a law. Real skew is often even steeper.)

So you don't cache everything. You cache the hot 20%:

$$\text{cache size} \approx 0.2 \times \text{number of items} \times \text{size per item}$$

and in return, about 80% of reads are served from memory.

### Step 6 — Number of servers

$$\text{servers} = \frac{\text{peak QPS}}{\text{QPS one server can handle}} \div \text{target utilisation} \;+\; \text{spares}$$

- **Target utilisation:** you don't run servers at 100% busy — the ponder above showed what happens at
  the edge. Plan for ~50–70% busy at peak.
- **Spares:** if one machine (or a whole datacenter zone) dies, the rest must carry its load. Add at
  least one extra, often more.

Example: 60,000 peak QPS, 5,000 per server → $60{,}000 \div 5{,}000 = 12$ servers flat-out. At 70%
utilisation: $12 \div 0.7 \approx 17.1$ → 18. Plus spares for a failure → **~20 servers**.
`,
    },
    {
      type: 'text',
      md: md`
## Reference tables — the numbers to have on hand

### Powers of two vs powers of ten

Computers count in powers of 2; estimation is easiest in powers of 10. Luckily
$2^{10} = 1{,}024 \approx 10^3$, so the two line up almost perfectly:

| power of 2 | exact | ≈ power of 10 | name |
|---|---|---|---|
| $2^{10}$ | 1,024 | $10^3$ (thousand) | 1 KB |
| $2^{20}$ | 1,048,576 | $10^6$ (million) | 1 MB |
| $2^{30}$ | ~1.07 billion | $10^9$ (billion) | 1 GB |
| $2^{40}$ | ~1.1 trillion | $10^{12}$ (trillion) | 1 TB |
| $2^{50}$ | ~1.13 quadrillion | $10^{15}$ | 1 PB |

The error is under 13% even at a petabyte — irrelevant for estimation. So: *thousand → KB, million →
MB, billion → GB, trillion → TB*. A billion 1-KB items is a TB ($10^9 \times 10^3 = 10^{12}$).

### Time

| quantity | value |
|---|---|
| seconds in a day | 86,400 ≈ $10^5$ |
| seconds in a month | ~2.6 million ≈ $2.5 \times 10^6$ |
| seconds in a year | ~31.5 million ≈ $3 \times 10^7$ |
| 1 QPS sustained for a day | ~$10^5$ requests |

### The latency ladder (recap from SD.1)

| operation | rough time |
|---|---|
| read from memory (RAM) | ~100 ns |
| read from SSD | ~100 µs |
| round trip inside a datacenter | ~0.5 ms |
| round trip across continents | ~100–150 ms |

### Typical per-machine capacities (rough — flag them as assumptions!)

These vary 10× with hardware, software, and how much work each request does. Treat them as starting
points, and say *"assuming ~X per server"* out loud.

| resource | rough capacity |
|---|---|
| app server, simple requests | ~1,000–10,000 QPS |
| relational database, simple queries | ~1,000–10,000 QPS (writes toward the low end) |
| in-memory cache node (Redis/Memcached) | ~100,000+ operations/s |
| RAM in one server | ~64–512 GB (bigger exists) |
| disk in one server | ~a few to tens of TB |
| network card | ~10 Gbps ≈ 1.25 GB/s |
| open persistent connections per server | ~100,000 (more with tuning) |

## Three techniques that keep you honest

**1. Round aggressively to powers of ten.** 86,400 → $10^5$. 365 → a few hundred (or keep 365 when
it's the last step). 3.7 million → $4 \times 10^6$. Then multiply by adding exponents:
$4 \times 10^6 \times 5 \times 10^2 = 20 \times 10^8 = 2 \times 10^9$.

**2. Keep units visible at every step.** Write "items/day × bytes/item = bytes/day," not just
numbers. Almost every estimation disaster is a unit error — dividing by seconds-per-hour instead of
seconds-per-day, or mixing bits and bytes. Units written out make the error visible.

**3. Sanity-check against something you know.** Your answer says a chat app needs 5 PB of RAM? A
large server has ~0.5 TB, so that's 10,000 servers of RAM — for connections? Something is wrong.
Compare against things you know: a phone has ~100 GB of storage; a laptop's network is ~1 Gbps; a
famous company's whole storage is exabytes. If your number would make your feature bigger than
YouTube, recheck it.
`,
    },
    {
      type: 'example',
      title: 'a Twitter-like timeline — reads per second and storage per year',
      md: md`
**Assumptions** (stated out loud, as SD.1 taught):

- 200 million daily active users.
- Each user loads their timeline 10 times a day; each load shows 20 tweets.
- Each user posts 0.5 tweets a day on average (most post nothing; a few post a lot).
- A tweet's text + metadata (ids, timestamp, counters) ≈ **500 bytes**. 10% of tweets carry an image
  of ~**500 KB**, stored separately.
- Peak ≈ 3× average. Keep tweets forever; replication ×3.

**Step 1 — traffic.**

| quantity | arithmetic | result |
|---|---|---|
| timeline loads/day | $2 \times 10^8 \times 10$ | $2 \times 10^9$ |
| timeline loads/s (avg) | $2 \times 10^9 \div 10^5$ | **20,000** |
| timeline loads/s (peak) | $20{,}000 \times 3$ | **60,000** |
| tweets fetched/s (peak) | $60{,}000 \times 20$ | 1.2 million |
| new tweets/day | $2 \times 10^8 \times 0.5$ | $10^8$ |
| new tweets/s (avg → peak) | $10^8 \div 10^5 = 1{,}000$, ×3 | **3,000 peak** |

**Step 2 — ratio.** 20,000 timeline loads vs 1,000 tweets per second: **20:1** in requests, and
**400:1** in tweets read vs written. Overwhelmingly read-heavy.

**Step 3 — storage.**

- Text: $10^8$ tweets/day × 500 B = $5 \times 10^{10}$ B = **50 GB/day**.
- Per year: $50 \times 365 \approx 18{,}000$ GB = **~18 TB/year**; ×3 replication → **~55 TB/year**.
- Images: $10^7$ images/day × 500 KB = $5 \times 10^{12}$ B = **5 TB/day** → ~1.8 PB/year before
  replication.

Look at that: images are **100× larger than all the text combined**. The text lives comfortably in a
database spread over a handful of machines; the images must go to object storage with a CDN in front.

**Step 4 — bandwidth (text only).** Peak 60,000 loads/s × 20 tweets × 500 B = $60{,}000 \times 10$ KB
= 600 MB/s ≈ **4.8 Gbps**. Several machines' worth of network, fine.

**Step 5 — cache.** 60,000 timeline loads/s can't each run a database query that merges tweets from
hundreds of followed accounts. So precompute each user's timeline and keep it in memory: store the
latest 200 tweet ids per user, 8 bytes each.

$$2 \times 10^8 \text{ users} \times 200 \times 8 \text{ B} = 3.2 \times 10^{11} \text{ B} = 320 \text{ GB}$$

That's a few cache machines (say three at ~128 GB each, doubled for spares) — not a data center.

**What the numbers decided:** a read-optimised design (precomputed timelines in cache), text in a
sharded database, images in object storage + CDN. Every one of those came from a line above.
`,
    },
    {
      type: 'ponder',
      question: md`An online store has a product catalogue of **50 million items**, each about **2 KB**
of data. Reads follow the 80/20 rule. **Predict before revealing:** how much RAM would a cache need to
serve about 80% of product reads — and does that cache need to be spread across many machines?`,
      answer: md`**Total dataset:** $5 \times 10^7 \times 2$ KB $= 10^8$ KB $= 10^{11}$ B = **100 GB**.

**Hot 20%:** $0.2 \times 100$ GB = **20 GB**. Allow ~1.5× for the cache's own overhead (keys,
bookkeeping, memory fragmentation) → ~30 GB.

That fits in **one** server's RAM with room to spare. No cache cluster, no sharding — one cache node
(plus a replica so its failure doesn't dump all traffic on the database). Many people predict "a big
distributed cache" because "50 million" sounds huge. The arithmetic says otherwise.

**A trap worth knowing.** Some guides compute cache size as "20% of *daily read volume* × item size."
If this store serves $10^9$ reads a day, that gives $0.2 \times 10^9 \times 2$ KB = **400 GB** — 20×
more. It overcounts, because the same popular item is read millions of times but only needs to be
cached *once*. Base the estimate on **distinct items**, not requests — the second method is only a
loose upper bound.`,
    },
    {
      type: 'example',
      title: 'a YouTube-like video service — storage per day and bandwidth to serve views',
      md: md`
**Assumptions:**

- 500,000 videos uploaded per day, average length 10 minutes.
- Each video is converted ("transcoded") into several resolutions — 240p for weak phones up to 1080p
  for TVs. All versions together take ≈ **50 MB per minute** of video.
- 100 million views per day; an average view watches **5 minutes** at an average of **2 Mbps**
  (megabits per second — a mix of phones and TVs).
- Peak ≈ 3× average. Replication ×3.

**Storage per day.**

$$5 \times 10^5 \text{ videos} \times 10 \text{ min} = 5 \times 10^6 \text{ minutes/day}$$
$$5 \times 10^6 \text{ min} \times 50 \text{ MB} = 2.5 \times 10^8 \text{ MB} = 250 \text{ TB/day}$$

With ×3 replication: **~750 TB per day**. Per year: $250 \times 365 \approx 91$ PB raw, ~270 PB
replicated. (Huge stores often use *erasure coding* — a cleverer redundancy scheme costing ~1.5×
instead of 3× — which is worth ~100 PB a year here. At this scale, a factor of 2 in storage efficiency
*is* a design decision.)

**Bandwidth to serve views** — two independent ways, as a cross-check.

*Method A — QPS × payload:*

- View starts per second: $10^8 \div 10^5 = 1{,}000$ **per second**.
- Bytes per view: $300 \text{ s} \times 2 \text{ Mbps} = 600$ megabits $= 75$ MB.
- Bandwidth: $1{,}000 \times 75$ MB/s = 75 GB/s = **600 Gbps** average.

*Method B — how many people are watching at once:* a useful rule is
**concurrent = rate × duration**. 1,000 new views/s, each lasting 300 s → **300,000 people watching at
any moment**. Each pulls 2 Mbps → $300{,}000 \times 2$ Mbps = **600 Gbps**. Same answer, different
route — that agreement is what a sanity check looks like.

At peak (×3): **~1.8 Tbps**. A server's network card is ~10 Gbps; at ~70% use, ~7 Gbps. So
$1{,}800 \div 7 \approx 260$ servers doing nothing but pushing video bytes — and viewers are spread
across the world, where cross-continent round trips of 100+ ms would make video stutter.

**What the numbers decided:** a **CDN** (a worldwide network of caching servers close to viewers) is
not optional; it's the only way to move terabits per second. Uploaded video goes to **object storage**
built for petabytes. Notice the asymmetry: uploads are only ~5 per second — trivial — while serving is
enormous. The hard part of a video site is **egress** (bytes going out), not ingest.
`,
    },
    {
      type: 'example',
      title: 'a chat service — concurrent connections and messages per second',
      md: md`
**Assumptions:**

- 100 million daily active users, each sending 40 messages a day (mostly one-to-one).
- A message ≈ **100 bytes** (text + sender, recipient, timestamp, id).
- To receive messages instantly, each open app keeps a **persistent connection** — a network link held
  open so the server can push messages without the phone asking. The average user has the app open
  ~2.4 hours a day.
- Peak ≈ 2× average for connections, 3× for messages. Keep messages 1 year; replication ×3.

**Concurrent connections** — use concurrent = rate × duration, or equivalently: each user is connected
$2.4 \div 24 = 10\%$ of the day, so on average
$$10^8 \times 0.1 = 10^7 \text{ connections open at once.}$$
Peak ×2 → **20 million**. At ~100,000 connections per server:
$2 \times 10^7 \div 10^5 = 200$ servers flat-out; at 70% → $200 \div 0.7 \approx 286$ → **~300
connection servers**.

**Messages per second.**
$$10^8 \times 40 = 4 \times 10^9 \text{ messages/day} \;\div\; 10^5 = 40{,}000/\text{s average}$$
Peak ×3 → **120,000 messages/s**. Every message is also *delivered*, so roughly the same number of
pushes go out.

**Bandwidth.** $120{,}000 \times 100$ B × 2 (in and out) = 24 MB/s ≈ 0.2 Gbps. **Tiny.**

**Storage.** $4 \times 10^9 \times 100$ B $= 4 \times 10^{11}$ B = 400 GB/day → × 365 ≈ 146 TB/year →
×3 ≈ **~440 TB/year**.

**What the numbers decided:** chat is not a bytes problem — 0.2 Gbps is nothing. It's a
**connections** problem (20 million held open → a dedicated fleet of ~300 connection servers) and a
**write-rate** problem (120,000 writes/s is 10× more than a single database's comfortable range →
messages partitioned across many machines, likely by conversation id). The estimate told you exactly
where the difficulty lives — and where it doesn't.
`,
    },
    {
      type: 'text',
      md: md`
## How estimates change the design

The point of estimating is not the number; it's the **decision** the number triggers. Here are the
thresholds you'll use over and over (all rough — they move with hardware):

| if the estimate says… | then… |
|---|---|
| whole dataset < ~100s of GB | fits in one machine's RAM or disk → **no sharding needed** |
| writes < ~a few thousand/s | a single primary database is fine |
| reads ≫ one DB's capacity, and skewed | add a **cache** (80/20 makes it small) |
| reads ≫ one DB, not cacheable | **read replicas** |
| storage > one machine (~10+ TB) or writes > ~10,000/s | **shard**: split data across machines |
| large blobs (images, video) | **object storage**, not the database |
| bandwidth > a few servers' NICs, users worldwide | **CDN** |
| connections > ~100,000 | a dedicated **connection-server fleet** |

Read the top row twice. The most valuable result estimation ever produces is often *"this is small —
don't build the complicated thing."* A 30-GB dataset in a sharded cluster is pure cost.
`,
    },
    {
      type: 'ponder',
      question: md`Your estimate for a new service said **2,000 peak QPS and 500 GB of data**. After
launch, reality turns out to be **10× bigger** in both. Which of your design decisions would have to
change, and which would survive? Then the contrast: what if reality had been **2× bigger** instead?`,
      answer: md`**Off by 10× → 20,000 QPS and 5 TB:**

- **Changes:** a single database at 20,000 QPS is past its comfortable range → you need a cache and/or
  read replicas, and if writes are a good share, sharding. 5 TB may still fit one machine's disk but no
  longer fits its RAM, so the "everything in memory" assumption dies. App servers go from a couple to a
  couple of dozen; the load balancer becomes important. These are **architectural** changes — expensive
  to retrofit after launch.
- **Survives:** the API, the data model, what's stored, the product logic. Those depend on *what* the
  system does, not *how much* of it.

**Off by 2× → 4,000 QPS and 1 TB:** almost nothing changes. You add a couple of app servers, buy a
bigger disk, maybe a larger database instance. These are **capacity** changes — a config edit and a
purchase order, not a redesign.

That's the whole philosophy of back-of-envelope estimation: **orders of magnitude decide the
architecture; factors of 2 decide the bill.** So you can be sloppy about constants (86,400 vs
100,000, 365 vs 400) and must be careful about exponents (MB vs GB, per hour vs per day). A useful
habit: after an estimate, ask *"what if I'm 10× off in each direction — does the design change?"* If
yes, that number deserves a second look or a clarifying question.`,
    },
    {
      type: 'example',
      title: 'settling the argument — are emoji reactions huge or tiny?',
      md: md`
Back to Priya and Sam. Assumptions (each one you could check with the product team):

- 50 million daily users; each reacts **5 times** a day.
- A reaction row: user id 8 B + post id 8 B + emoji 2 B + timestamp 8 B + index overhead → **~50 B**.
- Each user views **200 posts** a day, and each view displays the post's reaction counts.
- 100 million distinct posts are viewed on a typical day. Peak ≈ 3×.

**Writes.** $5 \times 10^7 \times 5 = 2.5 \times 10^8$/day → **2,500/s** average → **7,500/s peak**.

**Storage.** $2.5 \times 10^8 \times 50$ B $= 1.25 \times 10^{10}$ B = 12.5 GB/day → ×365 ≈ 4.6
TB/year → ×3 ≈ **14 TB/year**.

**Reads of counts.** $5 \times 10^7 \times 200 = 10^{10}$ views/day → **100,000/s** average →
**300,000/s peak**.

**Cache for counts.** Store a precomputed count per post: ~100 B each × $10^8$ posts viewed daily =
$10^{10}$ B = **10 GB**. One cache node.

**The verdict, in four lines:**

1. **Storage is small** — Sam is right. A few TB a year fits the existing database for now; plan to
   partition by post id in a year or two.
2. **Writes are moderate** — 7,500/s at peak is at the upper edge of one database. Batching count
   updates (add +37 once a second instead of +1 thirty-seven times) takes it well inside.
3. **Reads are huge** — Priya is right, but about the wrong thing. 300,000/s must *never* hit a
   database — and it doesn't need a new cluster either, just a precomputed count per post in a 10-GB
   cache.
4. **No new database cluster.** One small cache, one batching change, one note to revisit at year two.

Ten minutes of arithmetic, and the hour-long argument becomes a three-item plan both engineers can
agree on.

## What you now own

1. **The procedure:** users → actions/day → requests/day → average QPS (÷10⁵) → **peak QPS** (×2–5)
   → read/write ratio → storage → bandwidth → cache → servers.
2. **Why peak sizes the system:** past capacity, the backlog grows every second and latency explodes
   — so size for the peak and run at ~50–70% utilisation, plus spares.
3. **The formulas:** storage = size × items/day × retention × replication (usually 3); bandwidth =
   QPS × payload (convert bits ↔ bytes, ×8); cache ≈ 20% of distinct items × size; servers = peak
   QPS ÷ per-server capacity ÷ utilisation + spares.
4. **The reference tables:** $2^{10} \approx 10^3$ (KB, MB, GB, TB, PB), time constants, the latency
   ladder, and rough per-machine capacities — always flagged as assumptions.
5. **Three habits:** round to powers of ten, keep units visible, sanity-check against something you
   know (and cross-check by a second route when you can).
6. **Orders of magnitude decide the architecture; factors of 2 decide the bill** — and the most
   valuable estimate often says "this is small, don't build the complicated thing."

Next: SD.3 — now that the numbers tell you *how much* load is coming, we'll look at how to spread
it across many machines without them tripping over each other.
`,
    },
  ],
  questions: [
    {
      id: 'sd-l2-q1',
      kind: 'mcq',
      prompt: md`A teammate says "we'll use the 80/20 rule for the cache." What does that rule of thumb
actually tell you?`,
      options: [
        md`Cache 80% of the data so that 20% of reads go to the database`,
        md`About 20% of items receive about 80% of requests, so caching that hot 20% serves most reads from memory`,
        md`A cache should be 80% full and 20% empty to leave room for new items`,
        md`20% of users generate 80% of writes, so the cache should buffer writes from heavy users`,
      ],
      answer: 1,
      explain: md`The 80/20 rule is about **skew in access**: a small fraction of items gets most of the
traffic, which is why a small cache is so effective. Option A tempts because it contains both numbers,
but inverts the whole benefit — caching 80% of the data would cost 4× the memory for barely more hits.
Option C sounds like sensible capacity planning but is a different idea entirely. Option D borrows the
"heavy users" intuition, but caches exist to serve *reads* cheaply; writes still have to reach the
durable store.`,
    },
    {
      id: 'sd-l2-q2',
      kind: 'numeric',
      prompt: md`**Fermi.** A food-delivery app launches in a country of **100 million** people. Assume
**10%** of people use it, each placing about **2 orders per week**, and each order generates about
**50 API requests** (browsing, checkout, live tracking). Roughly what is the **average QPS**?`,
      answer: 1500,
      tolerance: 450,
      explain: md`Users: $10^8 \times 0.1 = 10^7$. Orders/day:
$10^7 \times 2 \div 7 \approx 3 \times 10^6$. Requests/day: $3 \times 10^6 \times 50 = 1.5 \times 10^8$.
Average QPS: $1.5 \times 10^8 \div 10^5 \approx 1{,}500$ (with 86,400 s and exact 2/7 it's ~1,650 — same order of magnitude, same design).
And since dinner time is a sharp, single-country peak, you'd plan for maybe 5× that: ~7,500 QPS.`,
    },
    {
      id: 'sd-l2-q3',
      kind: 'mcq',
      prompt: md`Your estimate says a service must send **5 GB/s** of responses at peak. Each server has a
**10 Gbps** network card. What's the minimum number of servers just to push the bytes, before any
headroom?`,
      options: [
        md`1 — 10 Gbps is more than 5 GB/s`,
        md`4 — because 5 GB/s is 40 Gbps`,
        md`2 — because 10 is twice 5`,
        md`50 — because each server only gets 1/10 of its rated bandwidth`,
      ],
      answer: 1,
      explain: md`Network speeds are in **bits**, payloads in **bytes**: $5 \text{ GB/s} \times 8 = 40$
Gbps, and $40 \div 10 = 4$ servers at 100% — realistically ~6 at 70% utilisation. Option A is the
classic trap: comparing "10" to "5" without noticing the lowercase *b* vs capital *B*. Option C makes
the same error more subtly. Option D invents an overhead factor with no basis.`,
    },
    {
      id: 'sd-l2-q4',
      kind: 'numeric',
      prompt: md`A social app stores **50 million** new posts per day, each about **1 KB**, keeps them for
**1 year**, and replicates everything **3 times**. Roughly how many **terabytes** of storage does one
year of posts need? (1 TB = 10⁹ KB.)`,
      answer: 55,
      tolerance: 12,
      explain: md`Per day: $5 \times 10^7 \times 1 \text{ KB} = 5 \times 10^7 \text{ KB}$ = 50 GB. Per year:
$50 \times 365 \approx 18{,}000$ GB ≈ 18 TB. With ×3 replication: **~55 TB**. The most common wrong answer is
~18 — forgetting replication, which is a 3× error on the hardware bill. At 55 TB this is more than one
machine's disk, so the data must be spread over several machines.`,
    },
    {
      id: 'sd-l2-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Using only the fact that a day has 86,400 seconds:
(a) derive the rule "N per day ≈ N ÷ 10⁵ per second" and state how big its error is and in which
direction; (b) derive how many requests per **month** a steady 1 QPS produces; (c) a regional app gets
**80% of its daily traffic within 4 hours** in the evening, spread evenly across those hours. Derive its
peak-to-average ratio. Show every step with units.`,
      rubric: md`**(a)** Rate = N / 86,400 per second. Replacing 86,400 with 100,000 divides by a number
that's ~16% too large, so the shortcut **underestimates** the rate: true rate =
$N/86{,}400 = 1.157 \times (N/10^5)$ — about **14–16% low**. Acceptable because estimation only needs the power of ten;
mention that it errs on the *low* side (so a cautious designer rounds up).

**(b)** 1 request/s × 86,400 s/day ≈ 86,400/day ≈ $10^5$/day. × 30 days/month ≈ $2.6 \times 10^6$
— **~2.5 million requests per month per steady QPS**. (Handy reverse rule: 1 million/month ≈ 0.4 QPS.)

**(c)** Average rate over the day: $N / 86{,}400$ per second. Evening rate:
$0.8N / (4 \times 3{,}600) = 0.8N / 14{,}400$ per second. Ratio:

$$\frac{0.8N/14{,}400}{N/86{,}400} = 0.8 \times \frac{86{,}400}{14{,}400} = 0.8 \times 6 = 4.8$$

So a regional evening-heavy app sits near the top of the 2–5× range —
unlike a global app, whose traffic is spread across time zones.

Full credit: correct algebra with units on every line, the error direction in (a), and the 4.8 in (c)
with the "4 hours is 1/6 of a day" reasoning visible. Stating "peak is 3×" without deriving it = no
credit for (c).`,
    },
    {
      id: 'sd-l2-q6',
      kind: 'numeric',
      prompt: md`An e-commerce site has **200 million** product pages, each about **5 KB**. Using the 80/20
rule on distinct items, roughly how many **GB** of cache memory are needed to serve about 80% of page
reads? (Ignore cache overhead.)`,
      answer: 200,
      tolerance: 40,
      explain: md`Hot items: $0.2 \times 2 \times 10^8 = 4 \times 10^7$. Memory: $4 \times 10^7 \times 5$ KB
$= 2 \times 10^8$ KB $= 2 \times 10^{11}$ B = **200 GB**. That's at the edge of one large server's RAM,
so realistically two or three cache nodes (plus replicas). Tempting error: forgetting the 0.2 and
answering 1,000 GB — caching the entire catalogue, which costs 5× the memory for only ~20% more hits.`,
    },
    {
      id: 'sd-l2-q7',
      kind: 'mcq',
      prompt: md`Estimation for an internal HR tool gives: **30 GB** total data, **500 reads/s** and **20
writes/s** at peak, expected to grow slowly. Which design conclusion is best supported?`,
      options: [
        md`Shard the database across several machines now, so it's ready for future growth`,
        md`A single database (with a replica for failover) is enough; the whole dataset even fits in one machine's RAM, so sharding would be pure cost`,
        md`Use a distributed cache cluster in front of the database, since reads outnumber writes 25:1`,
        md`Put the data in object storage, since it's cheaper per GB`,
      ],
      answer: 1,
      explain: md`30 GB fits in RAM on one machine; 500 reads/s is well inside one database's range. The
most valuable result of estimation is often *"this is small — don't build the complicated thing."*
Option A tempts because "ready for growth" sounds prudent, but slow growth from 30 GB won't need
sharding for years, and sharding adds real operational cost now. Option C correctly notices the read
ratio but ignores the absolute number: 500 reads/s needs no cache. Option D fits blobs like images, not
small rows queried by field.`,
    },
    {
      id: 'sd-l2-q8',
      kind: 'numeric',
      prompt: md`A service has **20 million** daily users making **50 requests** each per day. Peak is
**3×** average. Each app server handles **2,000 QPS**, and you plan to run servers at **50%**
utilisation at peak. How many app servers do you need (before spares)?`,
      answer: 30,
      tolerance: 8,
      explain: md`Requests/day: $2 \times 10^7 \times 50 = 10^9$. Average: $10^9 \div 10^5 = 10{,}000$
QPS. Peak: 30,000 QPS. Flat-out: $30{,}000 \div 2{,}000 = 15$ servers. At 50% utilisation:
$15 \div 0.5 = 30$. (With 86,400 s you get ~35 — same answer for design purposes.) Then add spares for
failures. The common slip is stopping at 15, which leaves no headroom: the first traffic spike puts
every server at 100% and queues start growing.`,
    },
    {
      id: 'sd-l2-q9',
      kind: 'mcq',
      prompt: md`A colleague's estimate for a chat app concludes the connection servers need **5 PB of
RAM**. What is the best next move?`,
      options: [
        md`Start pricing 10,000 high-memory servers — the arithmetic says what it says`,
        md`Sanity-check: 5 PB is ~10,000 large servers' worth of RAM just for connections, which is absurd, so recheck units and per-connection assumptions step by step`,
        md`Halve it, since estimates are usually pessimistic`,
        md`Switch to storing connections on SSD to save money`,
      ],
      answer: 1,
      explain: md`A sanity check against something you know (a big server has ~0.5 TB of RAM) instantly
flags this as wrong by orders of magnitude — likely a unit slip, e.g. 10 **MB** per connection instead
of 10 **KB** (1,000×). Option A tempts because trusting your arithmetic feels rigorous, but arithmetic
on a unit error is still wrong. Option C "adjusts" by a factor of 2 when the error is a factor of ~1,000.
Option D solves the wrong problem — the number itself is the bug.`,
    },
    {
      id: 'sd-l2-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "Why do engineers do maths with made-up numbers
before building an app? And why do they plan for the busiest moment instead of a normal moment?"
Answer with an analogy you invent (a school canteen, an ice-cream truck, a birthday party). Cover:
what a rough estimate is and why rough is good enough, why you plan for the busiest time, and why you
only keep the popular things close at hand. No jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **What a rough estimate is** — e.g. an ice-cream truck owner guessing "about 200 kids on a hot day,
   each wants one cone — so about 200 cones." Not exact, but it tells you to bring boxes of cones, not
   one bag and not a warehouse. Rough is enough because the plan only changes when the number changes
   *a lot* (20 vs 200 vs 2,000 kids), not when it's 180 vs 220.
2. **Why plan for the busiest moment** — the truck isn't busy all day; everyone comes at 3 pm when
   school lets out. If you can only serve enough for a normal minute, the line gets longer every
   minute, kids give up and leave (or push and shove). You plan for 3 pm, not for the quiet morning.
3. **Keep the popular things close** — most kids want chocolate or vanilla, so those go right at the
   window; the weird flavours stay in the back freezer. A small space up front serves almost everyone
   (the 80/20 idea, in kid words).
4. **Jargon audit:** "QPS," "peak," "cache," "capacity," "throughput," "latency," "80/20 rule,"
   "server" used without a kid-level translation = partial credit at best. An answer that's accurate
   but reads like a textbook fails the task.

Full credit: one coherent analogy that carries all three ideas, with a concrete number in it.`,
    },
    {
      id: 'sd-l2-q11',
      kind: 'written',
      prompt: md`**Find the errors.** A colleague estimates an image-hosting service. Find **at least
four** mistakes, correct each, and say which ones would have changed the design:

~~~text
1. 50 million uploads/day ÷ 3,600 s  ≈ 14,000 uploads/s
2. 50 million × 2 MB per image       = 100 GB/day
3. 100 GB × 365                      ≈ 36 TB/year — fits on a few disks
4. 500 million views/day × 2 MB      = 1 PB/day ÷ 10^5 s = 10 GB/s
   → one server with a 10 Gbps network card can serve it
~~~`,
      rubric: md`**Error 1 — wrong time unit.** 3,600 is seconds per *hour*. Correct:
$5 \times 10^7 \div 10^5 = 500$ → **~500 uploads/s** average (~1,500 peak). Overestimate by ~24× → would have wrongly sized the
upload path.

**Error 2 — MB/GB slip.** $5 \times 10^7 \times 2$ MB $= 10^8$ MB $= 10^{14}$ B = **100 TB/day**, not
100 GB. Off by 1,000×.

**Error 3 — carried error + missing replication.** Correct: 100 TB/day × 365 ≈ **36.5 PB/year**, ×3
replication ≈ **~110 PB/year**. "A few disks" becomes "a large object-storage system" — a completely
different design.

**Error 4 — bits vs bytes, and average vs peak.** 1 PB/day ÷ $10^5$ s = 10 GB/s is right, but 10
GB/s = **80 Gbps**, and peak ×3 ≈ **240 Gbps**. At ~7 Gbps usable per server that's ~35 servers just to
push bytes — and with viewers worldwide, a **CDN**.

**Which changed the design:** errors 2, 3, and 4 are order-of-magnitude errors that flip decisions
(database → object storage; one server → CDN). Error 1 overstates the upload rate ~24×, pushing you to
over-build ingestion.

Full credit: four errors found, each with the corrected arithmetic and units, and an explicit note of
which ones change architecture versus just capacity.`,
    },
    {
      id: 'sd-l2-q12',
      kind: 'written',
      prompt: md`**Full estimation exercise.** A ride-hailing app tracks driver locations. At peak, **5
million** drivers are online; each phone sends a GPS update every **4 seconds**, about **100 bytes**
each. Averaged over a whole day, about **2 million** drivers are online. Updates are kept **30 days**,
replicated ×3. Riders need each driver's *latest* position. On paper, estimate: (1) peak write QPS;
(2) peak incoming bandwidth; (3) storage for 30 days of history, with replication; (4) memory to hold
every driver's latest position; (5) ingestion servers at ~10,000 updates/s each, 70% utilisation.
Then (6) state two design decisions these numbers force, each tied to a number.`,
      rubric: md`**(1) Peak writes:** $5 \times 10^6 \div 4$ s = **1.25 million updates/s**.

**(2) Peak bandwidth:** $1.25 \times 10^6 \times 100$ B = $1.25 \times 10^8$ B/s = **125 MB/s ≈ 1
Gbps**. Modest — a single network card could take it; bandwidth is not the problem.

**(3) Storage:** average rate $2 \times 10^6 \div 4 = 5 \times 10^5$ updates/s × 86,400 s ≈ $4.3
\times 10^{10}$ updates/day (or $5 \times 10^{10}$ with the $10^5$ shortcut) × 100 B ≈ **4.3–5
TB/day** → × 30 ≈ **130–150 TB** → ×3 ≈ **~400–450 TB**.

**(4) Latest positions:** $5 \times 10^6 \times 100$ B = **500 MB**. Fits in the RAM of one machine many
times over.

**(5) Servers:** $1.25 \times 10^6 \div 10^4 = 125$ flat-out; $125 \div 0.7 \approx 179$ → **~180
ingestion servers**, plus spares.

**(6) Decisions (any two, each tied to a number):** 1.25M writes/s is ~100× what one database takes →
history goes to a write-optimised, partitioned store (or a log/queue first, written in batches); 500
MB of latest positions → keep the "where is each driver now" view entirely **in memory** (a cache,
replicated), separate from history, so rider lookups never touch the history store; ~400 TB/month of
history → store it cheaply and partitioned by time so old days are dropped wholesale; bandwidth 1 Gbps
→ *not* a concern, no special network design needed.

Full credit: all five numbers within ~2×, units on every line, and design decisions explicitly linked
to specific numbers — including noticing that the *hot* data (500 MB) and the *cold* data (hundreds of
TB) differ by ~10⁶ and deserve different homes.`,
    },
  ],
}
