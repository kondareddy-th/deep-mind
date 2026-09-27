// System Design Foundations, Lesson 6 — queues and asynchronous work
//
// Content uses the `md` tag from ../md.js: like String.raw, plus \` becomes a backtick.
// Code/diagram blocks use ~~~ fences. NEVER write the dollar-brace sequence in content.

import { md } from '../md.js'

export default {
  id: 'sd-l6',
  title: 'SD.6 Queues & asynchronous work — decoupling the slow from the fast',
  subtitle:
    'A sign-up that takes 4 seconds and dies whenever the email provider sneezes. The fix is not a faster server; it is refusing to do slow work while the user waits. This lesson teaches queues: how they absorb spikes, isolate failures, why they deliver duplicates, and how to make that harmless.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

A user fills in the sign-up form and presses **Create account**. Here is what your server does before it
answers:

| step | time |
|---|---|
| insert the account row into the database | 50 ms |
| send a welcome email through an email provider | 1,500 ms |
| resize the uploaded avatar into three sizes | 2,000 ms |
| tell the analytics system "a user signed up" | 450 ms |
| **total before the user sees anything** | **4,000 ms** |

Four seconds of spinner. Worse: one Tuesday the email provider has an outage. The email call now fails
after a 30-second timeout — and because it's one step in the sign-up request, **sign-up fails**. Your
product cannot acquire a single new user because a *welcome email* couldn't be sent.

Now ask the question that unlocks this lesson: **which of those four steps did the user actually need
before seeing "Welcome!"?**

Only the first. They need an account to exist. They do not need the email to be in their inbox yet, the
thumbnails to be ready this instant, or the analytics dashboard to have ticked up. Those things must
*happen* — but nobody is waiting for them. The design mistake was doing work nobody was waiting for,
while somebody was waiting.

## Synchronous vs asynchronous

**Synchronous** work happens *inside* the request: the caller waits until it's done, and if it fails,
the request fails. **Asynchronous** work is *promised* inside the request and *done* later, outside it:
the request records "this needs doing" and returns immediately; something else does the work in the
background.

The sorting question for every step of every request:

> **Does the caller need the result of this step in order to get their answer?** If yes, it's
> synchronous. If no — if they only need to know it *will* happen — it can be asynchronous.

Creating the account: the user needs it (they're about to log in). Synchronous. Email, avatar,
analytics: the user needs to know they *will* happen. Asynchronous.

## Where do you put "this needs doing"?

You need a place to write down the promise so that it survives until someone fulfils it. That place is
a **queue**: a durable, ordered list of **messages** (small records describing work to do) sitting
between two kinds of program:

- a **producer** — the code that *adds* messages (here, the sign-up handler);
- a **consumer**, usually many copies called **workers** — the code that *takes* messages off and does
  the work.

~~~text
  sign-up handler                 queue                        workers
  (producer)          ┌───────────────────────────┐
  ── enqueue ───────► │ msg  msg  msg  msg  msg   │ ──► worker 1 (sends email)
     ~5 ms            └───────────────────────────┘ ──► worker 2
                                                    ──► worker 3
~~~

Two more words, used from here on. When a worker takes a message, the queue doesn't delete it straight
away — it hides it and waits. When the worker finishes, it sends an **ack** (acknowledgement): "done,
delete it." If no ack arrives within a **visibility timeout** (say 30 seconds — maybe the worker
crashed), the message reappears for another worker. That one mechanism is what makes queues reliable,
and — as we'll see — also what makes them deliver duplicates.

Here is the whole idea in a few lines of Python, using the standard library's in-memory queue (a real
system uses a durable, networked queue such as RabbitMQ, Amazon SQS, or Kafka — but the shape is
identical):

~~~python
import queue, threading, time

jobs = queue.Queue()                     # the buffer between producer and consumers

def sign_up(email):                      # PRODUCER: runs inside the web request
    user_id = create_account_row(email)  # the one step the user needs (50 ms)
    jobs.put({"type": "welcome_email", "user_id": user_id})
    jobs.put({"type": "resize_avatar", "user_id": user_id})
    jobs.put({"type": "analytics",     "user_id": user_id})
    return "Welcome!"                    # returns after ~65 ms, not 4,000 ms

def worker():                            # CONSUMER: runs forever, outside any request
    while True:
        msg = jobs.get()                 # blocks until there is a message
        handle(msg)                      # the slow part: 0.5 to 2 seconds
        jobs.task_done()                 # stands in for the "ack" (an in-memory queue
                                         # never redelivers; a real broker does)

for _ in range(3):                       # three workers, running in parallel
    threading.Thread(target=worker, daemon=True).start()
~~~

The request now does 50 ms of work plus three enqueues of ~5 ms each: **about 65 ms instead of 4,000
ms** — roughly 60× faster, without making any single step faster. We didn't speed the work up. We
moved it out of the way.

## What a queue buys you — four things

**1. Fast responses.** Shown above: the user waits only for the work they need.

**2. Absorbing spikes.** Traffic isn't flat. A queue lets producers go faster than consumers *for a
while*, storing the difference. Let $\lambda$ (lambda) be the **arrival rate** — messages added per
second — and $\mu$ (mu) the **service rate** — messages the workers can finish per second. While
$\lambda > \mu$, the backlog grows by $\lambda - \mu$ every second.

