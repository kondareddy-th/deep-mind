// System Design Foundations, Lesson 7 — scaling and reliability
//
// Content uses the `md` tag from ../md.js: like String.raw, plus \` becomes a backtick.
// Code/diagram blocks use ~~~ fences. NEVER write the dollar-brace sequence in content.

import { md } from '../md.js'

export default {
  id: 'sd-l7',
  title: 'SD.7 Scaling & reliability — staying up when things break',
  subtitle:
    'Every machine you own will eventually fail, and most outages are not one failure but a chain reaction. This lesson derives the arithmetic of availability, shows how redundancy beats it, and builds the defensive patterns (timeouts, retries with backoff, circuit breakers, bulkheads) that stop one slow service from taking down everything.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

A team is launching an online shop. Every request passes through five pieces, one after another:

~~~text
user → load balancer → web server → product service → database → payment provider
~~~

They check each piece's track record. Every one of them is up **99.9%** of the time — "three nines,"
which (from SD.1) means about **8.76 hours** of downtime a year. So the team writes into the customer
contract: *"We guarantee 99.9% availability."*

They are wrong. Not slightly wrong — wrong by a factor of about five in downtime. Nothing is
misconfigured and no individual piece is lying about its record. The error is pure arithmetic, and it is
the most common arithmetic error in system design.

Before we find it, a definition we'll lean on all lesson:

> **Availability** is the fraction of time a system is working (answering requests correctly). If a
> component is available with probability $a$, it is *down* with probability $1 - a$.

For three nines, $a = 0.999$ and the component is down $0.001$ of the time: $0.001 \times 8{,}760$ hours
$= 8.76$ hours a year.
`,
    },
    {
      type: 'ponder',
      question: md`Predict before you read on. A request succeeds only if **all five** components are up.
Each is up 99.9% of the time, independently. What is the availability of the whole chain — and roughly
how many hours a year is the shop down? Is it 99.9%? Better? Worse? By how much?`,
      answer: md`**Worse — about 99.5%, or roughly 44 hours a year.**

For the request to succeed, component 1 must be up *and* component 2 *and* … *and* component 5. When
independent events must all happen, their probabilities **multiply**:

$$0.999 \times 0.999 \times 0.999 \times 0.999 \times 0.999 = 0.999^5 \approx 0.99501$$

So the chain is down $1 - 0.99501 = 0.00499$ of the time, and $0.00499 \times 8{,}760 \approx 43.7$
hours a year — five times the 8.76 hours the contract promised. A quick mental shortcut: when every
unavailability is small, the *downtimes add*. Five components each down 0.1% ≈ 0.5% down overall.

The general lesson: **every component you put on the critical path makes the system less available than
its weakest part.** Chains are weaker than their links.`,
    },
    {
      type: 'text',
      md: md`
## Availability math, derived

We just found the first rule. Let's make both rules precise, because every reliability decision in this
lesson is one of these two formulas in disguise.

### Rule 1 — components in series multiply (and it hurts)

"In series" means *every* component must work for a request to succeed — a chain. If the components have
availabilities $a_1, a_2, \dots, a_n$ and fail independently:

$$A_{\text{series}} = a_1 \times a_2 \times \cdots \times a_n$$

Every $a_i$ is less than 1, so each extra factor makes the product *smaller*. The system is always less
available than its worst component.

### Rule 2 — redundant components in parallel (and it helps enormously)

Now flip it. Suppose you run **two** identical web servers, and the system works as long as *at least
one* is up. When does the pair fail? Only when *both* are down at once.

- Each is down with probability $1 - a$.
- Both down together (independently): $(1-a) \times (1-a) = (1-a)^2$.
- So the pair is up with probability $1 - (1-a)^2$.

With $n$ redundant copies, the same argument gives:

$$A_{\text{parallel}} = 1 - (1-a)^n$$

Watch what this does to a mediocre server that is only up 99% of the time (down 3.65 days a year!):

| copies $n$ | down probability $(0.01)^n$ | availability | downtime per year |
|---|---|---|---|
| 1 | 0.01 | 99% | ~87.6 hours |
| 2 | 0.0001 | 99.99% | ~53 minutes |
| 3 | 0.000001 | 99.9999% | ~32 seconds |

Each extra copy multiplies the *downtime* by 0.01. That is the whole economic case for redundancy: two
cheap, unreliable machines beat one expensive, reliable one.

### The honest fine print: independence

Both formulas assume failures are **independent** — one server failing tells you nothing about the
other. Reality breaks this constantly:

- Both servers run the **same buggy deploy** → they crash together.
- Both sit in the **same datacenter** → one power cut takes both.
- Both depend on the **same database** → the "redundant" pair is still in series with it.

Correlated failures are why real systems have fewer nines than the formula promises. Much of reliability
engineering is the work of *making* failures independent: different racks, different buildings,
different deploy times.

### A reference table for nines

| availability | "nines" | downtime per year | per month |
|---|---|---|---|
| 99% | two | ~87.6 hours (3.65 days) | ~7.3 hours |
| 99.9% | three | ~8.76 hours | ~43 minutes |
| 99.99% | four | ~52.6 minutes | ~4.4 minutes |
| 99.999% | five | ~5.3 minutes | ~26 seconds |

## Single points of failure

A **single point of failure (SPOF)** is any component that, if it alone fails, takes the whole system
down — a series component with no parallel copy. Finding them is mechanical:

1. Draw the path a request takes, box by box (including things people forget: DNS, the load balancer
   itself, the config service, the certificate, the one shared database).
2. For each box, ask: **"If this, alone, disappeared right now, would users notice?"**
3. Every "yes" is a SPOF. Either add a parallel copy, or make the system *degrade* instead of *fail* when
   it's gone (more on that later).

The classic surprise: teams run ten web servers for redundancy, then put them all behind **one** load
balancer and **one** database. The ten servers contribute almost nothing to availability; the two
singletons dominate it.
`,
    },
    {
      type: 'example',
      title: 'computing the availability of a real stack, then fixing its weakest link',
      md: md`
**The stack** (every request passes through all four layers):

~~~text
DNS (99.99%) → load balancer (99.99%) → 3 app servers, each 99% → one database (99.9%)
~~~

**Step 1 — collapse the parallel layer first.** The three app servers are redundant; the layer works if
any one works:

$$1 - (1 - 0.99)^3 = 1 - 0.01^3 = 1 - 0.000001 = 0.999999$$

Three flaky 99% servers together are a 99.9999% layer.

**Step 2 — multiply the series chain.**

$$0.9999 \times 0.9999 \times 0.999999 \times 0.999 \approx 0.99880$$

**Result:** 99.88% — down about $0.0012 \times 8{,}760 \approx 10.5$ hours a year.

**Step 3 — find where the downtime comes from.** Since small unavailabilities roughly add, list each
layer's share:

| layer | unavailability | share of the ~0.12% |
|---|---|---|
| DNS | 0.01% | ~8% |
| load balancer | 0.01% | ~8% |
| app servers (×3) | 0.0001% | ~0% |
| **database** | **0.1%** | **~83%** |

The database — a single point of failure — causes more than four-fifths of all downtime. Adding a fourth
app server would change nothing you could measure.

**Step 4 — fix the weakest link.** Add a standby database replica that takes over if the primary dies
(this is **active-passive**, defined below). Treating the pair as parallel:

$$1 - (1 - 0.999)^2 = 1 - 0.000001 = 0.999999$$

New total: $0.9999 \times 0.9999 \times 0.999999 \times 0.999999 \approx 0.99980$ → **99.98%**, about
**1.8 hours** a year. Downtime fell from 10.5 hours to under 2 by fixing one box.

**Step 5 — be honest about what the formula ignores.** Failover isn't instant: detecting the dead primary
and promoting the replica might take 30–60 seconds each time, and those seconds count as downtime. And
the new bottleneck is now DNS plus the load balancer ($0.9999^2 \approx 99.98\%$) — so the next move is a
redundant pair of load balancers. Reliability work is always *find the biggest share, fix it, repeat.*
`,
    },
    {
      type: 'text',
      md: md`
## Scaling: bigger machine or more machines?

Redundancy needs more than one copy of a server. So does handling more traffic than one machine can
serve. There are two ways to grow:

**Vertical scaling ("scale up")** — replace your server with a bigger one: more CPU cores, more RAM.

- ✅ Nothing in your code changes. One machine, no coordination.
- ❌ There's a ceiling: the biggest machine you can buy.
- ❌ Price grows faster than capacity near the top end.
- ❌ It is still **one** machine — a single point of failure, and upgrading it usually means downtime.

**Horizontal scaling ("scale out")** — add more servers of the same size and split traffic among them.

- ✅ No hard ceiling: 10 servers, 100, 1,000.
- ✅ Redundancy comes free — lose one of 10 and you lose 10% of capacity, not 100%.
- ❌ You need something to spread the traffic (a load balancer), and your servers must be
  **interchangeable**.

That last condition is the catch, and it deserves a scenario.

### Why horizontal scaling needs stateless servers

Your app keeps each logged-in user's session — *who they are, what's in their cart* — in a Python dict
in the web server's memory:

~~~python
sessions = {}   # lives in THIS server's RAM only

def login(user_id):
    token = new_random_token()
    sessions[token] = {"user": user_id, "cart": []}
    return token
~~~

With one server this works perfectly. Now add a second server behind a load balancer. Alice logs in —
her request lands on server A, which stores her session. Her next click lands on server B, whose
\`sessions\` dict has never heard of her. **She's logged out.** Her cart is empty. Nothing crashed;
the design simply assumed one machine.

A server is **stateless** when it keeps nothing between requests that another server would need — any
server can handle any request. That's what makes servers interchangeable. So where does session state
go?

| option | how it works | cost |
|---|---|---|
| **Sticky sessions** | load balancer always sends Alice to server A | if A dies, Alice's session dies too; load becomes uneven — a band-aid |
| **Shared session store** | sessions live in a fast shared store (e.g. Redis) every server reads | one extra fast lookup per request; the store must itself be redundant |
| **Client-side token** | the session is encoded in a cookie the server signs, so it can detect tampering; the client sends it each time | nothing to store; but hard to revoke instantly, and must stay small |

The shared store and the signed token are the standard answers. The general principle: **push state out
of the servers into a place built to hold it** (a database, a cache, the client), and the servers become
cattle, not pets — any one can be killed and replaced without anyone noticing.

## Load balancers

A **load balancer** is a component that sits in front of a group of servers, receives every incoming
request, and forwards each one to one of the servers. It does three jobs:

1. **Spread load** so no single server is overwhelmed.
2. **Hide failures** by not sending traffic to dead servers.
3. **Give one stable address** — clients talk to the balancer; servers can be added or removed behind
   it freely.

### Choosing a server: round-robin vs least-connections

**Round-robin** sends requests to servers in turn: A, B, C, A, B, C… Simple and fair *if every request
costs about the same*.

But suppose most requests take 10 ms and a few ("generate my yearly report") take 10 seconds. Round-robin
doesn't know that. By bad luck, several slow reports land on server A; A now has a queue, while B and C
sit idle — and round-robin keeps sending A its full share.

**Least-connections** sends each new request to the server with the *fewest requests currently in
progress*. A, busy with reports, has many open connections, so new requests flow to B and C. It adapts
automatically to uneven request costs. Rule of thumb: round-robin for uniform, cheap requests;
least-connections when request costs vary.

### Health checks: removing dead servers

Every few seconds, the balancer sends each server a tiny request — say \`GET /health\` — and expects a
quick "OK." If a server fails, say, 3 checks in a row, the balancer removes it from rotation; when it
passes again, it's added back.

Worked: checks every 5 s, 3 failures to remove → a dead server keeps receiving traffic for up to
**~15 seconds**. With 4 servers at 2,000 requests/s total, the dead one gets a quarter:
$500 \times 15 = 7{,}500$ failed requests before it's removed. Faster checks shrink that window, at the
cost of more check traffic and more false alarms from a server that was merely slow for a moment. (A
well-behaved client retrying a failed request on a different server hides most of these — retries
return later in this lesson, with a warning attached.)

### L4 vs L7, briefly

Networking is described in layers. At intro level you need two:

- An **L4 (transport-layer) balancer** looks only at the connection — IP addresses and ports — and
  forwards raw bytes. It never reads the request. Very fast and simple, but can't route on content.
- An **L7 (application-layer) balancer** understands HTTP: it reads the URL, headers, and cookies. It can
  send \`/api/*\` to one server group and \`/images/*\` to another, and do smarter health checks. It
  costs more work per request.

## Redundancy patterns

**N+1.** If you need $N$ servers to handle peak load, run $N+1$, so losing any one still leaves enough
capacity. Worked: peak is 45,000 requests/s and each server handles 4,000/s. You need
$45{,}000 / 4{,}000 = 11.25$ → round *up* to **12**. With N+1: **13** servers. (Rounding down to 11
would mean you're overloaded at peak even before anything fails.)

**Active-passive.** One copy does all the work; a standby waits, kept up to date, ready to take over.
Simple, and common for databases where two writers would conflict. Costs: the standby is idle capacity
you pay for, and **failover** — detecting the failure and switching over — takes time (seconds to
minutes), during which you're down.

**Active-active.** All copies serve traffic at once. No idle hardware, no failover pause — the balancer
just stops sending traffic to the dead one. The hidden requirement: the survivors must absorb the dead
one's load. With two active-active servers, each must run at **at most 50%** of its capacity normally, or
losing one overloads the other and you lose both.

**Availability zones and regions.** Cloud providers group datacenters into:

- **Availability zones (AZs):** separate buildings in the same metro area, with independent power,
  cooling, and networking, a millisecond or two apart. Spreading across AZs survives a fire, power cut,
  or flood in one building — the correlated failures that break independence.
- **Regions:** geographically distant (e.g. Virginia vs Frankfurt), tens to hundreds of ms apart.
  Survives a whole-area disaster, but now your copies are far apart — which leads straight to the next
  topic.

Worked: you need 12 servers' worth of capacity and must survive losing a whole AZ. With 3 AZs, any 2 AZs
must hold 12 servers → 6 per AZ → **18 servers** total. Surviving a zone loss costs 1.5× the bare
capacity. With only 2 AZs, each must hold all 12 → 24 servers, 2×. More zones make redundancy cheaper.
`,
    },
    {
      type: 'example',
      title: 'two datacenters, one broken cable — the CAP choice, made twice',
      md: md`
You now have copies of your data in two datacenters, **New York** and **London**, which constantly sync
with each other. Then the cable between them is cut. Each datacenter still works and still hears from its
own users — they just can't talk to *each other*. This is a **network partition**: parts of the system
are alive but cut off from one another.

The **CAP theorem** says, stated honestly: *during a network partition, a system that keeps data in more
than one place must choose between*

- **Consistency (C):** every read sees the most recent write — as if there were one copy of the data;
- **Availability (A):** every request to a working node gets a (non-error) answer.

You can't have both while the cable is cut. (The "P" isn't a choice: partitions *will* happen, so "pick
two of three" is misleading. The real choice is C or A *when* it happens.) Let's make it twice.

**Case 1 — a bank balance.** Alice's account holds **\$150**. During the partition, Alice withdraws
\$100 at an ATM in New York, and her partner withdraws \$100 through an app routed to London.

~~~text
            New York                 ✂ cut ✂                 London
  sees balance 150                                  sees balance 150
  withdraw 100 → ?                                  withdraw 100 → ?
~~~

- **Choose A:** both sides approve — each sees \$150. When the cable is repaired and they reconcile, the
  balance is **−\$50**. The bank has lent money it didn't mean to lend.
- **Choose C:** decide in advance that, say, New York owns this account's writes. London, unable to reach
  New York, **refuses**: "Service temporarily unavailable." The partner is annoyed, but the balance is
  never wrong.

For money, **C** is the right choice. A short error is cheap; an incorrect balance is expensive and
possibly illegal.

**Case 2 — a social feed and like counts.** During the same partition, a New York user posts a photo and
it collects likes on both sides.

- **Choose C:** London users get errors when loading feeds — the whole site looks broken in Europe for
  the length of the outage.
- **Choose A:** everyone keeps scrolling. London users don't see the new New York photo until the cable
  is fixed, and the like count shows 212 in one place and 187 in the other for a few minutes. When the
  link returns, the sides merge (add up the likes) and **converge** to the same answer.

For a feed, **A** is right. Nobody is harmed by a stale like count; everybody is harmed by an error page.

**The takeaway:** the same partition, the same theorem, opposite answers — because the choice isn't
technical. It's a question about the *product*: **what does a stale or conflicting read cost, compared to
an error?**
`,
    },
    {
      type: 'text',
      md: md`
## Consistency models are product decisions

The two cases above are two **consistency models** — promises about what a reader sees after a write:

- **Strong consistency:** once a write is confirmed, every subsequent read, anywhere, sees it. Behaves
  like a single copy. Costs: writes must coordinate across copies (slower — a cross-ocean round trip is
  ~100 ms), and during a partition, some requests must fail.
- **Eventual consistency:** copies may briefly disagree, but if writes stop, they all *eventually*
  converge to the same value. Costs: readers can see stale data; your product must tolerate it.

(A useful middle ground you'll meet often: **read-your-own-writes** — *you* always see your own post
immediately, even if others see it a second later. It fixes the most visible staleness cheaply.)

Notice that even with no partition at all, strong consistency costs **latency**: every write waits for
coordination. So the trade shows up every day, not only during disasters.

How to choose, per feature — ask *"what's the cost of a stale read?"*:

| feature | stale read costs… | choose |
|---|---|---|
| bank balance, inventory at checkout, seat booking | money, overselling, double-booking | strong |
| username uniqueness | two people with one name | strong |
| social feed, like counts, view counters | a few seconds of staleness nobody notices | eventual |
| product reviews, recommendations | nothing meaningful | eventual |

A real system mixes both: an e-commerce site keeps inventory and payments strongly consistent, and
reviews, recommendations, and "12 people are viewing this" eventually consistent.

## Failure is usually slow, not dead

Everything so far treated failure as *on or off*. The failures that cause the worst outages are
different: a dependency doesn't die — it gets **slow**. It still accepts connections; it just takes 30
seconds, or forever, to answer. And slowness is contagious.
`,
    },
    {
      type: 'ponder',
      question: md`Predict before reading on. Your web tier calls a third-party **payment service**
during checkout — only 5% of requests are checkouts. The call has **no timeout**: it waits for an
answer however long that takes. One afternoon the payment service stops responding (it accepts the
connection but never replies). What happens to the *homepage*, which never touches payments at all?`,
      answer: md`**The homepage goes down too — within seconds — even though it never calls payments.**

Here's the mechanism. Each web server has a fixed pool of workers (threads) — say 200. Each worker
handles one request at a time. A checkout request grabs a worker and calls payments… and waits. Forever.
That worker never comes back.

Checkouts keep arriving. Each one captures another worker permanently. Soon **all 200 workers** are
frozen, waiting on payments. Now a homepage request arrives — and there is no free worker to handle it.
It queues, then times out at the user's browser. From the outside, the entire site is down.

A 5% feature took down 100% of the site, because slow requests **hold resources**, and resources are
shared. The next section puts numbers on how fast this happens — and the one-line fix.`,
    },
    {
      type: 'text',
      md: md`
## Defense 1: timeouts

First, a tool to put numbers on the ponder. **Little's law** says that for any system in a steady state:

$$\text{requests in progress} = \text{arrival rate} \times \text{time each request spends inside}$$

(10 people arrive per minute and each stays 3 minutes → about 30 people are inside at any time.)

**Worked.** One web server, **200 worker threads**, serving **500 requests/s**. 5% are checkouts, so 25
payment calls per second.

- **Normal day:** payment answers in 0.3 s. Workers busy on payments: $25 \times 0.3 = 7.5$. Other
  requests (475/s at 0.05 s each): $475 \times 0.05 \approx 24$. About 32 of 200 workers busy. Fine.
- **Payment hangs, no timeout:** every payment call holds its worker forever. We lose 25 workers per
  second, and about 176 are free to lose. In $176 / 25 \approx 7$ **seconds**, every worker is stuck.
  The server is down for all traffic.
- **Payment hangs, 2-second timeout:** each payment call now holds a worker for at most 2 s. Little's
  law: $25 \times 2 = 50$ workers on payments, plus ~24 for everything else = 74 of 200. **The site stays
  up.** Checkouts fail fast with "Payment is having trouble, please try again" — bad, but contained.

A **timeout** is a limit on how long you'll wait for any call. Rule: **every network call gets a timeout**,
set from the dependency's normal latency (e.g. a bit above its p99), not from hope. Many libraries default
to *no* timeout — it's the single most common root cause of cascading failure.

## Defense 2: bulkheads

Ships are divided into sealed compartments — **bulkheads** — so one hole floods one compartment, not the
ship. In software: **give each dependency its own limited pool of resources.**

Above, even with a timeout, payments could take 50 of 200 workers. Suppose you cap payment calls at a
dedicated pool of **30 workers**. If payments hang, at most 30 workers are affected — the other 170 serve
the homepage, search, and product pages no matter how bad payments get. Extra payment requests beyond the
30 are rejected instantly instead of queuing. Timeouts limit *how long* one call can hold a resource;
bulkheads limit *how many* resources one dependency can ever hold.

## Defense 3: retries — and how they backfire

Many failures are brief: a dropped packet, a server that was restarting. Trying again a moment later
often succeeds. So retrying is sensible… in isolation.
`,
    },
    {
      type: 'ponder',
      question: md`A request passes through three layers: **web → API service → database service**.
To be safe, each layer makes up to **3 attempts** (one try plus two retries) whenever the call below it
fails. The database service starts failing every request. For **one** user request, predict the
worst-case number of requests the database service receives.`,
      answer: md`**27** — not 3, not 9.

Follow it down. The web layer makes up to 3 attempts at the API. *Each* of those API calls makes up to 3
attempts at the database. And if the user's browser or app also retries, the count grows again. With
three retrying layers:

$$3 \times 3 \times 3 = 3^3 = 27$$

~~~text
web:       1 request   → 3 attempts
API:       3 requests  → 3 attempts each = 9
database:  9 requests  → 3 attempts each = 27 hits on the failing service
~~~

In general, $L$ layers each making $k$ attempts give $k^L$. And look at the timing: this 27× multiplier
kicks in **exactly when the bottom service is already failing** — often because it's overloaded. Retries
turn "struggling at 100% load" into "drowning at 2,700% load," guaranteeing it can't recover. This is a
**retry storm**. Retries must be designed, not sprinkled.`,
    },
    {
      type: 'text',
      md: md`
## Retries done right

Four rules turn retries from a weapon against yourself into a tool:

**1. Retry at one layer only** (usually the one closest to the user, or the one closest to the failing
call — pick one, document it). Other layers fail fast and pass the error up. That turns $3^3 = 27$ back
into 3.

**2. Exponential backoff.** Wait longer after each failure: 100 ms, then 200, 400, 800… doubling each
time. A struggling service gets breathing room instead of an immediate second hit.

**3. Jitter.** If 10,000 clients all fail at the same moment (say, a server restart) and all back off by
exactly 100 ms, they all retry *at the same moment* — a synchronized wave that knocks the service over
again, then again at 200 ms, and so on. **Jitter** means randomizing each wait — e.g. a random time
between 0 and the backoff — so the retries spread out into a smooth trickle.

**4. A retry budget.** Cap retries as a fraction of normal traffic — e.g. *retries may be at most 10% of
requests over the last minute.* When the service below is healthy, almost nothing is retried and the cap
is irrelevant. When it's failing wholesale, the budget runs out and extra load is capped at **1.1×**
instead of 3× or 27×.

~~~python
import random, time

def call_with_retries(call, max_attempts=3, base=0.1, budget=None):
    for attempt in range(max_attempts):
        try:
            return call(timeout=2.0)            # defense 1: always a timeout
        except TransientError:
            last = attempt == max_attempts - 1
            if last or (budget and not budget.try_spend()):
                raise                           # out of attempts or out of budget: fail fast
            backoff = base * (2 ** attempt)     # 0.1, 0.2, 0.4 ... seconds
            time.sleep(random.uniform(0, backoff))  # full jitter
~~~

Also: only retry things that are **safe to repeat**. Retrying "read a product page" is harmless.
Retrying "charge the card \$50" might charge it twice — unless the request carries an **idempotency
key** (a unique ID the payment service uses to recognize and ignore duplicates).

## Defense 4: circuit breakers

Retries with backoff still keep poking a dependency that's been dead for five minutes. A **circuit
breaker** — named after the switch in your house that cuts power when something's wrong — wraps calls to
a dependency and tracks their failures:

~~~text
  CLOSED ──(too many failures, e.g. >50% of last 20 calls)──▶ OPEN
    ▲                                                          │
    │                                               (wait, e.g. 30 s)
    │                                                          ▼
    └────────(trial call succeeds)──────────────── HALF-OPEN ──(trial fails)──▶ OPEN
~~~

- **Closed:** normal — calls go through.
- **Open:** calls fail *instantly*, without touching the dependency. Your workers aren't tied up waiting,
  and the struggling dependency gets zero load from you — room to recover.
- **Half-open:** after a cooling-off period, let one trial call through. Success → close; failure → open
  again.

Timeouts make each failure cheap; circuit breakers make a *known* outage almost free.

## Defense 5: graceful degradation

When a dependency is down, don't show an error page if something useful can be shown instead:

- Recommendations service down → show "popular items" from a precomputed list.
- Live stock count down → show the product with "check availability at checkout."
- Personalized feed down → show a cached copy from five minutes ago.
- Reviews down → show the product page without reviews.

Each of these requires deciding **in advance** which features are core (checkout, login) and which are
optional (recommendations, "people also viewed"). Optional features should *never* be able to take down
core ones — which is exactly what timeouts, bulkheads, and breakers enforce.

## Defense 6: limit the blast radius

The **blast radius** of a failure is how much of your system and how many of your users it can affect.
Two ways to shrink it:

**Cells.** Split your users into, say, 20 independent **cells** — each a complete copy of the stack
(servers, database, cache) serving 5% of users. A poison request, a bad database, or a runaway bug in
one cell hurts 5% of users, not 100%.

**Gradual rollouts.** Most outages are caused by *changes* — a deploy, a config push. Roll out to 1% of
traffic first (a **canary**), watch error rates, then 10%, 50%, 100%. Worked: a bad deploy at 10,000
requests/s that breaks every request.

- Pushed to 100% at once and noticed after 10 minutes: $10{,}000 \times 600 = 6{,}000{,}000$ failed
  requests.
- Canary at 1%, caught by automated alarms in 5 minutes: $100 \times 300 = 30{,}000$ failed requests —
  **200× fewer**.
`,
    },
    {
      type: 'example',
      title: 'the cache dies at peak — the full chain reaction, and the design that survives it',
      md: md`
SD.1 promised this question: *"If the cache dies, does the database get flattened?"* Let's answer it
with the URL shortener from SD.1 and the cache from SD.5.

**The setup.**

- **100,000 reads/s** at peak (from SD.1's Scale B).
- The cache serves **95%** of reads (the cache hit rate), so the database sees
  $0.05 \times 100{,}000 = 5{,}000$ reads/s.
- The database (primary plus read replicas) can handle about **12,000 reads/s**. Comfortable: 42% busy.

**The failure, minute by minute (the naive design).**

1. **t = 0.** The cache cluster fails — a bad config push reaches every cache node at once.
2. **t = 0 to 1 s.** Every read is now a miss. The database's load jumps from 5,000 to **100,000 reads/s**
   — about $100{,}000 / 12{,}000 \approx 8.3\times$ its capacity.
3. **t = 1 to 5 s.** Queries queue. Latency climbs from 5 ms to seconds. App servers have no timeout on
   database calls, so their workers pile up waiting (the payment-ponder mechanism).
4. **t = 5 s.** App servers retry failed queries up to 3 attempts. Offered load on the database: up to
   **300,000/s**, 25× capacity. The database runs out of connections and memory and falls over.
5. **t = 3 min.** Someone fixes the cache and it comes back — **empty** (a *cold cache*). The hit rate is
   0%, so the full 100,000/s still falls on the database, which is restarting. It dies again. The outage
   now lasts until someone manually blocks traffic and warms the cache slowly.

So yes: the database gets flattened, and the retries and the cold cache keep it flat. One failure
became a total outage because the design had no answer to each step.

**The design that survives — one defense per step.**

| step of the failure | defense | effect with numbers |
|---|---|---|
| whole cache fails at once | cache is a cluster of 20 nodes spread over 3 AZs; config pushed gradually | losing 1 node loses ~5% of keys: DB sees $5{,}000 + 0.05 \times 95{,}000 = 9{,}750$/s — under 12,000. Survives. |
| DB flooded with misses | **load shedding**: the DB tier admits at most ~11,000 queries/s and instantly rejects the rest | the DB stays alive, serving ~11% of reads instead of 0% |
| thousands of identical misses | **request coalescing**: if 5,000 requests miss the same viral link in the same instant, only one queries the DB; the others wait for that answer | popular links (most traffic) cost one query each, not thousands |
| workers pile up | **timeouts** (e.g. 200 ms on DB calls) and a **bulkhead** on the DB connection pool | app servers stay responsive; failures are fast |
| retries multiply load | retries at one layer only, with backoff, jitter, and a 10% **budget** | extra load capped at 1.1×, not 3× |
| DB keeps failing | **circuit breaker** on DB calls | once tripped, the DB gets zero load from that server and can recover |
| users see errors | **graceful degradation**: the CDN/edge keeps serving stale redirects for the hottest links | most clicks still work during the incident |
| cold cache on recovery | **warm up gradually**: let traffic back through in steps (10%, 25%, 50%…) as the hit rate climbs | the DB never sees the full flood at once |

**The verdict.** With these defenses, losing a cache *node* is a non-event, and losing the *whole* cache
becomes a degraded period — slow, some errors, popular links still working — that ends by itself, instead
of a total outage that needs heroics. That's the goal of reliability engineering: not preventing every
failure, which is impossible, but making sure each failure stays **small, contained, and temporary**.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **Series multiplies:** $A = a_1 a_2 \cdots a_n$ — every component on the critical path lowers
   availability (five 99.9% parts → ~99.5%, ~44 hours down a year, not ~9).
2. **Parallel multiplies the downtime away:** $A = 1 - (1-a)^n$ — two 99% copies give 99.99% — *if*
   failures are independent, which you have to engineer (zones, racks, staggered deploys).
3. **Find single points of failure** by walking the request path and asking "if only this died?" — then
   fix the one causing the biggest share of downtime, and repeat.
4. **Horizontal scaling needs stateless servers:** move session state to a shared store or a signed
   client token. Load balancers spread load (round-robin vs least-connections), remove dead servers with
   health checks, and come in L4 (connections) and L7 (HTTP-aware) flavors.
5. **Redundancy patterns:** N+1 (round up, then add one), active-passive (failover pause) vs
   active-active (survivors must absorb the load), and spreading across AZs and regions.
6. **CAP, honestly:** during a partition, choose consistency or availability — and the right choice is a
   product question (bank balance: C; social feed: A). Strong vs eventual consistency is decided per
   feature by the cost of a stale read.
7. **Slow is worse than dead:** without timeouts, a slow dependency captures every worker (Little's law
   tells you how fast).
8. **The defensive toolkit:** timeouts, bulkheads, retries at one layer with exponential backoff, jitter,
   and a budget (because $k^L$ amplification — 27× for three layers of 3 attempts), circuit breakers,
   graceful degradation, and a small blast radius via cells and gradual rollouts.

Next: SD.8 puts every tool from this section together — full end-to-end designs, where each box and each
defense must be justified by the numbers.
`,
    },
  ],
  questions: [
    {
      id: 'sd-l7-q1',
      kind: 'mcq',
      prompt: md`Your app ran fine on one server. You add four more behind a round-robin load balancer, and
users start getting randomly logged out and losing their shopping carts. What is the most likely cause?`,
      options: [
        md`The load balancer is dropping requests under the extra traffic`,
        md`Sessions are stored in each server's memory, so a user's next request often lands on a server that has never seen their session`,
        md`The database can't handle five servers connecting at once, so session writes fail`,
        md`The new servers have a different version of the code`,
      ],
      answer: 1,
      explain: md`The servers are **stateful**: each keeps sessions in its own RAM, and round-robin sends a
user's consecutive requests to different servers. The fix is making servers stateless — move sessions
to a shared store or a signed client token. Option A tempts because problems appeared "under more
traffic," but a dropped request shows up as errors, not as logouts with emptied carts. Option C is
plausible-sounding, yet five connections is trivial for a database — and the symptom is *specifically*
lost session state. Option D could cause odd bugs, but not this consistent pattern.`,
    },
    {
      id: 'sd-l7-q2',
      kind: 'numeric',
      prompt: md`A request must pass through four components **in series**: a load balancer (99.99%), an
app tier (99.9%), a database (99.95%), and an external payment API (99.9%). Assuming independent
failures, how many **hours per year** is the whole path unavailable? (Use 8,760 hours per year.)`,
      answer: 22.76,
      tolerance: 1.5,
      explain: md`Multiply: $0.9999 \times 0.999 \times 0.9995 \times 0.999 \approx 0.99740$, i.e. 99.74%
available. Unavailable fraction $\approx 0.0026$, so $0.0026 \times 8{,}760 \approx 22.8$ hours a year.
Shortcut check: the unavailabilities roughly add — $0.01\% + 0.1\% + 0.05\% + 0.1\% = 0.26\%$ → the
same answer. Notice the chain is worse than *every* individual component, and the two 99.9% parts
contribute most of the downtime — those are where to add redundancy first.`,
    },
    {
      id: 'sd-l7-q3',
      kind: 'mcq',
      prompt: md`Your service handles a mix of requests: most take ~5 ms, but a few "export all data"
requests take ~20 seconds. With round-robin load balancing, one server regularly ends up with a long
queue while others are idle. Which change best addresses this?`,
      options: [
        md`Add more servers, keeping round-robin`,
        md`Switch to least-connections balancing, so new requests go to the server with the fewest requests in progress`,
        md`Enable sticky sessions so each user always reaches the same server`,
        md`Use an L4 load balancer instead of L7, because it's faster`,
      ],
      answer: 1,
      explain: md`Round-robin assumes every request costs the same; here costs differ by ~4,000×.
Least-connections notices that a server busy with exports has many open requests and routes around it.
Option A tempts because "more capacity" often helps — but round-robin still hands the busy server its
full share, so the imbalance remains. Option C makes things worse: sticky sessions pin load regardless
of how busy a server is. Option D addresses the balancer's own speed, which isn't the bottleneck — the
problem is *where* requests are sent.`,
    },
    {
      id: 'sd-l7-q4',
      kind: 'numeric',
      prompt: md`You run **two** redundant copies of a service, each independently available **99%** of the
time; the service works if at least one copy is up. What is the overall availability, as a
**percentage**?`,
      answer: 99.99,
      tolerance: 0.005,
      explain: md`The pair fails only if both are down: $(1 - 0.99)^2 = 0.01^2 = 0.0001$. Availability
$= 1 - 0.0001 = 0.9999$ → **99.99%**. Downtime drops from ~87.6 hours a year (one copy) to ~53 minutes.
The tempting wrong answer is 99.5% (averaging) or 98.01% (multiplying — that's the *series* formula,
which applies when you need *both* up). Remember the caveat: this assumes independence. If both copies
share a power supply or receive the same bad deploy, reality is much closer to 99%.`,
    },
    {
      id: 'sd-l7-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Starting only from "a component is up with probability $a$ and
failures are independent," (1) derive the availability of $n$ components in **series**; (2) derive the
availability of $n$ redundant components in **parallel**, explaining each step in words; (3) use your
formula to show that three 99.5% servers in parallel beat one 99.99% server; (4) give two concrete
real-world situations where the independence assumption fails, and say what the formula would then
overstate.`,
      rubric: md`**(1) Series.** The request succeeds only if component 1 is up AND component 2 AND … AND
component $n$. For independent events, the probability that all happen is the product:
$A = a_1 a_2 \cdots a_n$ (or $a^n$ if all equal). Each factor is below 1, so adding components lowers $A$.

**(2) Parallel.** The system fails only if **every** copy is down at once. One copy is down with
probability $1 - a$. All $n$ down together, independently: $(1-a)^n$. The system is up in every other
case, so $A = 1 - (1-a)^n$. Key idea to credit: *compute the probability of failure, then take the
complement* — because "at least one up" is awkward, but "all down" is a simple product.

**(3) Numbers.** $1 - (0.005)^3 = 1 - 0.000000125 = 0.999999875 \approx 99.99999\%$, versus 99.99% for
the single server — roughly 800× less expected downtime ($0.0001 / 0.000000125 = 800$).

**(4) Independence failures** (any two, each with a consequence): the same bad deploy or config push
reaches every copy; all copies in one datacenter or AZ losing power; a shared dependency (one database,
one DNS provider) that all copies need; a traffic spike that overloads every copy at once; the same bug
triggered by the same poison input. In each case, failures are **correlated**, so the true probability
of "all down together" is far higher than $(1-a)^n$ — the formula **overstates** availability.

Full credit: both derivations with the complement argument explained in words, correct arithmetic in
(3), and two genuinely correlated-failure examples. Merely stating the formulas without derivation =
partial.`,
    },
    {
      id: 'sd-l7-q6',
      kind: 'mcq',
      prompt: md`A bank stores account data in two datacenters. The network link between them fails, but
both datacenters keep running. Which behavior corresponds to choosing **consistency** under the CAP
theorem?`,
      options: [
        md`Both datacenters keep accepting withdrawals and reconcile the balances when the link returns`,
        md`The datacenter that isn't the designated owner of an account refuses balance-changing requests for it until the link returns`,
        md`Choose "partition tolerance" instead, so the partition doesn't happen`,
        md`Use a faster network so that all three of C, A, and P can be guaranteed together`,
      ],
      answer: 1,
      explain: md`Consistency means every read sees the latest write, as if there were one copy. During a
partition, the only way to guarantee that is for one side to refuse writes it can't coordinate — giving
up availability for those requests. Option A is choosing **availability**; it tempts because
"reconcile later" sounds responsible, but reconciliation can reveal an overdraft that already happened.
Options C and D misread CAP: partitions aren't a choice you can decline — cables get cut, switches fail
— and no network speed prevents a *broken* link. The real choice is C or A *during* a partition.`,
    },
    {
      id: 'sd-l7-q7',
      kind: 'numeric',
      prompt: md`A request flows through three layers: **mobile app → API gateway → order service →
inventory database**. The app, the gateway, and the order service each make up to **4 attempts** (one
try plus three retries) when the call below them fails. The inventory database is failing every
request. For a single user action, what is the worst-case number of requests hitting the database?`,
      answer: 64,
      tolerance: 0,
      explain: md`Three retrying layers, each multiplying by 4: $4 \times 4 \times 4 = 4^3 = 64$. The app
sends 4 requests to the gateway; each produces 4 to the order service (16); each of those produces 4
to the database (64). Note the trap in the phrase "retries 3 times": that means **4 attempts**, not 3 —
the difference between 27× and 64×. The fix is retrying at only one layer, with backoff, jitter, and a
retry budget, which caps extra load near 1.1×.`,
    },
    {
      id: 'sd-l7-q8',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "Why do websites go down, and how do big
companies keep them up?" Using analogies you invent, explain: (1) why a chain of many parts breaks more
often than any single part; (2) why having spare copies makes something much more reliable — and when
spares *don't* help; (3) why, when something breaks, everyone "trying again" can make it worse. Every
technical word must be explained in kid terms before it's used.`,
      rubric: md`Grade the teaching:

1. **Chains are weak** — a strong analogy: getting to school needs your alarm to ring AND the bus to
   come AND the road to be open. Even if each works almost every day, the more things that must *all*
   go right, the more days *something* goes wrong. Bonus for a tiny number: five things that each fail
   one day in a thousand → you'll be late about five days in a thousand.
2. **Spares help** — two alarm clocks: you oversleep only if *both* fail on the same morning, which
   almost never happens. **When spares don't help:** if both clocks plug into the same socket and the
   power goes out, both fail together — spares must be truly separate.
3. **Trying again makes it worse** — a strong analogy: the school website crashes on results day; every
   kid keeps hitting refresh, and each kid's parents do too, so the website gets many times more
   visitors than before and can't get back up. The fix: wait a bit before trying again, and wait a
   *random* amount so everyone doesn't retry at the same second.
4. **Jargon audit:** "availability," "redundancy," "server," "load balancer," "retry storm," "latency,"
   or "failover" used without a kid-level translation first = partial at best. Full credit requires all
   three ideas explained with concrete, invented analogies and no unexplained jargon.`,
    },
    {
      id: 'sd-l7-q9',
      kind: 'mcq',
      prompt: md`A recommendations service your homepage calls has been returning errors on 100% of
requests for the last two minutes. Your calls already have a 1-second timeout. Which pattern best stops
you from wasting resources on it *and* gives it room to recover?`,
      options: [
        md`Increase the retry count with exponential backoff, so requests eventually get through`,
        md`A circuit breaker that, after repeated failures, fails calls instantly for a cooling-off period, then sends a single trial call`,
        md`Raise the timeout to 10 seconds, so slow responses have time to succeed`,
        md`Scale your web servers vertically so they have more threads to wait with`,
      ],
      answer: 1,
      explain: md`With a known outage, every call is wasted work: it holds a worker for up to a second and
adds load to a service trying to recover. An open circuit breaker fails instantly (freeing workers) and
sends zero load until a trial call succeeds. Option A tempts because backoff is a good practice — but
more retries against a 100%-failing service just multiply load. Option C makes each wasted call hold a
worker **10× longer** — Little's law says ten times as many stuck workers. Option D treats the symptom:
more threads to waste doesn't fix anything. Pair the breaker with graceful degradation — show popular
items instead of personalized ones.`,
    },
    {
      id: 'sd-l7-q10',
      kind: 'numeric',
      prompt: md`**Fermi.** A service has **20 million** daily active users, each making about **50
requests** per day. Peak traffic is about **3×** the daily average. Each server handles **2,000
requests/s**. Using "one day ≈ 100,000 seconds," how many servers should you run with **N+1**
redundancy?`,
      answer: 16,
      tolerance: 2,
      explain: md`Requests per day: $2 \times 10^7 \times 50 = 10^9$. Average rate:
$10^9 \div 10^5 = 10{,}000$/s. Peak: $3 \times 10{,}000 = 30{,}000$/s. Servers for peak:
$30{,}000 / 2{,}000 = 15$. With N+1: **16**. (Had the division come out fractional, you'd round *up*
first, then add one.) A natural follow-up: to survive losing a whole availability zone across 3 AZs,
any 2 zones must hold 15 servers → 8 per zone (rounding 7.5 up) → 24 total.`,
    },
    {
      id: 'sd-l7-q11',
      kind: 'written',
      prompt: md`**Failure analysis.** An online store has this incident report:

*"At 18:02, the third-party address-validation service (used on 3% of requests, during checkout) began
responding in 45 seconds instead of 100 ms. By 18:03 the entire site, including the homepage, was
returning errors. Engineers restarted the web servers at 18:10; the site came back for about 20
seconds, then failed again. At 18:25 the address service recovered and the site recovered with it."*

Web servers each have 300 worker threads, handle 1,000 requests/s, have no timeouts on outbound calls,
and the checkout code retries failed address calls up to 3 attempts.

(1) Explain the mechanism by which a 3%-of-traffic dependency took down 100% of the site — use
Little's law with the numbers given. (2) Explain why restarting didn't help. (3) Separate the
*trigger* from the *root causes*. (4) Propose at least four specific fixes, each tied to a step in the
failure, with numbers where possible.`,
      rubric: md`**(1) Mechanism with numbers.** Address calls: $3\% \times 1{,}000 = 30$/s per server. At 45
s each, Little's law: $30 \times 45 = 1{,}350$ workers needed — far above the 300 available. Workers
fill in roughly $300 / 30 = 10$ seconds (a bit faster, since other requests hold some too). With
retries (up to 3 attempts, each hanging), each checkout holds a worker even longer. Once all 300 workers
are stuck, homepage requests find no free worker, queue, and fail — the whole site is down.

**(2) Why the restart failed.** Restarting freed the workers, but the cause was unchanged: address calls
still took 45 s and kept arriving at 30/s, so the pool refilled in ~10–20 seconds. A restart treats the
symptom (stuck workers), not the mechanism.

**(3) Trigger vs root causes.** Trigger: the address service slowed down (outside the team's control,
and it *will* happen again). Root causes (the team's design): no timeouts on outbound calls; no bulkhead
isolating a non-critical dependency; retries that multiplied time spent waiting; a non-critical feature
on the critical path with no fallback.

**(4) Fixes, tied to steps** (at least four):
- **Timeout** of ~500 ms (a few times normal latency): Little's law → $30 \times 0.5 = 15$ workers
  maximum. The site stays up.
- **Bulkhead:** cap address calls at, say, 20 concurrent workers; beyond that, fail instantly. The other
  280 always serve the rest of the site.
- **Circuit breaker:** after repeated failures, stop calling for 30 s — zero workers wasted and no load
  on the struggling service.
- **Retries:** at most one retry, with backoff and jitter, under a retry budget — or none, for a slow
  (not flaky) dependency.
- **Graceful degradation:** if validation is unavailable, accept the address unvalidated and check it
  asynchronously later — checkout keeps working.

Full credit: the Little's-law calculation, a correct explanation of the failed restart, a clear
trigger/root-cause distinction, and four fixes each mapped to a step. Listing patterns without tying
them to this failure = partial.`,
    },
    {
      id: 'sd-l7-q12',
      kind: 'written',
      prompt: md`**Design for four nines.** A ticket-booking site currently runs: one DNS provider (99.99%),
one load balancer (99.9%), 4 stateless app servers (each 99%, needing 3 to handle peak), one database
(99.9%), and one cache (99.5%) that every request reads through — if the cache is down, the app
currently returns errors.

(1) Compute today's availability and yearly downtime. (2) List every single point of failure. (3)
Propose changes to reach at least **99.99%**, and recompute. (4) The site has three features — seat
booking, the event listing page, and "N people are viewing this event." Choose strong or eventual
consistency for each, with the reasoning in terms of what a stale read would cost.`,
      rubric: md`**(1) Today.** App tier (4 in parallel, treating "at least one up" as up):
$1 - 0.01^4 \approx 1.0$. Series: $0.9999 \times 0.999 \times 1.0 \times 0.999 \times 0.995 \approx 0.9929$
 → **~99.3%**, about $0.0071 \times 8{,}760 \approx 62$ hours a year. (Credit a careful note that
"at least one up" is optimistic — with 3 needed for peak, losing 2 servers causes overload, so N+1 is
the real requirement. 4 servers for a need of 3 *is* N+1.)

**(2) SPOFs:** the load balancer, the database, the cache (because requests *fail* without it), and DNS
(one provider). The cache is the biggest share of downtime (0.5% of the ~0.7%).

**(3) Changes and recompute** (reasonable choices, each justified):
- **Cache:** make it *not* a SPOF — on a cache miss or cache outage, fall through to the database (with
  load shedding and request coalescing so the DB survives), and run the cache as a replicated cluster.
  It leaves the critical path: treat as ~1.0.
- **Database:** add a standby with automatic failover: $1 - 0.001^2 = 0.999999$.
- **Load balancer:** a redundant pair: $1 - 0.001^2 = 0.999999$.
- **DNS:** a second provider or accept 99.99% as the floor.

Recompute: $0.9999 \times 0.999999 \times 1.0 \times 0.999999 \approx 0.99990$ → **~99.99%**, about 53
minutes a year — with DNS now the largest remaining term. Credit noting that failover time and
correlated failures make the real number somewhat worse, so spreading across AZs matters.

**(4) Consistency per feature:**
- **Seat booking → strong.** A stale read could sell the same seat twice — money, refunds, angry
  customers at the venue. Better to refuse a booking during a partition than double-sell.
- **Event listing → eventual.** A description or price change appearing a few seconds late costs almost
  nothing (the final price is confirmed at booking). Staying available matters more.
- **"N people viewing" → eventual.** An approximate, slightly stale count is harmless; it's decoration.

Full credit: correct arithmetic before and after, all SPOFs including the cache's fail-closed behavior,
fixes aimed at the largest downtime shares, and consistency choices justified by the cost of staleness —
not by "strong is safer."`,
    },
  ],
}
