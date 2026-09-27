// System Design Foundations, Lesson 8 — capstone: two full designs
//
// Content uses the `md` tag from ../md.js: like String.raw, plus \` becomes a backtick.
// Code/diagram blocks use ~~~ fences. NEVER write the dollar-brace sequence in content.

import { md } from '../md.js'

export default {
  id: 'sd-l8',
  title: 'SD.8 Two full designs — a news feed and an AI assistant',
  subtitle:
    'You know the parts: APIs, databases, caches, queues, redundancy. Interviews and design reviews never ask about parts; they hand you a product and forty-five minutes. This capstone runs the six-step method end to end, twice, on a news feed and a RAG support assistant, with every box earned by a number.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You have spent seven lessons collecting parts. You can estimate requests per second in your head. You
know when a cache pays for itself, why a queue absorbs a spike, how replication buys availability, and
what p99 means.

Now picture the interview. The interviewer says one sentence — *"Design the home timeline for a
Twitter-style app"* — and then goes quiet for forty-five minutes.

Nobody asks *"what is a cache?"* The question hidden inside that sentence is harder: **which** parts,
arranged **how**, because of **which numbers**? A cache in front of what, holding what, sized how? A
queue between which two steps, and why there and not elsewhere? Knowing every part and still producing a
design that falls over is not only possible — it's the most common way strong engineers fail.

The skill that's left is **composition**. It can't be memorised; it can only be practised. So this
lesson does exactly that — twice, all six steps, with real arithmetic:

- **Design A — a news feed.** A classic interview problem whose whole design hinges on one decision,
  and that decision falls out of a multiplication.
- **Design B — an AI support assistant.** The shape of system you'll build as an AI engineer: a language
  model answering customer questions from a company's help articles. Different parts, same method.

As you read, keep the SD.1 rule in front of you: **every box must point at a requirement or a number.**
Whenever a component appears, check that you could say *which number put it there*. If you can't, that
box is a guess.

A quick reminder of the method you'll see applied:

~~~text
1. Requirements        what it must do, and how well (scale, latency, availability...)
2. Estimate            users, requests/s, storage, cost
3. API                 the contract
4. Data model          designed for the dominant read
5. High-level design   the boxes, each justified
6. Deep dive           what breaks first, what fails, what we traded away
~~~
`,
    },
    {
      type: 'example',
      title: 'Design A, part 1 — a news feed: requirements, numbers, API, data, and the central decision',
      md: md`
### Step 1 — Requirements (and the clarifying questions that set them)

> **You:** Core scope: users post (text plus optional photo), follow other users, and see a **home
> feed** of recent posts from people they follow. Search, direct messages, and ads are out. OK?
> **Them:** Yes.
>
> **You:** Daily active users?  **Them:** 200 million.
>
> **You:** Is the feed ranked, or newest-first?  **Them:** Start newest-first; mention ranking.
>
> **You:** How fresh must it be? If I post, may my followers see it a few seconds later?
> **Them:** A few seconds is fine. Opening the feed must feel instant.
>
> **You:** Are follower counts skewed — do some accounts have tens of millions of followers?
> **Them:** Yes. The biggest has about 50 million.

Functional: post, follow, read home feed (paginated). Non-functional: feed load **p99 under 200 ms**;
new posts visible to followers within **~5 seconds**; high availability (a feed that's down is the
product being down); posts are durable; **eventual consistency is acceptable** — that last one is the
permission slip that lets us use queues.

Notice that the final clarifying question is the one that matters most. You'll see why in ten minutes.

### Step 2 — Estimate

Assumptions, said out loud: each daily user posts **0.5** times a day and opens their feed **10** times
a day; the average user has **200 followers** (and so, on average, follows 200 accounts).

| quantity | arithmetic | result |
|---|---|---|
| posts per day | $2 \times 10^8 \times 0.5$ | $10^8$ |
| posts per second | $10^8 \div 10^5$ | **~1,000/s** (peak ~3,000/s) |
| feed reads per day | $2 \times 10^8 \times 10$ | $2 \times 10^9$ |
| feed reads per second | $2 \times 10^9 \div 10^5$ | **~20,000/s** (peak ~60,000/s) |
| post storage per day | $10^8 \times 1$ KB (text + metadata) | 100 GB/day → **~36.5 TB/year** |
| photos | stored separately | object storage + CDN (SD.5), not the database |

The ratio to remember: **20 feed reads for every post.** Hold onto it.

### Step 3 — API

~~~text
POST /posts                 { text, media_id? }       -> 201 { post_id }
POST /users/{id}/follow                               -> 204
GET  /feed?cursor=...&limit=20                        -> { posts: [...], next_cursor }
~~~

The feed uses **cursor pagination** (SD.3): the cursor is "the id of the last post you saw," so new posts
arriving at the top don't shift page 2 and show you duplicates.

### Step 4 — Data model, designed for the read

~~~text
users     (user_id, name, ...)
follows   (follower_id, followee_id, created_at)
            index by followee_id -> "who follows X?"   (needed to deliver X's post)
            index by follower_id -> "whom does X follow?" (needed to assemble X's feed)
posts     (post_id, author_id, created_at, text, media_url)   sharded by post_id
~~~

One new term: a **time-sortable id**. If \`post_id\` is built as *timestamp + machine number + sequence
counter* (the "Snowflake" scheme), then sorting ids sorts posts by time — and any server can mint ids
without asking a central counter. That makes "newest first" and cursor pagination nearly free.

The dominant read is \`GET /feed\` at 20,000/s. What does it need? *"The 20 newest posts from the ~200
accounts I follow."* There are exactly two ways to answer that — and choosing between them is the
entire design.

### The central decision — when do you do the work?

Delivering one post to many followers' feeds is called **fan-out** (one input, many outputs, like a
fan's blades spreading from a hub).

**Fan-out on read ("pull").** Store each post once. When I open my feed, look up the 200 accounts I
follow, fetch each one's recent posts, merge them by time, return the top 20. Writes are cheap; reads do
the work.

**Fan-out on write ("push").** Give every user a precomputed feed — a list of post ids, newest first,
kept in a cache. When someone posts, look up their followers and **append the post id to each follower's
list**. Reading my feed is then one lookup of one list. Reads are cheap; writes do the work.

Now let the numbers choose:

| | pull (fan-out on read) | push (fan-out on write) |
|---|---|---|
| work per post | 1 write | 200 appends (one per follower) |
| work per feed open | ~200 reads + a merge | 1 read |
| total per second | $20{,}000 \times 200 =$ **4,000,000 reads/s** | $1{,}000 \times 200 =$ **200,000 appends/s** |
| feed latency | the slowest of 200 lookups (tail latency, SD.1) | one cache read — easily under 200 ms |

Push does **20× less work** — and that 20 is not a coincidence. With average followers equal to average
followees, pull costs $\text{reads} \times 200$ and push costs $\text{posts} \times 200$, so the ratio is
just reads ÷ posts = 20. **Whichever side of the system is busier should be the side that does less
work.** Reads dominate, so we pay at write time. The p99 requirement agrees: a feed that must wait on
200 separate lookups is only as fast as the slowest of the 200.

The **write amplification** — how many writes one logical action turns into — is 200 for the average
user. Each append is a tiny in-memory operation, so 200,000/s (600,000/s at peak) is a modest cache
cluster's worth of work. Push looks like the answer.

It looks like the answer for the *average* user.
`,
    },
    {
      type: 'ponder',
      question: md`Before reading on: under pure fan-out-on-write, an account with **50 million
followers** posts once. How many feed writes does that single post create? Compare it to the whole
system's average fan-out rate of 200,000 appends per second — and predict what the followers, and
everyone *else* posting at the same moment, actually experience.`,
      answer: md`**50 million writes** — one per follower — from one post.

Compare: the entire system averages 200,000 appends per second. So this one post equals
$5 \times 10^7 \div 2 \times 10^5 = 250$ **seconds of the whole fleet's average fan-out capacity.** If the
fan-out workers could somehow run at 1 million appends/s for this post alone, it would still take 50
seconds.

The consequences:

1. **The freshness requirement breaks.** We promised ~5 seconds; the last followers see the post minutes
   later. For a celebrity announcing breaking news, that's the product visibly failing.
2. **Everyone else's posts queue behind it.** Fan-out jobs sit in a shared queue, so an ordinary user who
   posts one second later waits behind 50 million appends. One account degrades the whole system —
   classic head-of-line blocking.
3. **It's wasteful.** 50 million copies of the same id ($5 \times 10^7 \times 16$ bytes = 800 MB of cache
   for one post), most going to followers who won't open the app before it scrolls out of their feed.
   Post ten times a day and that's 500 million appends from one person.

The lesson is SD.2's warning about averages: **"200 followers on average" hides a distribution with a
very long tail**, and the design must survive the tail, not just the mean. This is the famous
**celebrity problem** (also called the hot-key or hot-user problem).`,
    },
    {
      type: 'example',
      title: 'Design A, part 2 — the hybrid, the boxes, and the deep dive',
      md: md`
### The fix: push for most, pull for celebrities, merge at read

Here's the key observation, and it's worth deriving rather than memorising. For a celebrity, the two
strategies cost very different *kinds* of work:

- **Push** means 50 million writes to **50 million different keys**. No trick makes that cheaper; every
  one must actually happen.
- **Pull** means millions of followers reading **the same small object** — the celebrity's list of recent
  posts. Reading one hot key millions of times is exactly what a cache is best at (SD.5): it lives in
  memory, it can be copied to several cache nodes, and it can even be held in each app server's local
  memory for a few seconds.

So the hybrid:

1. Accounts below a threshold (say **1 million followers**, a tunable number) use **push**.
2. Accounts above it don't fan out. Their posts go only into their own **outbox** — a short cached list
   of their recent post ids.
3. On \`GET /feed\`, read my precomputed list (1 read), plus the outboxes of the celebrities I follow
   (typically a handful — say 5, all hot in cache), and **merge by post id** (ids are time-sortable, so the
   merge is a simple sorted merge).

A feed open now costs ~6 cache reads instead of 200, and no single post can ever trigger 50 million
writes. The threshold is a dial: lower it and reads get a bit more expensive; raise it and write bursts
get bigger.

### Step 5 — High-level design

~~~text
                         +-------------------+
 client --POST /posts--> |   Post service    | --(1) write--> [ Posts DB, sharded by post_id ]
                         +-------------------+
                                  | (2) event "post_created" (only if author < 1M followers)
                                  v
                         [   Fan-out queue   ]
                                  |
                         +-------------------+   reads followers in batches of ~1,000
                         | Fan-out workers   | --------------------> [ Follows DB ]
                         +-------------------+
                                  | (3) append post_id, trim to 500
                                  v
                    [ Feed cache: user_id -> list of post_ids ]   (in-memory, replicated)

 client --GET /feed---> +-------------------+
                        |   Feed service    | --> Feed cache (my list)
                        +-------------------+ --> Celebrity outbox cache (hot, replicated)
                                  |            --> merge -> top 20 ids
                                  |            --> Post cache multi-get (hydrate ids -> posts)
                                  v
                               response        photos served by CDN from object storage
~~~

Every box, with its reason:

| box | the number or requirement that put it there |
|---|---|
| precomputed feed cache | 20 reads per post and p99 < 200 ms → do the work at write time |
| fan-out **queue** | posting must return instantly; the 200 appends can finish within seconds ("a few seconds is fine") — and a queue absorbs the 3× peak (SD.6) |
| celebrity outbox + merge | a 50M-follower account would create 250 s of fleet-wide fan-out per post |
| posts DB sharded by post_id | 36.5 TB/year exceeds one machine (SD.4) |
| post cache for hydration | 20,000 feed opens/s × 20 posts = 400,000 post lookups/s; popularity is skewed, so a cache absorbs most of it |
| CDN + object storage for photos | bytes, not rows; served close to users |

**Feed cache size.** Keep the newest 500 entries per user, 16 bytes each (8-byte post id + 8 bytes of
author id/metadata), for the 200 million daily users:

$$2 \times 10^8 \times 500 \times 16 \text{ bytes} = 1.6 \times 10^{12} \text{ bytes} = 1.6 \text{ TB}$$

That's ~16 machines at 100 GB of RAM each, ~48 with 3 replicas. Affordable — *because* we store ids, not
posts. Users who haven't logged in for a month get no precomputed feed at all; if they return, we build
theirs once by pull. (Paying for idle users' feeds would multiply this cost for nothing.)

**Ranking, briefly.** Real feeds aren't newest-first. The merged list becomes the **candidates** — a few
hundred posts — and a ranking model scores each (predicted chance you'll engage) and reorders them.
Architecturally, that's one more step between merge and hydrate, with its own latency budget. The design
above is the *candidate generation* half; ranking is where machine learning enters.

### Step 6 — Deep dive: what breaks, what fails, what we traded

- **A fan-out worker crashes halfway through 50,000 followers.** The queue redelivers the job (SD.6), so
  some followers get the append twice. Fix: make appends **idempotent** — store the feed as a set sorted
  by post id, so adding the same id twice is a no-op.
- **A feed-cache node dies.** The feed is *derived* data, not the source of truth — rebuild affected users
  by pull on their next request (slower once, then fast). Replicas make even that rare (SD.7).
- **A post is deleted.** Don't chase 200 (or 900,000) copies of its id. The hydration step checks each
  post and drops deleted ones. The cheap fix lives at read time.
- **Hot celebrity post, 10 million views in a minute.** A hot key. Replicate that outbox entry across
  cache nodes and hold it in app-server memory for a few seconds.
- **Unfollow.** Old posts from that account linger in the precomputed list; filter at read time against
  the follow list, or accept a little staleness.

**Tradeoffs, said out loud:**
1. We traded **storage and write work** (1.6 TB of RAM, 200,000 appends/s) for **fast, predictable
   reads** — correct because reads outnumber posts 20 to 1.
2. We traded **immediate consistency** for **seconds of delay** — allowed by the requirement.
3. We traded **simplicity** for the hybrid's two code paths — forced by the 50M-follower tail.

That last sentence is the shape of a staff-level answer: not "I used a hybrid," but "the tail of the
follower distribution forced a hybrid, here is the number, and here is the dial."
`,
    },
    {
      type: 'text',
      md: md`
## From feeds to AI products: five new terms

Design B has the same six steps but some new parts. Each is defined here before it is used.

**Large language model (LLM).** A model that takes text in and generates text out, one small piece at a
time. You call it over an API, you pay per use, and it is — by far — the slowest and most expensive
step in any system that uses it.

**Token.** The unit an LLM reads and writes: roughly ¾ of an English word (so ~1,300 tokens per 1,000
words). Prices and speeds are quoted in tokens: *input* tokens (the prompt you send) and *output*
tokens (the answer it writes), with output usually several times pricier per token. An LLM's
**context window** is the maximum number of tokens one call can take in.

**Hallucination.** When an LLM produces fluent, confident text that isn't true. It happens because the
model is trained to produce *plausible* text, and plausible is not the same as correct.

**RAG — retrieval-augmented generation.** Instead of hoping the model memorised your company's refund
policy, you **retrieve** the relevant help-article passages first and paste them into the prompt: *"Answer
using only these passages."* The model's job shrinks from *knowing* to *reading* — which it is far better at.

**Embeddings — meaning as coordinates.** This is the part that makes retrieval work. An **embedding
model** turns a piece of text into a list of numbers — say 1,024 of them. Treat that list as the
coordinates of an arrow in a 1,024-dimensional space. The model is trained so that **texts with similar
meaning point in similar directions**: "How do I get my money back?" and "Refund policy for annual plans"
land near each other even though they share almost no words, while "Reset my password" points elsewhere.

~~~text
         "refund policy" chunk
               ^   question: "can I get my money back?"
               |  /
               | /   small angle  -> similar meaning -> retrieve
               |/
               +--------------------> "password reset" chunk
                    large angle     -> unrelated     -> skip
~~~

Closeness is measured by the **angle** between arrows — **cosine similarity**, which is 1 for the same
direction, 0 for unrelated (a right angle). Retrieval is then **nearest-neighbour search**: embed the
question, find the stored arrows with the smallest angle to it. A **vector index** is the data structure
that stores the arrows and answers "nearest neighbours" quickly; at very large scale it uses
*approximate* nearest-neighbour methods that trade a little accuracy for a lot of speed.

One more: articles are split into **chunks** — passages of a few hundred tokens — before embedding,
because a whole article's arrow is a blurry average of many topics, and because we want to paste the
relevant *paragraph* into the prompt, not the entire article.
`,
    },
    {
      type: 'example',
      title: 'Design B, part 1 — an AI support assistant: requirements, numbers, pipelines, latency budget',
      md: md`
### Step 1 — Requirements

> **You:** Customers type questions in a chat widget; the assistant answers from our **20,000 help
> articles** and cites them. Account actions (issuing refunds, changing plans) are out of scope for v1?
> **Them:** Yes, answers only.
>
> **You:** Volume?  **Them:** About 50,000 questions a day.
>
> **You:** Latency?  **Them:** It must feel responsive. Full answer p95 under ~5 seconds.
>
> **You:** Budget?  **Them:** LLM spend must stay under \$10,000 a month.
>
> **You:** How often do articles change, and how fast must changes show up?
> **Them:** A few hundred edits a day; within an hour is fine.
>
> **You:** If the docs don't cover a question?  **Them:** Say so and hand off to a human. Never invent policy.

Functional: answer questions grounded in help articles, with **citations** (links to the articles used);
refuse and escalate when the docs don't cover it; keep the index fresh. Non-functional: first words on
screen within ~1.5 s, **full answer p95 under 5 s**, **cost under \$10,000/month**, and **faithfulness** —
answers must be supported by the retrieved text. That last requirement is new; classic systems never had
to worry that a component would *make things up*.

### Step 2 — Estimate

**Traffic.** $50{,}000 \div 10^5 =$ **0.5 questions/s**, maybe 5/s during an outage when everyone asks at
once. That's tiny. Pause on it: *this system is not throughput-bound.* One app server handles it. The
numbers are already telling you where the design effort goes — **latency, cost, and correctness**, not
scale.

**Corpus.** 20,000 articles × ~2,000 tokens = **40 million tokens**. Chunked at ~500 tokens: **80,000
chunks**.

**Index size.** 80,000 chunks × 1,024 numbers × 4 bytes = 327,680,000 bytes ≈ **330 MB**. That fits in
the memory of one ordinary machine. So: **no distributed vector database is needed**; an in-memory index,
or a vector column in the Postgres you already run, is plenty. (Even brute force — comparing against all
80,000 arrows — is about 80 million multiply-adds, tens of milliseconds.) An engineer who proposes a
sharded vector cluster here has drawn a box no number asked for.

**Ingestion cost.** Embedding 40M tokens at an illustrative \$0.02 per million tokens = **\$0.80** for the
whole corpus. Re-embedding everything is essentially free — which means we never need clever partial-update
schemes to save embedding cost.

**Tokens per question.** System instructions about 500 + 5 retrieved chunks × 500 = 2,500 + the question about 50 →
**~3,000 input tokens**; the answer ~**300 output tokens**.

**LLM cost** (illustrative prices, *not* any real vendor's current list — always check the price sheet):
a capable model at \$3 per million input tokens and \$15 per million output tokens.

| item | arithmetic | cost |
|---|---|---|
| input, per question | 3,000 × \$3 / 10⁶ | \$0.009 |
| output, per question | 300 × \$15 / 10⁶ | \$0.0045 |
| **per question** | | **\$0.0135** |
| per day | 50,000 × \$0.0135 | \$675 |
| **per month** (30 days) | 30 × \$675 | **\$20,250** |

**\$20,250 is double the \$10,000 ceiling.** The estimate just created a requirement for the deep dive:
cost controls are not optional.

### Step 3 — API

~~~text
POST /ask   { conversation_id, question }
            -> text/event-stream (SSE, SD.3):
                 event: token     data: "To request a refund, "
                 event: token     data: "open Billing > ..."
                 event: citations data: [{article_id, title, url}, ...]
                 event: done
POST /feedback { answer_id, helpful: true|false }
~~~

**Streaming** with server-sent events is chosen because generation takes seconds (see the latency
table) — streaming turns a 4-second wait into words appearing after 1 second. The feedback endpoint
exists because we'll need real-world quality signal (step 6).

### Step 4 — Data model

~~~text
articles  (article_id, title, url, body, updated_at)          source of truth (existing CMS)
chunks    (chunk_id, article_id, position, text, embedding[1024], article_version)
answers   (answer_id, question, chunk_ids_used, answer_text, model, latency_ms, cost, feedback)
~~~

The dominant read is "nearest chunks to this question vector," so \`chunks\` lives in the vector index.
\`answers\` is a log — it becomes the raw material for evaluation and cost tracking.

### Step 5 — High-level design: two paths

~~~text
 INGESTION PATH (offline, asynchronous)

 [ Help-center CMS ] --"article_updated" event--> [ Ingestion queue ]
                                                        |
                                                        v
                                          +---------------------------+
                                          | Ingestion worker          |
                                          |  1. fetch article         |
                                          |  2. split into ~500-token |
                                          |     chunks                |
                                          |  3. embed each chunk      | --> embedding model API
                                          |  4. replace this article's|
                                          |     chunks in the index   |
                                          +---------------------------+
                                                        |
                                                        v
                                             [ Vector index (~330 MB) ]

 QUERY PATH (online, latency-critical)

 client --POST /ask--> [ Answer service ]
                          1. answer cache lookup (exact/near-duplicate question)
                          2. embed question                  --> embedding model API
                          3. top-k search (k=20)             --> vector index
                          4. rerank 20 -> best 5; if best similarity < threshold: refuse + hand off
                          5. build prompt: rules + 5 chunks (with ids) + question
                          6. call LLM, stream tokens         --> LLM API
                          7. check every citation points at a retrieved chunk
                          8. log to answers table
              <-- SSE stream: tokens ... citations ... done
~~~

A **reranker** (step 4) is a second, slower but more accurate model that reads the question and each of
the 20 candidates together and re-scores them. Retrieval by angle is fast but coarse; reranking 20
candidates is cheap and sharply improves which 5 reach the prompt.

### The latency budget

A **latency budget** splits the end-to-end target into per-step allowances that must sum to less than
it. Typical p95 figures for this design (illustrative, but realistic in shape):

| step | p95 time |
|---|---|
| client ↔ server network | 50 ms |
| embed the question | 30 ms |
| vector search (in memory) | 20 ms |
| rerank 20 candidates | 100 ms |
| build prompt | 5 ms |
| LLM time to first token | 800 ms |
| LLM generation: 300 tokens at 80 tokens/s | 3,750 ms |
| **total to last token** | **4,755 ms** |
| **time to first visible word** (everything before generation) | **~1,005 ms** |

Check the sum: 50 + 30 + 20 + 100 + 5 = 205; + 800 = 1,005; + 3,750 = 4,755 ms. Under 5 s — but with
only 245 ms of headroom, which is uncomfortably thin for a p95.
`,
    },
    {
      type: 'ponder',
      question: md`Look at the latency budget before reading on. Which **single step** dominates, roughly
what fraction of the total is it, and what would you actually do about it? Also: an engineer proposes
spending a sprint replacing the vector index with a faster one. What do you tell them?`,
      answer: md`**LLM generation dominates:** 3,750 of 4,755 ms ≈ **79%** of the total. Add time-to-first-token
and the LLM is 4,550 ms ≈ **96%**. Everything classic engineering usually optimises — network, search,
prompt building — totals about 205 ms.

**What to do, in order of leverage:**

1. **Stream** (already in the design). It doesn't shorten the total, but it moves perceived latency from
   4.8 s to ~1 s — users start reading while the rest arrives. This is why SSE is in the API.
2. **Generate fewer tokens.** Generation time is proportional to output length. Instruct concise answers
   (support answers rarely need 300 tokens); capping at 150 tokens saves ~1,875 ms by itself.
3. **Use a faster (smaller) model where it's good enough** — which is also the cost fix (next example).
4. **Skip the LLM entirely on a cache hit** for repeated questions — 0 ms of generation.

**To the vector-index engineer:** the search takes 20 ms of 4,755 — about 0.4%. Making it infinitely fast
saves at most 20 ms. *Always optimise the step that dominates the budget* — that's the entire point of
writing the budget down. The sprint belongs on answer length, model routing, or caching.`,
    },
    {
      type: 'example',
      title: 'Design B, part 2 — caching, freshness, and getting under the cost ceiling',
      md: md`
### Caching — two different kinds

**Answer caching.** Support questions repeat heavily ("how do I reset my password" arrives in dozens of
phrasings every hour). Cache the final answer keyed by the normalised question — or, more powerfully, by
the question's *embedding*: if a new question's arrow is within a very small angle of a cached one, reuse
that answer. Assume a **30% hit rate**. Risk: a near-match that differs in one crucial word ("cancel" vs
"pause" my subscription), so keep the similarity threshold strict and **invalidate cached answers whose
source articles change**.

**Prompt caching.** Many LLM APIs can cache the unchanging *beginning* of a prompt (the long system
instructions) so repeated calls pay a reduced price and get a faster first token for that part. The design
consequence: put the fixed instructions **first** and the variable chunks and question **last**, so the
shared prefix is as long as possible.

### Freshness — re-ingestion via a queue (SD.6)

Articles change a few hundred times a day, and the requirement is "within an hour." So the CMS emits an
\`article_updated\` event onto a queue, and the ingestion worker re-chunks and re-embeds **that article
only**, then atomically swaps its old chunks for the new ones (tagged with \`article_version\`, so a search
never sees half-old, half-new chunks). Why a queue rather than re-embedding inline on save:

- editors saving an article shouldn't wait on an embedding API;
- if the embedding API is down, events wait in the queue and are retried, instead of being lost;
- a bulk import of 5,000 articles becomes a backlog the worker drains at its own pace.

Deleted articles must remove their chunks — otherwise the assistant keeps quoting a retired policy. And
because the whole corpus costs \$0.80 to embed, a **nightly full rebuild** is a cheap safety net that
catches anything the event path missed.

### Getting under \$10,000

Start: **\$20,250/month** at 50,000 questions/day. Two controls:

1. **Answer cache, 30% hit rate** → LLM calls drop to 35,000/day.
2. **Model routing.** A cheap classifier (or a small model) labels each question easy or hard. Easy ones —
   say **60%** — go to a small model at, illustratively, **one tenth** the price: \$0.00135 per question.

| slice | questions/day | cost each | cost/day |
|---|---|---|---|
| cache hits | 15,000 | ~\$0 | ~\$0 |
| small model (60% of 35,000) | 21,000 | \$0.00135 | \$28.35 |
| large model (40% of 35,000) | 14,000 | \$0.0135 | \$189.00 |
| **total** | 50,000 | | **\$217.35/day** |

\$217.35 × 30 ≈ **\$6,520/month** — under the ceiling with room for growth, and before counting prompt
caching's savings. Every lever came from the estimate: the cost table told us *where the money goes*
(input tokens and the large model), so that is where we pulled.

The trade: routing means some "easy" questions are misjudged and answered by the weaker model. That's
measurable — which is exactly what the evaluation set in the next section is for.
`,
    },
    {
      type: 'ponder',
      question: md`A customer asks, *"Do you offer a student discount?"* No help article mentions student
discounts. The assistant replies confidently: *"Yes! Students get 20% off with a valid .edu email."* Where
exactly in the query path did this go wrong, and what is the **design** fix — not "use a smarter model"?`,
      answer: md`Trace it step by step:

1. **Retrieval still returned 5 chunks.** Nearest-neighbour search *always* returns the k nearest arrows —
   even when none is actually close. The "nearest" chunks were probably about pricing or discounts in
   general: related-sounding, but not answering the question.
2. **The prompt didn't allow "I don't know."** Given pricing passages and a question, the model did what
   it's trained to do — produce the most plausible continuation. "Students get 20% off" is extremely
   plausible text. That's a hallucination, made worse by chunks that looked relevant.
3. **Nothing checked the answer against the sources.** The claim appeared in no retrieved chunk, and no
   step verified that.

**The design fixes — at three layers:**

- **Before the LLM: a relevance gate.** If the best reranked chunk scores below a threshold (tuned on the
  evaluation set), don't call the LLM at all: *"I couldn't find this in our help center — connecting you
  with a person."* This also saves the cost of the call.
- **In the prompt: permission and obligation.** *"Answer only from the passages below. Cite the passage id
  for every claim. If the passages don't answer the question, say so."*
- **After the LLM: verify.** Every citation must point at a chunk that was actually retrieved; answers
  with uncited claims or invented ids are blocked or downgraded to the hand-off message.

The deeper point: in an AI system, **"no answer" must be a designed output, not a failure.** Classic
systems return 404; a retrieval system must be built to return *"I don't know"* — because its default
behaviour, if you don't, is to guess fluently.`,
    },
    {
      type: 'text',
      md: md`
## Design B, step 6 — the deep dive for an AI system

Classic failure modes still apply (the LLM API times out → retry once, then fall back to "here are the
most relevant articles" as plain links; the vector index machine dies → a replica, and the index can be
rebuilt from the database in minutes for \$0.80). But AI systems add failures classic systems never had —
**the system is up, fast, and wrong**:

| failure | what it looks like | mitigation |
|---|---|---|
| retrieval misses the right chunk | the answer exists in the docs, but a paraphrase or odd wording lands elsewhere | rerank a larger candidate set; hybrid search (embedding + keyword match for product names and error codes); better chunking (keep headings with their paragraphs) |
| unsupported confident answer | fluent text not found in any source | relevance gate, cite-or-refuse prompt, citation verification (previous ponder) |
| stale answer | article changed, cached answer or old chunks still served | event-driven re-ingestion, cache invalidation by article, nightly rebuild |
| prompt injection | a customer writes "ignore your instructions and…" | treat user text as data, never as instructions; the assistant has no account actions in v1, so the blast radius is small — a deliberate scoping choice |

## Evaluation — how you know a change helped

With classic code, a test passes or fails. With an LLM, "is this answer good?" is fuzzy — so teams that
skip evaluation end up changing prompts by gut feeling and shipping regressions they can't see.

The fix is a **golden set**: a few hundred real customer questions, each with the expected answer and the
article(s) that should be cited — including questions the docs *don't* cover, whose correct answer is a
refusal. Measure on every change:

- **retrieval hit rate** — did the right article appear in the top 5?
- **answer correctness and faithfulness** — graded by people, or by an LLM grader that is itself checked
  against human grades;
- **refusal correctness** — refused when it should, and *only* when it should;
- **p95 latency and cost per question.**

The discipline: **run the golden set before and after every change** — new chunk size, new prompt, new
model, new routing threshold. "The small model is good enough for 60% of questions" stops being a hope
and becomes a number. Production feedback (thumbs down, human hand-offs) feeds new questions into the
golden set, so it grows exactly where the system is weak.

## Design B's tradeoffs, said out loud

1. **Cost vs quality:** answer caching plus routing 60% of LLM calls to a smaller model cut cost ~3× at some quality risk —
   accepted *because* the golden set measures that risk.
2. **Helpfulness vs safety:** a strict relevance gate refuses some answerable questions; a loose one lets
   hallucinations through. The threshold is a dial, set by evaluation, not by feel.
3. **Freshness vs simplicity:** event-driven re-ingestion is more machinery than a nightly rebuild alone,
   bought by the one-hour freshness requirement.
4. **Simplicity where the numbers allow it:** one in-memory 330 MB index and one app server — because 0.5
   questions/s and 80,000 chunks don't justify more. Knowing when *not* to scale is as much a design
   skill as knowing how.

## Composition, seen from above

Put the two designs side by side and the method shows through:

| | news feed | AI assistant |
|---|---|---|
| the number that shaped everything | 20 reads per post; a 50M-follower tail | 96% of latency and nearly all cost in the LLM |
| where the effort went | write-path fan-out and its tail | latency, cost, and correctness |
| cache holds | precomputed feeds, hot outboxes | repeated answers, prompt prefixes |
| queue decouples | posting from delivery | article edits from re-embedding |
| the hard failure | a hot key flooding the write path | a healthy system confidently wrong |

Same parts, entirely different arrangements — because the numbers were different. That is composition.

## What you now own

**From this lesson:**
1. **Fan-out on write vs on read**, chosen by the ratio of reads to writes — the busier side should do
   less work — and the **celebrity problem**, where one 50M-follower account breaks pure push, solved by a
   **hybrid** that pushes for most accounts and pulls hot outboxes at read time.
2. **RAG end to end:** chunk, embed (meaning as coordinates, nearness as angle), index; then embed the
   question, retrieve, rerank, prompt, stream with citations.
3. **The latency budget** — write it down, sum it, and optimise the step that dominates (in AI systems,
   almost always generation).
4. **AI-specific design:** a designed "I don't know," citation checks, a golden-set evaluation run before
   and after every change, and cost controls (caching, model routing) derived from a token-cost estimate.

**From the whole System Design section:** a method (SD.1) that turns vague products into numbers (SD.2);
contracts and transports (SD.3); storage designed for the dominant read (SD.4); caches for skewed reads
(SD.5); queues to decouple and absorb (SD.6); scaling and redundancy for when things grow and break
(SD.7); and now composition — arranging all of them for one specific set of numbers, and saying the
tradeoffs out loud.

**Your next step — do it now, while the method is warm:** open the **Architecture Design** track in the
sidebar. It's adaptive: it generates design challenges tuned to your current level and grades your
reasoning, not your boxes. Take your first challenge today, on paper, all six steps — and for every box you
draw, write the number that put it there.
`,
    },
  ],
  questions: [
    {
      id: 'sd-l8-q1',
      kind: 'mcq',
      prompt: md`In a news feed where users open their feed 20 times for every post created, and the average
user both has and follows about 200 accounts, why is **fan-out on write** the better default?`,
      options: [
        md`Because writes are always cheaper than reads in any database`,
        md`Because total work is posts × 200 for push versus feed-opens × 200 for pull, and feed opens outnumber posts 20 to 1 — so push does ~20× less work and makes each read a single fast lookup`,
        md`Because fan-out on write guarantees that every follower sees every post instantly`,
        md`Because fan-out on read cannot be cached at all`,
      ],
      answer: 1,
      explain: md`The decision falls out of the ratio: whichever side is busier should do less work, and
reads dominate 20:1. Push also turns each read into one cache lookup, which is what the p99 target needs.
Option A tempts because appends are cheap — but push does *more* writes, not cheaper ones; it wins on
totals. Option C is false: fan-out goes through a queue and takes seconds, which is acceptable only
because the requirements allowed eventual consistency. Option D tempts because pull is slower, but pull
reads are very cacheable — that's exactly why the hybrid pulls celebrity outboxes.`,
    },
    {
      id: 'sd-l8-q2',
      kind: 'numeric',
      prompt: md`A social app creates **50 million** posts per day, and the average poster has **150**
followers. Under pure fan-out on write, roughly how many **feed appends per second** does the system
perform on average? (Use one day ≈ 100,000 seconds.)`,
      answer: 75000,
      tolerance: 8000,
      explain: md`Appends per day: $5 \times 10^7 \times 150 = 7.5 \times 10^9$. Per second:
$7.5 \times 10^9 \div 10^5 = 75{,}000$ appends/s on average — perhaps 225,000/s at a 3× peak. That's the
write amplification made concrete: 500 posts/s become 75,000 writes/s. Manageable for an in-memory cache
cluster, *as long as the average is the whole story* — which it isn't, because a single account with
tens of millions of followers can produce more appends in one post than the fleet does in minutes.`,
    },
    {
      id: 'sd-l8-q3',
      kind: 'mcq',
      prompt: md`In the hybrid feed design, what happens when an account with 40 million followers posts?`,
      options: [
        md`The post is fanned out to all 40 million feeds, but through a higher-priority queue`,
        md`The post is written only to the account's own cached outbox; each follower's feed request merges that outbox into their precomputed feed at read time`,
        md`The post is fanned out only to followers who are currently online`,
        md`The post is rejected until the fan-out queue has capacity`,
      ],
      answer: 1,
      explain: md`Celebrity posts are pulled, not pushed: one write to a hot outbox that millions of readers
hit as the *same* key — perfect for caching and replication. Option A tempts because priority queues are a
real tool, but prioritising 40 million writes doesn't remove them; it just delays everyone else. Option C
sounds clever (and some systems do variants), but offline followers still need the post when they return,
and "who is online" changes every second — it reduces but doesn't remove the burst. Option D violates the
basic requirement that posting works.`,
    },
    {
      id: 'sd-l8-q4',
      kind: 'numeric',
      prompt: md`A RAG assistant handles **20,000** questions a day. Each question uses **5,000 input tokens**
and **400 output tokens**. Using illustrative prices of **\$3 per million input tokens** and **\$15 per
million output tokens**, what is the LLM cost per **month** (30 days), in dollars?`,
      answer: 12600,
      tolerance: 700,
      explain: md`Per question: input $5{,}000 \times 3 / 10^6 = 0.015$ dollars; output
$400 \times 15 / 10^6 = 0.006$ dollars; total \$0.021. Per day: 20,000 × \$0.021 = \$420. Per month: 30 ×
\$420 = **\$12,600**. Notice where the money goes: input is 0.015 of the 0.021 — about 71% — because five
retrieved chunks make the prompt long. So the first cost levers are fewer or shorter chunks, prompt
caching, answer caching, and routing easy questions to a cheaper model.`,
    },
    {
      id: 'sd-l8-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** (a) Let a system have $P$ posts/day and $R$ feed opens/day, and let
the average user have $F$ followers and follow $F$ accounts. Derive the total daily work for fan-out on
write and fan-out on read, and the condition under which push is cheaper. (b) Now consider **one**
account with $f$ followers that posts $p$ times a day, where each follower opens their feed $r$ times a
day. Compute push work and pull work *for that account's posts*. (c) Your result in (b) should show that
the push/pull comparison for one account doesn't depend on $f$ at all. So why does the celebrity problem
exist? Explain what the per-count comparison misses.`,
      rubric: md`**(a)** Push: every post is appended to $F$ feeds → $P \times F$ writes/day; reads are 1 per
open → $R$. Pull: posts cost 1 write each → $P$; each feed open reads $F$ followed accounts → $R \times F$
reads/day. Dominant terms: push ≈ $PF$, pull ≈ $RF$. **Push is cheaper when $R > P$** — reads outnumber
posts — which is true for almost every social product (20:1 in the lesson).

**(b)** Push: $p \times f$ appends/day. Pull: each of the $f$ followers reads this account's outbox on
each of $r$ opens → $f \times r$ reads/day. Push cheaper iff $p < r$ — $f$ cancels.

**(c)** Counting operations treats every operation as equal cost. They aren't:
- **Push writes go to $f$ different keys** — 50 million distinct feeds. Nothing can be shared or cached;
  every write must physically happen, and they arrive in a **burst** at the moment of posting, which
  breaks the freshness requirement and blocks other users' fan-out jobs (head-of-line blocking).
- **Pull reads all hit one key** — the celebrity's outbox — spread over time as followers open the app. A
  single hot key is the ideal case for a cache: served from memory, replicated, even held locally on app
  servers. Millions of reads of one cached object cost almost nothing.
- Pushes to inactive followers are **wasted**; pulls only happen for people who actually open the app.

So the celebrity problem is about **burstiness, distinct keys, and latency**, not raw counts — which is
why the fix (pull for huge accounts) works.

Full credit: correct algebra for (a) and (b) with the condition stated, *and* in (c) the distinct-keys vs
single-hot-key argument plus the burst/latency point. Restating "celebrities have too many followers"
without resolving why $f$ cancelled earns partial credit only.`,
    },
    {
      id: 'sd-l8-q6',
      kind: 'numeric',
      prompt: md`**Fermi — feed cache size.** A feed service keeps a precomputed feed for **200 million**
active users. Each feed holds the newest **800** entries, and each entry takes **20 bytes** (post id plus a
little metadata). Roughly how many **terabytes** of memory does one copy of the feed cache need?
(1 TB = 10¹² bytes.)`,
      answer: 3.2,
      tolerance: 0.4,
      explain: md`$2 \times 10^8 \times 800 \times 20 = 3.2 \times 10^{12}$ bytes = **3.2 TB** — one copy. With 3
replicas that's ~9.6 TB of RAM, or roughly 100 machines at 100 GB each. Two design conclusions follow at
once: store **ids, not posts** (storing 1 KB posts instead of 20-byte ids would be 50× bigger — 160 TB),
and **don't precompute feeds for inactive users** — build theirs on demand when they return.`,
    },
    {
      id: 'sd-l8-q7',
      kind: 'mcq',
      prompt: md`A help center has 20,000 articles, chunked into 80,000 chunks, each embedded as 1,024 numbers
of 4 bytes. Traffic is about 1 question per second. Which vector-storage choice do the numbers justify?`,
      options: [
        md`A sharded, replicated distributed vector database, because vector search is expensive`,
        md`A single in-memory index (or a vector column in an existing database), because the whole index is ~330 MB and the query rate is tiny`,
        md`No index — send all 20,000 articles to the LLM on every question`,
        md`A CDN, because embeddings are static files`,
      ],
      answer: 1,
      explain: md`$80{,}000 \times 1{,}024 \times 4 \approx 330$ MB fits in one machine's memory, and 1 query/s
is nothing; add a replica for availability and you're done. Option A is the classic box-drawer's
mistake — it sounds like "the scalable choice," but nothing in the numbers asks for it, and it adds
operational cost and failure modes. It *becomes* right at hundreds of millions of vectors. Option C
ignores that 20,000 articles ≈ 40 million tokens, far beyond any context window, and would cost dollars
per question. Option D confuses static files with a searchable index.`,
    },
    {
      id: 'sd-l8-q8',
      kind: 'numeric',
      prompt: md`A RAG query path has these p95 step times: network 40 ms; embed question 25 ms; vector search
15 ms; rerank 120 ms; build prompt 10 ms; LLM time to first token 600 ms; then the LLM generates **250
tokens at 100 tokens per second**. What is the total time, in **milliseconds**, until the last token
arrives?`,
      answer: 3310,
      tolerance: 60,
      explain: md`Generation: 250 ÷ 100 = 2.5 s = 2,500 ms. Everything before it: 40 + 25 + 15 + 120 + 10 + 600
= 810 ms. Total: 810 + 2,500 = **3,310 ms**. The LLM (first token + generation) is 3,100 ms — about 94%.
Time to the first visible word, with streaming, is 810 ms. So streaming handles perceived latency, and
shortening answers or using a faster model handles the total; shaving the 15 ms vector search is
irrelevant.`,
    },
    {
      id: 'sd-l8-q9',
      kind: 'mcq',
      prompt: md`A teammate wants to change the chunk size from 500 to 250 tokens because "smaller chunks are
more precise." What should happen before this ships?`,
      options: [
        md`Try it on a few questions by hand; if the answers look good, ship it`,
        md`Ship it — smaller chunks are a well-known best practice`,
        md`Run the golden-set evaluation before and after: compare retrieval hit rate, answer faithfulness, refusal correctness, latency, and cost`,
        md`Ask the LLM whether 250-token chunks are better`,
      ],
      answer: 2,
      explain: md`LLM systems change in fuzzy ways, so every change needs a before/after measurement on a fixed
set of real questions with expected answers — including ones that should be refused. Option A is the
most tempting because it *feels* like testing, but a handful of hand-picked questions can't reveal a
regression on the other 95% (and you'll unconsciously pick ones that work). Option B trusts folklore:
smaller chunks can lose context (a step separated from its heading) and increase how many chunks you need
per prompt, raising cost. Option D asks a model to guess instead of measuring.`,
    },
    {
      id: 'sd-l8-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "How does a company's AI helper answer questions
about their products without just making stuff up?" Using an analogy you invent (a librarian, an
open-book test, a detective), explain: how it finds the right pages, why it reads them before answering,
why it says where the answer came from, and why sometimes the best answer is "I don't know." No jargon
without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **Finding the right pages** — e.g. an open-book test with a giant book: instead of reading the whole
   book for every question, a very fast helper has sorted every paragraph by *what it's about*, so
   "can I get my money back?" leads straight to the paragraph about refunds even if it never says "money
   back." (Strong answers capture *meaning*, not just matching words — "pages about the same idea sit
   near each other on the shelf.")
2. **Reading before answering** — the AI is like a student who is great at writing sentences but might
   misremember; if it copies from the right page it's far less likely to get it wrong.
3. **Saying where the answer came from** — like writing the page number next to your answer, so a
   teacher (or customer) can check it, and so the AI is forced to use the book rather than guess.
4. **"I don't know"** — if the book doesn't cover it, a good student says so instead of inventing an
   answer that *sounds* right; confident guessing is worse than admitting it, because people believe it.
5. **Jargon audit:** "embedding," "vector," "retrieval," "RAG," "LLM," "tokens," "hallucination,"
   "context window" used without a kid-level translation = partial at best. Using the word *after*
   explaining it in plain terms is fine.`,
    },
    {
      id: 'sd-l8-q11',
      kind: 'written',
      prompt: md`**Full mini-design — a notification system.** Design the service that sends notifications
(mobile push, email, SMS) for an app with **100 million** users, each receiving about **5** notifications a
day, including security codes that must arrive within seconds and marketing messages that can wait. Some
events (a breaking-news alert) go to **all users at once**. Use all six steps; in step 2 do the arithmetic;
in step 5 justify every box with a number or requirement; in step 6 name at least two failure modes and
two tradeoffs.`,
      rubric: md`**1. Requirements.** Functional: other services submit notification requests (user, type,
channel, template data); deliver via push/email/SMS; respect user preferences and opt-outs; (optional)
scheduling. Non-functional: security codes delivered within ~5 s; marketing within hours is fine; **no
duplicate sends** (a double SMS costs money and annoys users); high availability for the critical path;
eventual consistency acceptable elsewhere.

**2. Estimate.** $10^8 \times 5 = 5 \times 10^8$/day → $5 \times 10^8 \div 10^5 =$ **5,000/s** average. The
broadcast case dominates: 100 million notifications for one event — at 50,000/s that's 2,000 s ≈ 33
minutes, so broadcasts must be **rate-shaped** and kept from starving urgent traffic. Storage: a log of
~200 bytes per notification → 100 GB/day.

**3. API.** \`POST /notifications { user_id | segment, type, priority, template_id, data,
idempotency_key }\` → 202 Accepted (asynchronous); \`PUT /users/{id}/preferences\`.

**4. Data model.** preferences (user_id → channels, opt-outs, quiet hours); device tokens (user_id →
push tokens); templates; notification log (id, user, status, idempotency_key) — dominant read is
"preferences + devices for this user," a key lookup.

**5. High-level design.** API → validate + look up preferences → **separate queues per priority and per
channel** (justified by: security codes can't wait behind a 100M broadcast; each channel has a different
provider rate limit) → channel workers call external providers (push service, email provider, SMS
gateway) → log results. A broadcast is expanded by a fan-out job that enqueues in batches at a controlled
rate. Preferences and device tokens cached (5,000/s lookups, rarely change).

**6. Deep dive.** Failures (any two): provider outage → retries with exponential backoff, failover to a
second provider for critical traffic; worker crash mid-send → queue redelivers, so **idempotency keys** in
the log prevent double-sends; invalid/expired device tokens → prune on provider error; broadcast flood →
low-priority queue, rate limiting. Tradeoffs (any two): at-least-once delivery + dedupe vs at-most-once
(risking loss); cost of SMS vs reach (fallback to SMS only for critical types); broadcast speed vs
protecting the urgent path; per-channel queues add complexity for isolation.

Full credit: correct arithmetic including the broadcast time, priority isolation justified by the
security-code requirement, idempotency named for duplicate prevention, and every step-5 box tied to a
number or requirement. A generic "API → queue → workers" with no priorities and no dedupe earns partial
credit.`,
    },
    {
      id: 'sd-l8-q12',
      kind: 'written',
      prompt: md`**Challenge a design proposal.** A colleague says: "Retrieval is complicated. New models have
1-million-token context windows — let's skip the vector index and just put the help center into every
prompt." The help center is **20,000 articles × ~2,000 tokens**, with **50,000 questions a day**, and input
tokens cost an illustrative **\$3 per million**. Respond as you would in a design review: check whether it
fits, estimate the cost per question and per day if you filled a 1M-token context, name at least two
non-cost problems, and say when the colleague's idea *would* be right.`,
      rubric: md`**Does it fit?** $20{,}000 \times 2{,}000 = 4 \times 10^7$ = **40 million tokens** — 40× a 1M
window. It doesn't fit; you would still need to choose which 1M tokens to include, which *is* retrieval.

**Cost if you fill 1M tokens anyway:** $10^6 \times 3 / 10^6 =$ **\$3 per question** in input alone, vs
about \$0.0135 for the RAG design (roughly 220× more). Per day: 50,000 × \$3 = **\$150,000/day** — about \$4.5M a month,
against a \$10,000 ceiling.

**Non-cost problems (any two):** latency — processing a million input tokens takes many seconds before
the first output token, blowing the 5 s p95; quality — models attend less reliably to relevant facts
buried in huge contexts, so accuracy can drop; citations — harder to verify which passage supported a
claim; freshness still requires rebuilding the giant prompt; prompt caching helps cost but not the
40M-token fit problem.

**When it would be right:** a small corpus — say a few dozen articles, tens of thousands of tokens — where
the whole thing fits comfortably, cost per question is low, and prompt caching makes the repeated prefix
cheap. Then skipping retrieval removes an entire failure mode (retrieval misses) and is the *simpler*
design. The numbers decide, not the fashion.

Full credit: the 40M-token arithmetic, the \$3/question and \$150,000/day figures, two distinct non-cost
problems, and a genuine condition under which the proposal wins — delivered as reasoning, not dismissal.`,
    },
  ],
}