*Worked example.* A marketing email goes out and sign-ups surge: **1,000 per second for 10 minutes**.
Your avatar workers can process **600 per second**.

- Net growth: $1{,}000 - 600 = 400$ messages per second.
- Duration: 10 minutes $= 600$ seconds.
- Backlog at the end of the surge: $400 \times 600 =$ **240,000 messages**.

Then traffic falls back to a normal **200 per second**. Workers still do 600/s, so the backlog now
shrinks by $600 - 200 = 400$ per second:

$$\text{drain time} = \frac{\text{backlog}}{\mu - \lambda} = \frac{240{,}000}{400} = 600 \text{ s} = 10 \text{ minutes.}$$

Here is the depth over time:

| time (min) | arrivals/s | processed/s | queue depth |
|---|---|---|---|
| 0 | 1,000 | 600 | 0 |
| 2.5 | 1,000 | 600 | 60,000 |
| 5 | 1,000 | 600 | 120,000 |
| 10 | → 200 | 600 | **240,000** (peak) |
| 15 | 200 | 600 | 120,000 |
| 20 | 200 | 600 | 0 |

Notice the cost: an avatar enqueued at the peak waits behind 240,000 others — $240{,}000 \div 600 = 400$
seconds, almost 7 minutes, before a worker touches it. The queue turned a would-be outage into a
*delay*. Without it, 400 requests per second would have had nowhere to go: timeouts and errors for
real users. With it, every sign-up succeeded in 65 ms and some thumbnails were late. That is almost
always the better trade.

**3. Isolating failures.** When the email provider is down, the email workers fail and the email
messages simply wait (or get retried). Sign-up still works — it only needed to *enqueue* the email, and
the queue is up. When the provider recovers, the backlog drains and everyone gets their welcome email,
late. **The slow, flaky dependency no longer sits on the critical path.**

**4. Independent scaling.** Avatar resizing is CPU-heavy; analytics is cheap. With a queue per job type,
you run 40 avatar workers and 2 analytics workers, and scale each to its own load — without touching the
web servers at all.
`,
    },
    {
      type: 'ponder',
      question: md`Predict before revealing. Messages arrive at **1,000 per second**; workers process
**800 per second**. This lasts **5 minutes**. Then arrivals fall to **400 per second** while workers keep
doing 800/s. (a) How big is the backlog when the surge ends? (b) How long until the queue is empty again?
(c) Bonus: why is the drain *faster* than the surge that built it, even though the backlog is the same?`,
      answer: md`**(a)** Net growth $1{,}000 - 800 = 200$ per second, for $5 \times 60 = 300$ seconds:
$200 \times 300 =$ **60,000 messages**.

**(b)** Net shrink $800 - 400 = 400$ per second: $60{,}000 \div 400 = 150$ seconds = **2.5 minutes**.

**(c)** Because the rates that matter are *differences*, not the rates themselves. The backlog grew at
$\lambda - \mu = 200$/s but drains at $\mu - \lambda = 400$/s. Here's the surprising consequence: if
arrivals had fallen to just 790/s instead of 400/s, the drain rate would be a mere 10/s and the same
60,000 backlog would take **6,000 seconds — 100 minutes**. A queue running "almost at capacity" drains
agonisingly slowly. That's why you size workers with generous headroom above normal traffic, not just
above average traffic.`,
    },
    {
      type: 'example',
      title: 'worked design (a) — the sign-up, fixed with queues',
      md: md`
**Requirement recap.** Sign-up must be fast (p99 under 300 ms) and must succeed even if email, image, or
analytics systems are down. Welcome emails should arrive within a minute normally; thumbnails within a
few seconds; analytics can lag by minutes.

**Sort each step.**

