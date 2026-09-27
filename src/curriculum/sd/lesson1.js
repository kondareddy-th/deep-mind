// System Design Foundations, Lesson 1 — the method (anchor lesson)
//
// Content uses the `md` tag from ../md.js: like String.raw, plus \` becomes a backtick.
// Code/diagram blocks use ~~~ fences. NEVER write the dollar-brace sequence in content.

import { md } from '../md.js'

export default {
  id: 'sd-l1',
  title: 'SD.1 System design is a method, not a memory test',
  subtitle:
    'Most people fail "design Twitter" by drawing boxes. The boxes are the output of the reasoning, not the reasoning. This lesson gives you the six-step method every later design lesson uses — and shows that the numbers, more than the product, decide what gets built.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

An interviewer says: *"Design a URL shortener — like bit.ly."*

Here's what a nervous but capable engineer does. They start drawing immediately: a load balancer,
three app servers, a database, a cache in front of it, maybe a CDN. It looks professional. Forty minutes
later the interviewer asks, *"Why did you need the cache?"* — and the honest answer is *"because
diagrams usually have one."*

That design fails, and not because any box is wrong. It fails because **nothing in it was decided**.
The engineer never asked how many links get created per day, how often they're clicked, how long they
live, or what happens if the service is down for a minute. Without those answers, every box is a guess
wearing a diagram's clothes.

Here is the claim this whole section is built on:

> **The same product at different scales is a different system.** A URL shortener serving a small
> company's internal links runs happily on one server with one database. The same product serving the
> whole internet needs caching, a key-generation strategy, and data spread across many machines. The
> product didn't change. **The numbers did** — and the numbers chose the architecture.

So system design isn't remembering what bit.ly looks like. It's a *method* for letting the
requirements and the numbers drive every decision, so that each box on the final diagram has a reason
you can say out loud.

## The six-step method

Every design lesson after this one, and every challenge in the adaptive Architecture track, follows this
shape:

**1. Requirements.** What must it do (*functional*) and how well must it do it (*non-functional*)?
Pin down scope — what is explicitly out.

**2. Estimate.** Back-of-envelope numbers: users, requests per second, storage, bandwidth. These
numbers decide almost everything that follows.

**3. API.** The contract — what calls exist, what goes in, what comes out.

**4. Data model.** What gets stored, and — more importantly — how it will be *read*.

**5. High-level design.** *Now* the boxes. Each one justified by something from steps 1–4.

**6. Deep dive and tradeoffs.** Where does it break first? What fails, and what happens then? What did
you give up, and why was that the right trade?

The order is the point. Steps 1 and 2 feel like a delay before the "real" design. They *are* the real
design — they're where the decisions come from.

## Step 1 up close: two kinds of requirement

**Functional requirements** are the verbs — what users can do.
- Create a short link for a long URL.
- Visiting the short link redirects to the long URL.
- (Maybe) links expire; (maybe) users see click counts.

**Non-functional requirements** are the adjectives — how well it must do those things. These are
where designs actually live or die:

- **Scale** — how many requests per second, how much data?
- **Latency** — how fast must each request be? Usually stated as **p99**: the time within which 99% of
  requests finish. (Averages hide the slow ones; p99 is what your unluckiest users feel.)
- **Availability** — what fraction of time must it work? Usually stated in "nines": 99.9% is "three
  nines."
- **Consistency** — after a write, must every reader see it immediately, or is a short delay fine?
- **Durability** — can we ever lose data? (For a URL shortener: losing a link breaks it forever.)

A rule worth keeping: *making something work is easy; making it work at a stated scale, latency, and
availability is design.* Almost every interesting decision comes from a non-functional requirement.
`,
    },
    {
      type: 'ponder',
      question: md`Before reading on: the functional requirements for a URL shortener fit in three lines,
and any competent programmer could build a version that "works" in an afternoon. So why is it a
standard *senior* interview question? What exactly makes it hard?`,
      answer: md`The functional part is trivial. Everything hard is non-functional:

- **The read/write asymmetry.** Links are created rarely and clicked constantly — often a hundred or
  more reads per write. That single ratio pushes you toward caching and read-optimised storage.
- **The redirect is on the critical path of someone else's page load.** A slow redirect makes *every
  link* feel broken, so p99 latency matters more than usual.
- **Generating short, unique keys across many servers** without two servers ever issuing the same one
  is a genuine distributed-systems problem.
- **Durability forever.** A lost row isn't a lost record — it's a link printed on a poster that now
  goes nowhere.

That's why the question works so well: it's small enough to finish in 45 minutes, and every hard part
is a non-functional requirement that a box-drawer never asks about. The interviewer isn't testing
whether you can build a redirect. They're testing whether you *find* those four problems.`,
    },
    {
      type: 'example',
      title: 'turning "design Instagram" into numbers — a clarifying dialogue',
      md: md`
Here is what the first five minutes of a good design conversation actually sound like. Notice that
every question is chosen because its answer would *change the design*.

> **You:** Is this the whole of Instagram, or a core? I'd propose: upload photos, follow people, and see a
> feed of photos from people you follow. Stories, messaging, and video are out of scope.
> **Them:** That's fine.
>
> **You:** How many daily active users should I assume?
> **Them:** Say 100 million.
>
> **You:** Roughly how many uploads versus views? My guess is that each user uploads maybe one photo
> every few days but scrolls through dozens a day — so a heavily read-dominated system.
> **Them:** Reasonable. Say 20 million uploads a day.
>
> **You:** How fresh must the feed be — is it acceptable if a new post takes a few seconds to appear for
> followers?
> **Them:** A few seconds is fine.
>
> **You:** And we never lose an uploaded photo?
> **Them:** Correct.

Now look at what those five answers bought:

| answer | what it decides |
|---|---|
| core scope only | no messaging or video pipelines — a much smaller design |
| 100M daily users | many app servers; data spread across machines |
| 20M uploads/day | ~200 uploads/s; ~40 TB/day of photos at 2 MB → object storage + CDN |
| read-dominated | feeds should be precomputed or cached, not assembled on every request |
| "a few seconds is fine" | feed updates can be **asynchronous** (a queue) — no need for instant global consistency |
| "never lose a photo" | replicated durable storage; uploads confirmed only after a durable write |

Five questions, and you already know the shape of most of the system — before drawing a single box.
That is what "requirements drive the design" means in practice.
`,
    },
    {
      type: 'text',
      md: md`
## Step 2 up close: estimation is a superpower

You don't need precise numbers. You need numbers within a factor of a few, fast. The single most
useful trick:

> **One day ≈ 100,000 seconds.** (Exactly 86,400 — but 10⁵ is close enough and makes the arithmetic
> trivial.)

So "N per day" becomes "N ÷ 100,000 per second." A few more reference numbers worth memorising — you'll
use them in every design:

| quantity | rough value |
|---|---|
| seconds in a day | ~100,000 |
| seconds in a year | ~30 million |
| read from memory (RAM) | ~100 nanoseconds |
| read from SSD | ~100 microseconds (1,000× slower than RAM) |
| round trip inside a datacenter | ~0.5 milliseconds |
| round trip across continents | ~100–150 milliseconds |
| a single well-tuned server | thousands to tens of thousands of simple requests per second |

The latency ladder is worth staring at: memory, SSD, network, and cross-continent each differ by
roughly **1,000×**. Almost every performance decision in system design is about keeping the hot path
on a higher rung of that ladder — which is what a cache *is*.
`,
    },
    {
      type: 'ponder',
      question: md`The ladder says memory is roughly **1,000× faster** than SSD. So why doesn't every
system just keep all its data in RAM and skip disks entirely? Think of at least three reasons before
revealing — and then the interesting follow-up: when *does* "keep it all in memory" become the right
answer?`,
      answer: md`**Why not RAM for everything:**

1. **Durability.** RAM forgets everything when the power goes. A database whose only copy lives in
   memory loses every link, every order, every message in the next restart or crash.
2. **Cost.** Per gigabyte, RAM costs many times more than SSD, and SSD many times more than object
   storage. Keeping 91 TB of mostly-cold links in memory would be absurdly expensive for data that is
   rarely read.
3. **Capacity.** One machine holds hundreds of gigabytes of RAM, not tens of terabytes. Beyond that you
   need many machines just to hold the data — which reintroduces the network, the next rung down.

**When it IS right:** when the *working set* — the data actually being accessed right now — is small
compared to the total, and reads dominate. That is the entire idea of a **cache**: keep the hot few
percent in memory for speed, keep the full durable copy on disk for safety. You get RAM speed for most
requests and disk economics for the long tail.

So the latency ladder doesn't say "use the fastest rung." It says **put each piece of data on the
cheapest rung that still meets its latency requirement** — the design principle behind caches, CDNs,
and tiered storage (SD.5 builds on exactly this).`,
    },
    {
      type: 'example',
      title: 'the same URL shortener at two scales',
      md: md`
**Scale A — an internal tool for one company.** 1,000 new links per day, 10,000 clicks per day.

- Writes: 1,000 ÷ 100,000 ≈ **0.01 per second**. Reads: ≈ **0.1 per second**.
- Storage: 1,000 links × ~500 bytes × 365 days × 5 years ≈ **1 GB**.

**Design:** one small server, one Postgres database, done. A cache, sharding, or a CDN would be pure
cost with no benefit. Drawing them would be a *mistake*, not extra credit.

**Scale B — a public service.** 100 million new links per day, and 100 reads per write.

- Writes: 10⁸ ÷ 10⁵ = **~1,000 per second** (peak maybe 3× that).
- Reads: 100 × 1,000 = **~100,000 per second** — far beyond one database.
- Storage: 10⁸ × 500 bytes × 365 × 5 ≈ **91 TB** over five years — beyond one machine's disk.

**Design:** now every box has a reason. Reads massively outnumber writes → a **cache** in front of the
database (most clicks go to a small set of popular links). 91 TB → data **split across many machines**
(sharding). Thousands of writes per second from many servers → a **key-generation scheme** that can't
collide. The redirect's latency matters → a **CDN or edge cache** for the hottest links.

Same product. Same three functional requirements. One design fits on a napkin; the other is a
distributed system. **Five minutes of arithmetic told you which one you were building.**
`,
    },
    {
      type: 'text',
      md: md`
## Steps 3 and 4: the contract and the data

**The API** turns requirements into precise operations. For the shortener:

~~~text
POST /links          body: { "url": "https://..." }         → 201 { "short": "aB3xK9q" }
GET  /{short}        → 301 redirect to the long URL, or 404
GET  /links/{short}/stats                                    → { "clicks": 1204 }
~~~

Writing it down forces questions you'd otherwise skip: what if the same long URL is submitted twice —
same short code, or new one? What status code does a missing link return? Can a caller choose their own
short code?

**The data model** starts from *how data will be read*, not how it looks. Here the dominant query, by a
factor of a hundred, is "given a short code, find the long URL" — a lookup by one key. That single fact
tells you the core table is essentially a key-value mapping, and that the short code is the thing to
index and to split data on. (SD.4 on databases develops this "design for the read" principle properly.)

## Steps 5 and 6: boxes, then honesty

Only now do you draw the high-level design — and each box should come with its justification from the
earlier steps. Then the deep dive, which is where senior candidates separate themselves:

- **What breaks first as load grows?** (Probably the database under read load — which is why the cache
  exists.)
- **What happens when a component fails?** If the cache dies, does the database get flattened by the
  sudden traffic? (Yes, unless you've planned for it — SD.7.)
- **What did you give up?** Every design trades something: consistency for speed, cost for
  availability, simplicity for scale. Saying the trade out loud is the single most valued skill in a
  design review.

## What an interviewer is actually grading

Not whether your diagram matches bit.ly's real one. They're grading:

1. Did you **clarify before designing**?
2. Did your **numbers drive your decisions**, and can you say which number caused which box?
3. Can you **name the tradeoffs** you made?
4. When pushed on a weak point, do you **reason** — or defend?

There's no single right answer to a design question. There are well-reasoned answers and guesses.

## What you now own

1. **The central claim:** the same product at different scales is a different system — the numbers
   choose the architecture.
2. **The six-step method:** requirements → estimate → API → data model → high-level design → deep dive
   and tradeoffs. The order is the point.
3. **Functional vs non-functional requirements**, and why the hard parts almost always live in the
   non-functional ones (scale, latency as p99, availability in nines, consistency, durability).
4. **Estimation tools:** one day ≈ 100,000 seconds, and the ~1,000× latency ladder (memory → SSD →
   network → cross-continent).
5. **Design for the read:** the dominant access pattern shapes the data model.
6. **What gets graded:** clarifying, number-driven decisions, named tradeoffs, and reasoning under
   pressure.

Next: estimation deserves its own lesson — because once you can do it in your head in under a
minute, you'll never draw an unjustified box again.
`,
    },
    {
      type: 'ponder',
      question: md`Here's a trap that catches strong engineers. The interviewer says *"design a URL
shortener"* and nothing else. You ask how many users — they say *"you decide."* Is that a dodge? What
should you do with it, and why is "you decide" actually part of the test?`,
      answer: md`It's not a dodge — it's handing you the most important decision in the interview, to see
whether you'll make it deliberately.

**What to do:** state an assumption *out loud*, pick numbers that make the problem interesting, and say
why. *"I'll assume public scale — around 100 million new links a day with a 100:1 read ratio — because
at internal-tool scale this is one server and one database, and there wouldn't be much to design. If
you'd rather I do the small version, I will."*

**Why it's part of the test:** real engineering almost never arrives with complete requirements.
Product managers say "it needs to be fast" and "lots of people will use it." A senior engineer's job is
to turn vague wants into specific, checkable numbers — and to make the assumption *visible*, so that if
it's wrong, someone can correct it early rather than after launch.

The failure modes on either side: freezing until you're given numbers (you'll wait forever in real
life), or silently assuming numbers and never saying them (so nobody can check your reasoning). The
skill is **explicit assumption**: decide, say it, and say what would change if you're wrong.`,
    },
  ],
  questions: [
    {
      id: 'sd-l1-q1',
      kind: 'mcq',
      prompt: md`You're asked to "design a ride-sharing app." What is the best first move?`,
      options: [
        'Draw the high-level architecture so the interviewer sees your experience quickly',
        'Ask clarifying questions to pin down the functional requirements, scale, and which non-functional properties matter most',
        'Choose a database, since data storage is the hardest part of any system',
        'List every AWS service you would use',
      ],
      answer: 1,
      explain: md`Clarifying first is step 1 because every later decision depends on it — a ride-sharing
app for one small town and one for a continent are different systems. Option A is the most common
failure: it *feels* like demonstrating skill, but it produces boxes nobody can justify. Option C picks an
answer before knowing the question: the right database depends on the access pattern you haven't
learned yet.`,
    },
    {
      id: 'sd-l1-q2',
      kind: 'numeric',
      prompt: md`A service receives **50 million** requests per day. Using the "one day ≈ 100,000
seconds" shortcut, roughly how many requests per second is that on average?`,
      answer: 500,
      tolerance: 100,
      explain: md`$5 \times 10^7 \div 10^5 = 500$ per second (the exact figure, using 86,400, is about
579). Close enough to decide the architecture, found in two seconds. Real traffic isn't flat, so you'd
typically also say *"peak is maybe 2–3× the average"* and design for about 1,500.`,
    },
    {
      id: 'sd-l1-q3',
      kind: 'mcq',
      prompt: md`Which of these is a **non-functional** requirement?`,
      options: [
        'Users can upload a profile photo',
        'Users can search posts by hashtag',
        '99% of feed requests must complete within 200 milliseconds',
        'Users can delete their own comments',
      ],
      answer: 2,
      explain: md`It says *how well* the system must behave (a p99 latency target), not *what* it does.
The other three are verbs — things users can do. A useful test: functional requirements describe
features a user could see in a demo; non-functional requirements describe properties you'd only notice
when they fail — slowness, downtime, lost data.`,
    },
    {
      id: 'sd-l1-q4',
      kind: 'numeric',
      prompt: md`A system promises **99.9%** availability ("three nines"). How many **hours** per year is
it allowed to be down? (A year has about 8,760 hours.)`,
      answer: 8.76,
      tolerance: 0.3,
      explain: md`$0.1\% \times 8{,}760 = 8.76$ hours a year — about 43 minutes a month. Each extra nine
divides that by ten: 99.99% allows ~53 minutes a year, 99.999% about 5 minutes. That's why each nine is
dramatically more expensive: at five nines, a single slow deploy or one bad config push uses your whole
annual budget.`,
    },
    {
      id: 'sd-l1-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall — run the method.** Apply all six steps, briefly, to a
**pastebin** (users paste text, get a short link, others view it). Assume 10 million new pastes a day,
10 reads per paste, average paste 10 KB, kept for 1 year. For each step write 2–4 lines, and for step 5,
justify every box you draw by pointing at a specific number or requirement from steps 1–4.`,
      rubric: md`**1. Requirements.** Functional: create a paste → get link; view by link; (optional)
expiry. Non-functional: reads fast (p99 low), pastes durable until expiry, high availability; strong
consistency not critical (a paste appearing a second late is fine).

**2. Estimate.** Writes: $10^7 \div 10^5 = 100$/s. Reads: 10× → **1,000/s**. Storage:
$10^7 \times 10$ KB $= 100$ GB/day → **~36 TB/year**.

**3. API.** \`POST /pastes\` → short id; \`GET /{id}\` → content or 404.

**4. Data model.** Dominant query: fetch by id. Metadata (id, created, expiry) in a database; the
*content* — large text blobs — in object storage, since 36 TB of blobs doesn't belong in a relational
table.

**5. High-level design (each box justified).** App servers behind a load balancer (1,000 reads/s plus
redundancy for availability); a metadata DB (small rows, lookup by id); object storage for content
(36 TB/year); a cache for popular pastes (10:1 read ratio, and popularity is skewed).

**6. Deep dive.** First bottleneck: object-storage reads for hot pastes → the cache. Failure: if the
cache dies, reads fall through to storage, which can absorb 1,000/s. Tradeoff: separating content from
metadata adds a second lookup per read, accepted in exchange for cheap, scalable storage.

Full credit = the arithmetic in step 2 done correctly *and* explicit number-to-box justifications in
step 5. A diagram without justifications is exactly the failure this lesson is about.`,
    },
    {
      id: 'sd-l1-q6',
      kind: 'numeric',
      prompt: md`**Fermi.** A photo service stores **2 million** new photos per day at an average of
**2 MB** each. Roughly how many **terabytes** of new storage does it need per year? (1 TB = 10⁶ MB.)`,
      answer: 1460,
      tolerance: 250,
      explain: md`Per day: $2 \times 10^6 \times 2$ MB $= 4 \times 10^6$ MB $= 4$ TB. Per year:
$4 \times 365 \approx 1{,}460$ TB — about **1.5 petabytes a year**, before replication (usually ×3). One
multiplication just told you this system needs object storage, not a database's disk — the kind of
conclusion estimation exists to produce.`,
    },
    {
      id: 'sd-l1-q7',
      kind: 'mcq',
      prompt: md`Why do designers usually talk about **p99 latency** rather than average latency?`,
      options: [
        'Because p99 is always lower than the average, so it looks better',
        'Because averages hide the slow requests — p99 describes what your unluckiest 1% of requests experience, which is what users complain about',
        'Because p99 is easier to measure than an average',
        'Because the average is only meaningful for databases',
      ],
      answer: 1,
      explain: md`An average of 50 ms can hide 2% of requests taking 3 seconds, and those are the users who
leave. p99 means 99% of requests finish within this time. A subtle extra point: one page often makes
dozens of backend calls, so the *page* is only fast if *all* of them are — which makes the tail far
more common than it sounds. Option A is simply false: p99 is always at or above the median.`,
    },
    {
      id: 'sd-l1-q8',
      kind: 'numeric',
      prompt: md`A URL shortener creates **1,000 links per second** and each link is clicked **100 times**
on average over its life, so reads run at 100× the write rate. What is the approximate **read** rate in
requests per second?`,
      answer: 100000,
      tolerance: 5000,
      explain: md`$1{,}000 \times 100 = 100{,}000$ reads per second — this single number is why the design
needs a cache. A well-tuned database might handle a few thousand to tens of thousands of simple lookups
per second on one machine; 100,000 needs either many replicas or a cache absorbing most of the load. And
because link popularity is heavily skewed, a cache holding only the hottest few percent of links can
absorb the large majority of reads.`,
    },
    {
      id: 'sd-l1-q9',
      kind: 'mcq',
      prompt: md`An interviewer asks how many users to assume and says "you decide." What's the strongest
response?`,
      options: [
        'Refuse to continue without real numbers, since any design would be a guess',
        'Silently pick numbers and design, to save time',
        'State an explicit assumption out loud, explain why it makes the problem interesting, and note what would change if it were different',
        'Assume the largest possible scale, since designing for more is always safer',
      ],
      answer: 2,
      explain: md`Explicit assumption is the skill being tested: decide, say it, say what changes if it's
wrong. Option D is the most tempting wrong answer — it sounds cautious, but over-engineering is a real
failure: designing internet scale for an internal tool wastes money and adds complexity that causes its
own outages. Option B produces a design nobody can check.`,
    },
    {
      id: 'sd-l1-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "Why can't you just build a website the same way
whether 10 people use it or 10 million?" Explain, with an analogy you invent (a lemonade stand, a school
cafeteria, a pizza shop): why the size changes the design, what "estimating" means and why you'd do it
before building, and why just drawing a fancy plan isn't enough. No jargon without a kid-level
explanation first.`,
      rubric: md`Grade the teaching:

1. **Scale changes the design** — a strong analogy: a lemonade stand for your street needs one table
   and one jug; for a whole stadium you need many stands, a stockroom, runners carrying lemonade, and a
   plan for when one stand runs out. Same lemonade, completely different setup — and building the
   stadium version for your street would be silly and expensive.
2. **Estimating** — before building, you guess roughly how many people will come ("about 500, not 5 and
   not 5 million"), because that number decides how many tables you need. You don't need the exact
   number, just the right ballpark.
3. **Why a fancy plan isn't enough** — drawing tables and stockrooms looks impressive, but if you can't
   say *why* each one is there ("the stockroom exists because 500 people drink faster than one jug can
   be refilled"), you might be building things you don't need or missing what you do.
4. **Jargon audit:** "scalability," "QPS," "throughput," "latency," "architecture," "load balancer" used
   without a kid-level translation = partial at best.`,
    },
    {
      id: 'sd-l1-q11',
      kind: 'written',
      prompt: md`**Requirements gathering.** You're asked to "design a chat app like WhatsApp." Write the
**eight** most important clarifying questions you would ask before designing anything. For each, write
one sentence on how the answer would change the design.`,
      rubric: md`Any eight strong questions; grade on whether each one *would actually change the
design*. Strong examples:

1. **One-to-one only, or group chats — how large?** Group fan-out (one message delivered to 1,000
   members) is a different delivery problem.
2. **How many daily users, and messages per user?** Sets message throughput and connection counts.
3. **Must messages arrive in order?** Ordering guarantees constrain how messages are partitioned.
4. **Are messages stored on the server, and for how long?** Durable history means large storage;
   delete-after-delivery means very little.
5. **Online presence and "seen" receipts?** These generate far more traffic than the messages
   themselves.
6. **Media (photos, voice, video)?** Moves most bytes to object storage and a CDN.
7. **End-to-end encryption?** The server can't read content — no server-side search or moderation.
8. **Offline delivery — what if the recipient's phone is off?** Requires store-and-forward queues and
   push notifications.
9. **Multiple devices per user?** Syncing one account across devices is its own hard problem.
10. **Latency target for delivery?** Real-time push over persistent connections versus polling.

Full credit = eight questions, each with a *specific* design consequence. "How many users?" with
"affects scale" is weak; "how many users?" with "decides whether persistent connections fit on a few
servers or need a dedicated connection layer" is strong.`,
    },
    {
      id: 'sd-l1-q12',
      kind: 'written',
      prompt: md`**Two scales, two designs.** A to-do list app: at **Scale A** it serves 1 small team (20
users); at **Scale B**, 50 million users with 20 actions each per day, where 90% of actions are reads.
On paper: (1) do the estimation for Scale B (requests per second, read vs write split); (2) sketch the
design for each scale in a few lines; (3) name two things you would add at Scale B, and point to the
number that justifies each; (4) name one thing it would be a *mistake* to add at Scale A, and why.`,
      rubric: md`**(1) Scale B estimation.** Actions: $5 \times 10^7 \times 20 = 10^9$/day →
$10^9 \div 10^5 =$ **~10,000/s** average (peak maybe 30,000/s). Reads ~9,000/s, writes ~1,000/s.

**(2) Designs.** *A:* one server and one small database — or honestly, a hosted database behind a simple
app. *B:* stateless app servers behind a load balancer, a primary database with read replicas or a
cache, and data partitioned by user.

**(3) Two Scale B additions, each tied to a number** (any two): read replicas or a cache (9,000 reads/s
exceeds a comfortable single-database load, and reads dominate 9:1); partitioning by user id (50 million
users' data won't sit comfortably on one machine, and each user only reads their own lists, so the
partition key is natural); multiple app servers behind a load balancer (30,000/s at peak, plus
redundancy).

**(4) A mistake at Scale A** (any one): sharding, caching, message queues, or microservices — each adds
operational complexity (more things to deploy, monitor, and break) with *zero* benefit at 20 users. Over-
engineering is a genuine failure, not a safe choice.

Full credit requires the arithmetic, *specific* number-to-component justifications, and a real Scale A
over-engineering example with its cost named.`,
    },
  ],
}