| step | user needs the result now? | where it goes |
|---|---|---|
| create account row | yes — they log in next | synchronous, in the request |
| store original avatar file | yes, the *bytes* must be durable before we say OK | synchronous upload to object storage |
| resize avatar | no | queue \`avatar-jobs\` |
| welcome email | no | queue \`email-jobs\` |
| analytics event | no | queue \`analytics-events\` |

**Design.**

~~~text
 browser ──► sign-up API ──► DB (users)                      [sync, ~50 ms]
                  │
                  ├──► object storage (original avatar)       [sync, ~20 ms]
                  │
                  ├──► avatar-jobs     ──► 40 resize workers ──► object storage (3 sizes)
                  ├──► email-jobs      ──► 10 email workers  ──► email provider
                  └──► analytics-events──► 2 analytics workers ─► analytics store
~~~

**One subtle trap — and its fix.** What if the database insert succeeds but the server crashes before it
enqueues the email? The account exists, the email never goes. The standard fix is the **outbox
pattern**: in the *same* database transaction as the user row, write a row into an \`outbox\` table
("send welcome email to user 812"). A small relay process reads the outbox and puts those rows onto the
queue. Now the account and the promise to email are saved together or not at all.

**What the user sees.** "Welcome!" in ~100 ms. Their profile shows the original avatar immediately
(scaled by the browser), swapped for the proper thumbnail a moment later. The email lands a few seconds
after.

**The outage test.** Email provider down for 2 hours, sign-ups at 50 per second: $50 \times 7{,}200 =
360{,}000$ email messages pile up. Sign-ups: unaffected. When the provider returns, 10 workers at 20
emails/s each = 200/s, against 50/s still arriving, drain at 150/s: $360{,}000 \div 150 = 2{,}400$ s =
**40 minutes** of catch-up. Everyone gets their email; nobody lost an account. Compare that to the
original design, where those 2 hours meant **zero** new users.
`,
    },
    {
      type: 'text',
      md: md`
## The uncomfortable truth: delivery guarantees

A queue sits between two programs on different machines, connected by a network that can fail at any
moment. So there's a question you must answer about every queue: **how many times can a message be
processed?**

**At-most-once.** The queue deletes the message the moment it hands it out. If the worker crashes
halfway, the message is gone. No duplicates, but *lost work*. Acceptable for things like "update a
view counter" where losing one tick is harmless.

**At-least-once.** The queue deletes a message only after an ack. If the worker crashes, the visibility
timeout expires, and the message is redelivered. No lost work — but *possible duplicates*. This is what
almost every production queue gives you by default.

**Exactly-once.** What everyone wants. Here's the honest version: across a network, the *delivery*
itself can't be made exactly-once in general, because the worker can always crash at the worst moment.
What real systems achieve is **exactly-once *effect***: at-least-once delivery **plus** a consumer that
makes the second processing of a message harmless. When a product advertises "exactly-once," read it
as "at-least-once plus a deduplication mechanism, within our system's boundary."

### Why duplicates happen — the exact moment

~~~text
  worker receives msg 812 ──► does the work (email sent!) ──► CRASH ──► (ack never sent)
                                                                   │
  30 s later: visibility timeout expires ──► msg 812 reappears ──► worker B sends the email AGAIN
~~~

The window is between **doing the work** and **acknowledging it**. You can't close it by acking first —
then a crash *before* the work loses the message, which is at-most-once. You have to pick: risk losing
it, or risk doing it twice. Almost always you pick "twice" and make twice harmless.

### The idempotent consumer

Recall from SD.3: an operation is **idempotent** if doing it twice has the same effect as doing it once.
\`set balance = 100\` is idempotent; \`add 100 to balance\` is not. And SD.3's **idempotency key** — a
unique id the client attaches so the server can recognise a retry — is exactly the tool we need here,
with the message id playing the role of the key.

~~~python
def handle(msg):
    with db.transaction():
        # 1. Have we already done this message? (processed_messages has a UNIQUE msg_id)
        if db.exists("SELECT 1 FROM processed_messages WHERE msg_id = %s", msg["id"]):
            return ack(msg)                       # duplicate: skip the work, just ack
        # 2. Do the effect...
        db.execute("UPDATE accounts SET points = points + 100 WHERE user_id = %s",
                   msg["user_id"])
        # 3. ...and record that we did it — in the SAME transaction.
        db.execute("INSERT INTO processed_messages (msg_id) VALUES (%s)", msg["id"])
    ack(msg)                                      # crash here? redelivery hits step 1 and skips
~~~

The key line is *same transaction*: the effect and the record of the effect commit together or not at
all, so there is no moment where one exists without the other.

When the effect lives **outside** your database — sending an email, charging a card — you can't put it
in your transaction. Then you pass the message id onward as the external service's idempotency key
(payment providers accept exactly this), or you accept a tiny duplicate window for low-stakes effects
(one duplicate welcome email is embarrassing, not dangerous).
`,
    },
    {
      type: 'ponder',
      question: md`Predict the failure. A payments worker takes a message "charge order 5521 for 40 USD",
calls the card provider — the charge succeeds — and then the worker's machine loses power **before it
acks**. The queue is at-least-once. Walk through exactly what happens next, what the customer sees, and
then design the fix.`,
      answer: md`**What happens.** The message was never acked, so after the visibility timeout it reappears.
Another worker picks it up, has no idea anything happened, and calls the card provider again. The
charge succeeds again. **The customer is charged 80 USD for a 40 USD order** — and nothing in your
system looks broken; every component did exactly what it was designed to do.

**The fix — make the effect idempotent at the place the effect happens.**

1. Give the charge a stable identity: the order id (5521), or the message id if each order produces
   exactly one charge message.
2. Pass that as the **idempotency key** to the card provider (the SD.3 mechanism). The provider records
   "key 5521 → charge ch_91"; when the second request arrives with the same key, it returns the
   *original* result instead of charging again.
3. On your side, record "order 5521: charged, ch_91" in your database, and check it before calling the
   provider — a cheap first line of defence.

Note what did **not** fix it: acking before charging (a crash then *loses* the payment — the customer
gets goods free, or the order stalls), or "making workers more reliable" (crashes are a certainty at
scale, not a bug to eliminate). The only robust fix is making the second attempt harmless.`,
    },
    {
      type: 'text',
      md: md`
## Poison messages and the dead-letter queue

At-least-once has a dark twin. Suppose a message is **malformed** — a user id that doesn't exist, a
field that's \`null\` where code expects a string. The worker throws an exception every time it touches
that message. It never acks. The message is redelivered. Forever.

Such a message is called a **poison message**. The standard defence is a **dead-letter queue (DLQ)**: a
separate queue where messages go after failing too many times. You set a **max receive count** — say 5.
On the fifth failure the queue moves the message to the DLQ instead of redelivering it. The main queue
flows again, an alert fires ("DLQ depth > 0"), and a human (or a repair script) inspects the message,
fixes the bug or the data, and **replays** it back into the main queue.
`,
    },
    {
      type: 'ponder',
      question: md`Predict it. Your email queue has **no dead-letter queue** and 10 workers. One message
contains a malformed address that makes the email library crash the worker every single time. What
happens to that message, to the workers, and to the thousands of healthy messages behind it? Does it
matter whether the queue delivers in strict order?`,
      answer: md`**The message** is redelivered forever: crash, visibility timeout, redeliver, crash. It never
leaves.

**The workers** each take their turn crashing on it. Each crash costs a restart plus a timeout's worth
of waiting, so effective capacity drops — and if crashes restart slowly, several workers can be down at
once. Your logs fill with the same stack trace, hiding real problems.

**Healthy messages** depend on ordering:

- **Unordered queue** (most job queues): healthy messages keep flowing, but at reduced throughput, and
  the poison message burns resources indefinitely. Degraded, not dead.
- **Strictly ordered queue or partition**: this is the disaster. Nothing behind the poison message can
  be processed until it is — this is called **head-of-line blocking**. One bad message halts *all* email
  delivery, and the backlog grows at the full arrival rate. At 50 messages/s, that's 180,000 stuck
  messages per hour.

**The fix:** a max receive count (e.g. 5) with a dead-letter queue, an alert on DLQ depth, and a way to
replay messages once fixed. Also: validate messages at the *producer*, so malformed ones are rejected
before they ever enter the queue.`,
    },
    {
      type: 'text',
      md: md`
## Backpressure — when the queue grows forever

A queue absorbs *temporary* spikes. It cannot fix a *permanent* shortfall. If $\lambda > \mu$ on
average — arrivals exceed service for good — the backlog grows by $\lambda - \mu$ every second with no
limit. At 100/s of excess that's 8.64 million messages a day, and every new message waits longer than
the one before. Eventually the queue's storage fills, or the wait makes the work pointless (a "your code
is 482913" SMS delivered 3 hours late is useless).

A useful law ties the numbers together. **Little's law**: for any stable system,

$$L = \lambda \times W$$

where $L$ is the average number of items *in* the system, $\lambda$ the arrival rate, and $W$ the
average time each item spends there. It's the same arithmetic as "if 10 people enter a shop per minute
and each stays 6 minutes, there are about 60 people inside." Two uses you'll need:

- **Workers needed.** If jobs arrive at 600/s and each takes 0.2 s of a worker's time, the number of
  jobs being worked on at once is $600 \times 0.2 = 120$ — so you need **at least 120 workers**, plus
  headroom.
- **Wait time from depth.** A queue 240,000 deep draining at 600/s means a new message waits about
  $240{,}000 \div 600 = 400$ seconds.

**Backpressure** is the name for pushing the problem back to the producer instead of letting the queue
swell silently. The menu of responses, from gentlest to harshest:

1. **Scale consumers** — autoscale workers on queue depth or on the age of the oldest message. Fixes
   the problem if the bottleneck is worker count (not, say, the database they all write to).
2. **Bound the queue** — give it a maximum size; when full, the producer gets an error and must slow
   down, retry later, or tell the user (HTTP 429 "Too Many Requests" / 503).
3. **Shed load** — drop or defer low-value work (analytics events, recommendation refreshes) to protect
   high-value work (payments, password resets). Often by using **separate queues per priority**.
4. **Expire stale work** — give messages a time-to-live; a 3-hour-old login code is discarded, not sent.

The one response that is *never* a plan: an unbounded queue and hope.

## Queue vs pub/sub vs log

So far "queue" meant one thing. There are three shapes, and choosing the wrong one is a classic
mistake.

**Work queue (point-to-point).** Each message is processed by **exactly one** of the competing workers.
That's what you want for *jobs*: "resize avatar 812" should be done once, by whichever worker is free.

**Publish/subscribe (pub/sub).** A producer publishes an **event** to a **topic** — "user 812 signed
up" — and **every subscriber** gets its own copy. Email service, analytics, and fraud detection each
subscribe; each has its own queue of copies, its own workers, its own pace. The producer doesn't know or
care who's listening.

**Log (Kafka-style).** Messages are appended to a durable, ordered log and **kept** — for days, or
forever — rather than deleted on ack. Each consumer tracks its own position (its **offset**) in the log.
That gives you two new powers: a new consumer can start from the beginning and **replay** history (build
a new search index from every event ever), and a buggy consumer can rewind and reprocess.

| | who gets a message? | deleted after processing? | typical use |
|---|---|---|---|
| work queue | one worker | yes | background jobs |
| pub/sub | every subscriber | per-subscriber, yes | fan-out of events |
| log | every consumer group, at its own pace | no — retained | event streams, replay, audit |

### Ordering — only within a partition

One queue on one machine can keep strict order. But a busy topic is split into **partitions** —
independent sub-logs on different machines — so many consumers can work in parallel. The price:
**ordering is guaranteed only within a partition**, never across partitions.

So you choose a **partition key** such that the events whose *relative* order matters land together.
Key a user's events by \`user_id\`: all of user 812's events ("signed up", "changed email", "deleted
account") go to one partition and are seen in order. Events for user 812 and user 9,004 may be
processed in either order — which is fine, because they're unrelated. If you need a global order
across everything, you've limited yourself to one partition, and to the throughput of one consumer.

### Event-driven design, in one paragraph

Pub/sub leads to a style called **event-driven design**: services announce facts that happened
("\`UserSignedUp\`", "\`OrderPlaced\`") instead of commanding each other ("send the email!"). The sign-up
service no longer needs to know that email, analytics, and fraud detection exist; next year's new
loyalty service just subscribes. The benefit is loose coupling; the cost is that the flow of the
business process is no longer visible in any one piece of code — debugging "why didn't the email go?"
means tracing an event across several services. Use it where the fan-out is real, not everywhere.
`,
    },
    {
      type: 'example',
      title: 'worked design (b) — a video-upload pipeline',
      md: md`
**The product.** Users upload videos (average 10 minutes, ~1 GB). Each must be **transcoded** —
converted — into 1080p, 720p, and 480p, get a thumbnail, and then the uploader is notified. Peak: **20
uploads per minute**.

**Step 1: what is synchronous?** Only receiving the bytes durably. The upload goes straight to object
storage; when that write is confirmed, the API creates a \`videos\` row with \`status = 'processing'\`
and publishes \`VideoUploaded(video_id)\`. The user gets a response in well under a second *after the
upload finishes*.

**Step 2: the pipeline.**

~~~text
 upload ─► object storage ─► API: videos row (status=processing)
                                   │
                                   ▼  publish VideoUploaded
                        ┌──── transcode-jobs (work queue) ─────┐
                        │ 3 jobs per video: 1080p, 720p, 480p  │──► transcode workers
                        └──────────────────────────────────────┘        │ each writes output,
                                                                         │ publishes RenditionReady
                        thumbnail-jobs ──► thumbnail workers ────────────┤
                                                                         ▼
                                          coordinator: all 3 renditions + thumbnail done?
                                                 └─► status=ready, publish VideoReady
                                                        └─► notification service ─► "Your video is live"
~~~

**Step 3: how many workers? (Little's law.)** Suppose each rendition takes **5 minutes** of one worker.
Each video brings 3 jobs, so jobs arrive at $20 \times 3 = 60$ per minute, each occupying a worker for 5
minutes: $L = 60 \times 5 =$ **300 transcode jobs in progress at once** at peak. You need at least 300
workers, and with 30% headroom, about 400. Fewer than 300 and $\lambda > \mu$: the backlog grows every
minute of the peak.

**Step 4: what the user sees while it's processing.** This is part of the design, not an afterthought:

- Immediately: the video page exists, showing the thumbnail placeholder and "Processing — usually about
  5 minutes."
- The page polls \`GET /videos/{id}\` every few seconds (or receives a push) and reads \`status\` and
  which renditions are ready.
- **Progressive readiness:** 480p finishes first (smallest), so the video becomes watchable at 480p
  before 1080p is done. The user sees value sooner than "all or nothing."
- On failure (a job lands in the DLQ after 3 attempts — e.g. a corrupt file): \`status = 'failed'\`,
  and the user sees "We couldn't process this video — try re-uploading," not an eternal spinner.

**Step 5: duplicates and ordering.** Transcode jobs are naturally idempotent if the output path is
deterministic — \`videos/77/720p.mp4\` — so a redelivered job just overwrites the same file with the same
bytes. The coordinator counts renditions as a **set** keyed by \`(video_id, resolution)\`, not a counter,
so a duplicate "720p ready" event can't make it believe 4 of 3 are done. Events are partitioned by
\`video_id\`, so each video's events arrive in order.

**Step 6: tradeoffs named.** Users wait minutes rather than seconds for a watchable video — accepted,
because synchronous transcoding would mean a 5-minute HTTP request that dies on any network blip.
Workers are the expensive part (CPU/GPU), so autoscale them on queue depth: 400 at peak, a few dozen
overnight.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The sorting question:** does the caller need this result to get their answer? If not, the work can
   be asynchronous — promised in the request, done outside it.
2. **The queue** as a durable buffer between producers and consumers (workers), with acks and a
   visibility timeout making it reliable.
3. **What a queue buys:** fast responses, spike absorption, failure isolation, and independent scaling
   of each kind of work.
4. **Backlog arithmetic:** while $\lambda > \mu$ the backlog grows at $\lambda - \mu$; it drains at
   $\mu - \lambda$, so drain time $=$ backlog $\div (\mu - \lambda)$ — slow when you run near capacity.
5. **Little's law** $L = \lambda W$ for sizing workers and turning queue depth into wait time.
6. **Delivery guarantees:** at-most-once loses work; at-least-once duplicates it; "exactly-once" in
   practice means at-least-once plus **idempotent consumers** (dedupe by message id in the same
   transaction as the effect, or pass it on as an idempotency key).
7. **Dead-letter queues** for poison messages, and **backpressure** — scale, bound, shed, expire —
   because a permanent $\lambda > \mu$ is never fixed by a bigger queue.
8. **Three shapes:** work queue (one worker per message), pub/sub (every subscriber gets a copy), log
   (retained and replayable), with ordering guaranteed **only within a partition**.

Next: queues let one part fail without taking down the rest — SD.7 asks what happens when the parts
themselves fail, and how to design for it.
`,
    },
  ],
  questions: [
    {
      id: 'sd-l6-q1',
      kind: 'mcq',
      prompt: md`A checkout request does four things. Which one should stay **synchronous** — inside the
request, before responding to the user?`,
      options: [
        md`Sending the order-confirmation email`,
        md`Recording the order and confirming the payment was authorised`,
        md`Updating the "customers also bought" recommendations`,
        md`Sending the order to the analytics warehouse`,
      ],
      answer: 1,
      explain: md`The user's answer *is* "your order is placed and paid" — they need that result before
the response, so it's synchronous. Option A tempts because the email feels like part of "checkout," but
the user only needs to know it *will* arrive; a queue delivers it seconds later and survives an email
outage. C and D tempt because they're triggered by the order, but nobody is waiting for them — they're
textbook asynchronous work.`,
    },
    {
      id: 'sd-l6-q2',
      kind: 'numeric',
      prompt: md`During a flash sale, order messages arrive at **2,500 per second** for **20 minutes**.
Workers can process **1,500 per second**. The queue starts empty. How many messages are in the backlog
when the sale traffic ends?`,
      answer: 1200000,
      tolerance: 20000,
      explain: md`Net growth $2{,}500 - 1{,}500 = 1{,}000$ per second, for $20 \times 60 = 1{,}200$
seconds: $1{,}000 \times 1{,}200 =$ **1,200,000 messages**. A common slip is multiplying the *arrival*
rate by the time (3 million) — but the workers were removing 1,500/s the whole time; only the
*difference* accumulates. A new order at the peak waits $1{,}200{,}000 \div 1{,}500 = 800$ seconds
(over 13 minutes) to be processed.`,
    },
    {
      id: 'sd-l6-q3',
      kind: 'mcq',
      prompt: md`A vendor advertises its message queue as offering "**exactly-once delivery**." What is the
most accurate engineering reading of that claim?`,
      options: [
        md`The network guarantees each message physically reaches the consumer exactly one time, so consumers never need deduplication`,
        md`Messages may be lost, but never duplicated`,
        md`In practice it is at-least-once delivery combined with deduplication inside the vendor's system; effects outside that system (charging a card, sending an email) can still happen twice unless your consumer is idempotent`,
        md`It is only possible if you use a single worker`,
      ],
      answer: 2,
      explain: md`A worker can always crash after doing the work and before acknowledging it, so *delivery*
can't be exactly-once in general; what systems provide is exactly-once *effect* within their own
boundary. Option A is the tempting marketing reading and the dangerous one — it leads to double
charges. B describes at-most-once. D tempts because one worker feels "safer," but a single worker can
still crash between the work and the ack, and the message will be redelivered.`,
    },
    {
      id: 'sd-l6-q4',
      kind: 'numeric',
      prompt: md`A queue has a backlog of **90,000** messages. Workers process **500 per second**, and new
messages keep arriving at **200 per second**. How many **minutes** until the queue is empty?`,
      answer: 5,
      tolerance: 0.3,
      explain: md`The backlog shrinks at $\mu - \lambda = 500 - 200 = 300$ per second:
$90{,}000 \div 300 = 300$ seconds $=$ **5 minutes**. The tempting wrong answer is $90{,}000 \div 500 =
180$ s = 3 minutes, which forgets that new messages keep arriving while you drain. At 450 arrivals per
second the same backlog would take $90{,}000 \div 50 = 1{,}800$ s = 30 minutes — draining near
capacity is slow.`,
    },
    {
      id: 'sd-l6-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** A queue has arrival rate $\lambda$ and service rate $\mu$
(messages per second), both constant. (1) Derive the backlog $B(t)$ after $t$ seconds starting empty,
when $\lambda > \mu$, and explain why "the backlog grows without bound" follows. (2) After a surge leaves
backlog $B_0$, arrivals drop to $\lambda' < \mu$. Derive the drain time. (3) Derive how long the *last*
message to arrive during the surge waits before being picked up (assume first-in-first-out). (4) Use your
formulas on: $\lambda = 1{,}000$, $\mu = 600$, surge of 600 s, then $\lambda' = 200$.`,
      rubric: md`**(1)** Each second, $\lambda$ messages arrive and at most $\mu$ leave, so the backlog changes
by $\lambda - \mu$ per second: $B(t) = (\lambda - \mu)\,t$. For $\lambda > \mu$ that's a positive slope
times $t$ — it increases linearly forever, with no ceiling except storage. More workers or fewer
arrivals are the only cures; a bigger queue only delays the failure.

**(2)** Now the backlog shrinks at $\mu - \lambda'$ per second, so it hits zero after
$T = B_0 / (\mu - \lambda')$. The denominator is a *difference*: as $\lambda'$ approaches $\mu$, $T$
blows up.

**(3)** FIFO: the last message sits behind $B_0$ messages, removed at $\mu$ per second (the service rate,
regardless of arrivals behind it), so it waits $B_0 / \mu$.

**(4)** $B_0 = 400 \times 600 = 240{,}000$; drain $= 240{,}000 / 400 = 600$ s (10 min); last surge
message waits $240{,}000 / 600 = 400$ s (~6.7 min).

Full credit: all three formulas *derived from the per-second balance* (not just stated), the insight
that drain time depends on the gap $\mu - \lambda'$, and correct numbers. Confusing (2) and (3) — using
$\mu$ for the drain or $\mu - \lambda'$ for the wait — is the common error and costs a point each.`,
    },
    {
      id: 'sd-l6-q6',
      kind: 'mcq',
      prompt: md`When a user signs up, three independent services — email, analytics, and fraud detection —
must each react. An engineer proposes: "put a \`UserSignedUp\` message on one work queue and run workers
for all three services on it." What's wrong?`,
      options: [
        md`Nothing — work queues are designed for exactly this`,
        md`On a work queue each message goes to only one worker, so each sign-up would reach only one of the three services; this needs pub/sub, where every subscriber gets its own copy`,
        md`Work queues can't hold more than one message type`,
        md`It will be too slow; the fix is to call the three services synchronously`,
      ],
      answer: 1,
      explain: md`Workers on a work queue *compete*: whoever grabs the message processes it, and it's gone.
So email might get sign-up 1, fraud detection sign-up 2, and analytics sign-up 3 — each service sees a
third of users. Option A tempts because "queue" and "pub/sub" are loosely used as synonyms; the
difference (one consumer vs every subscriber) is exactly the point. D reintroduces the original 4-second,
fails-when-anything-fails design.`,
    },
    {
      id: 'sd-l6-q7',
      kind: 'numeric',
      prompt: md`A notification system must send **1,500 push notifications per second** at peak. Each
notification occupies one worker for **0.4 seconds** (mostly waiting on the push provider's network
reply). Using Little's law, what is the **minimum** number of workers needed so that the queue doesn't
grow at peak?`,
      answer: 600,
      tolerance: 10,
      explain: md`$L = \lambda \times W = 1{,}500 \times 0.4 = 600$ notifications in progress at any moment,
so at least **600 workers** (each handles $1 / 0.4 = 2.5$ per second; $1{,}500 \div 2.5 = 600$). With
exactly 600 you're at 100% utilisation and any blip creates a backlog that drains very slowly — in
practice you'd provision 750–900. Since the work is mostly *waiting*, those "workers" might be
lightweight async tasks rather than 600 machines.`,
    },
    {
      id: 'sd-l6-q8',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "When I order food at a busy restaurant, why does
the waiter take my order and walk away, instead of standing at the kitchen until my food is ready?"
Use this to explain what a queue is in computer systems, why it makes websites faster and harder to
break, and what can go wrong (the ticket getting cooked twice, or a ticket nobody can read). No
unexplained jargon.`,
      rubric: md`Grade the teaching:

1. **Synchronous vs asynchronous, without the words** — if the waiter stood at the kitchen, they could
   only serve one table at a time and everyone else would wait. Instead they pin your ticket on the
   kitchen's rail and go serve others. You didn't need your food *that second* — you needed to know it's
   coming.
2. **The queue** — the rail of order tickets is the queue: waiters (who take orders) add tickets, cooks
   take them off in order and cook. Waiters and cooks work at their own speeds.
3. **Why it helps** — in a rush, tickets pile up on the rail instead of customers being turned away; if
   the dessert cook is sick, main courses still go out; on a busy night you add cooks without adding
   waiters.
4. **What goes wrong** — a cook makes a dish, gets called away before taking the ticket down, and
   another cook sees the ticket and makes it again (a duplicate), so kitchens mark tickets "done" — the
   idea of checking whether it's already been made. A ticket with unreadable handwriting shouldn't block
   everyone forever; it goes to a special "problem tickets" spot for the manager (a dead-letter queue,
   explained this way). And if orders come in faster than cooks can ever cook, the pile grows forever —
   eventually you must stop taking orders or hire cooks.
5. **Jargon audit:** "asynchronous," "consumer," "producer," "ack," "idempotent," "throughput,"
   "backlog," or "dead-letter queue" used *without* a kid-level translation first = partial credit at
   best. Using the words *after* the restaurant explanation is fine.`,
    },
    {
      id: 'sd-l6-q9',
      kind: 'mcq',
      prompt: md`Events go to a Kafka-style log with **8 partitions**, using \`user_id\` as the partition key.
User A emits "created" then "updated"; user B emits "created" 1 ms after user A's "created." Which
ordering is guaranteed?`,
      options: [
        md`All events across all users are processed in the exact order they were produced`,
        md`User A's "created" is processed before user A's "updated"; nothing is guaranteed about A's events relative to B's`,
        md`User A's "created" is processed before user B's "created," because it was produced first`,
        md`No ordering is guaranteed at all, even for one user`,
      ],
      answer: 1,
      explain: md`Ordering holds only *within* a partition, and keying by \`user_id\` puts all of one user's
events in the same partition. A and B may be on different partitions, consumed by different consumers
at different speeds. Option C is the tempting one — it feels like "earlier is processed earlier" — but
across partitions there is no global clock ordering them. A would require a single partition (and a
single consumer's throughput). D is too pessimistic: per-key ordering is exactly what the key buys you.`,
    },
    {
      id: 'sd-l6-q10',
      kind: 'numeric',
      prompt: md`**Fermi.** An app with **20 million** daily users triggers about **5** queued notification
jobs per user per day. The queue is at-least-once, and from worker crashes, deploys, and timeouts,
roughly **1 in 10,000** messages is redelivered after its work was already done. With no idempotent
consumer, roughly how many **duplicate notifications** do users receive per day?`,
      answer: 10000,
      tolerance: 2000,
      explain: md`Messages per day: $2 \times 10^7 \times 5 = 10^8$. Duplicates: $10^8 \div 10^4 =$ **~10,000
per day** — about 3.6 million a year. "1 in 10,000" sounds negligible, but at scale rare events are daily
events. For notifications that's an annoyance; if the same rate applied to a payments queue, it would
be ten thousand double charges a day. That's why idempotency is a design requirement, not a
nice-to-have.`,
    },
    {
      id: 'sd-l6-q11',
      kind: 'written',
      prompt: md`**Design exercise.** A food-delivery app: when a customer places an order, the system must
(a) charge the card, (b) send the order to the restaurant's tablet, (c) find a driver, (d) email a
receipt, (e) update analytics. Peak: **300 orders per second**. On paper: (1) decide what is synchronous
and what is asynchronous, with a reason for each; (2) choose work queue vs pub/sub for the async parts;
(3) say how you prevent double charges and double driver assignments under at-least-once delivery; (4)
say what happens if the email provider is down for an hour (give the backlog number, assuming emails
arrive at 300/s); (5) name one backpressure action you'd take if drivers can't be found as fast as
orders arrive.`,
      rubric: md`**(1) Sync vs async.** Synchronous: create the order record and **authorise the payment**
— the customer needs to know the order is accepted and paid (or declined, so they can fix the card).
Asynchronous: restaurant notification (seconds of delay acceptable, and the tablet may be briefly
offline), driver matching (takes time anyway), receipt email, analytics. A defensible variant: payment
is async with the UI showing "confirming…" — acceptable if justified.

**(2) Shapes.** Publish one \`OrderPlaced\` event (pub/sub); restaurant, dispatch, email, and analytics
each subscribe with their own queue and workers — they're independent reactions. Within dispatch, a work
queue of "find driver for order X" jobs.

**(3) Idempotency.** Charge with the order id as the payment provider's idempotency key. Driver
assignment: a conditional write — "set driver on order X only if no driver is set yet" — so a
redelivered job can't assign a second driver. Consumers record processed message ids in the same
transaction as their effect.

**(4) Email outage.** $300 \times 3{,}600 =$ **1,080,000** receipts queued. Orders are unaffected; the
backlog drains after recovery at (email capacity − 300)/s. Messages retry with backoff; failures after
N attempts go to a DLQ.

**(5) Backpressure.** Any of: show longer estimated delivery times or temporarily pause ordering in a
zone (slowing the producer), prioritise older orders, widen driver search radius, or surge incentives
to add drivers (scaling the "consumers"). Silently letting the dispatch queue grow is the wrong answer.

Full credit: every sync/async choice justified by "does the customer need it now," correct shape choice,
*concrete* idempotency mechanisms for both charge and driver, the 1,080,000 figure, and a real
backpressure action.`,
    },
    {
      id: 'sd-l6-q12',
      kind: 'written',
      prompt: md`**Make it idempotent.** A consumer handles "award 100 loyalty points to user U for order O."
The current code is \`UPDATE users SET points = points + 100 WHERE id = U\`, then ack. (1) Show a specific
sequence of events under at-least-once delivery that awards 200 points. (2) Rewrite the consumer (Python
or pseudocode) so duplicates are harmless. (3) Explain why the dedupe record must be written in the
**same transaction** as the points update — what goes wrong if it's written just before, or just after?
(4) What would you use as the dedupe key, and why might "order O" be better than the queue's message id?`,
      rubric: md`**(1)** Worker receives the message, runs the UPDATE (commits, +100), crashes before
acking. The visibility timeout expires; another worker receives it and runs the UPDATE again (+100).
Total +200.

**(2)** In one transaction: check whether the key exists in a \`processed\` table (with a UNIQUE
constraint); if it does, skip and ack; otherwise run the UPDATE and INSERT the key; commit; then ack. A
variant using \`INSERT ... ON CONFLICT DO NOTHING\` and only updating if a row was inserted is equally
good.

**(3)** *Record written before, separately:* crash after recording but before the update → the retry
sees "processed" and skips → the points are **lost**. *Record written after, separately:* crash after
the update but before recording → the retry doesn't see it → **double award**. Only the same
transaction makes "effect happened" and "recorded as happened" a single atomic fact.

**(4)** A **business key** such as \`points-for-order-O\` is often better than the message id: if the
*producer* accidentally publishes the same event twice (e.g. its own retry), the two copies have
*different* message ids but the same order — only the business key catches that duplicate. This mirrors
SD.3's idempotency keys, which identify the *intended operation*, not the packet carrying it.

Full credit: a concrete crash-before-ack sequence, a correct transactional rewrite, both failure
directions in (3), and a reasoned choice of key.`,
    },
  ],
}
