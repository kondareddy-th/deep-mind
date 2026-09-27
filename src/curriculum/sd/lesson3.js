// System Design Foundations, Lesson 3 — Networks & APIs (deepens step 3 of the method: the API)
//
// Content uses the `md` tag from ../md.js: like String.raw, plus \` becomes a backtick.
// Code/diagram blocks use ~~~ fences. NEVER write the dollar-brace sequence in content.

import { md } from '../md.js'

export default {
  id: 'sd-l3',
  title: 'SD.3 Networks & APIs — how the pieces talk, and how calls go wrong',
  subtitle:
    'A customer is charged twice and nothing crashed. This lesson follows a request across the network, learns the small vocabulary of HTTP that decides what is safe to retry, and builds the fixes real systems use: idempotency keys, backoff with jitter, cursor pagination, rate limits, and the right real-time channel.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

A customer is buying a pair of shoes. They tap **Pay \$40**. Here is exactly what happens, step by step:

~~~text
 phone                                   payments server
   |                                            |
   |---- "charge this card $40" ------------->  |   request arrives fine
   |                                            |   card charged: $40   (success!)
   |  <---- "OK, charged" ------ X  lost        |   the response dies in a tunnel / bad Wi-Fi
   |                                            |
   |  (10 seconds pass, no answer: "timeout")   |
   |                                            |
   |---- "charge this card $40" ------------->  |   the app retries, as it was built to
   |                                            |   card charged: $40   (success, again!)
   |  <---- "OK, charged" --------------------  |
   |                                            |
 customer's bank statement:  -$40  -$40   =  $80
~~~

Look for the villain. The phone did the sensible thing: it got no answer, so it tried again. The
server did the sensible thing: it received a valid request to charge a card, and charged it. The network
did what networks do: it occasionally loses messages. **Every component did its job, and the customer
was robbed of \$40.**

The root of the problem is a sentence worth memorising:

> **When a request times out, the client cannot tell whether it failed or succeeded.** "No reply" could
> mean the request never arrived, or it arrived and was processed and only the *reply* was lost. From the
> phone's side, those two worlds look identical.

So a retry is a guess. Sometimes it's the right guess (the request was lost) and sometimes it is a
disaster (the request already worked). This lesson is about designing APIs so that the guess is *always
safe* — plus the rest of what you need to know about how the pieces of a system talk to each other.

Recall the six-step method from SD.1: requirements → estimate → **API** → data model → high-level
design → deep dive. This lesson is a deep look at step 3. The API isn't just a list of URLs; it's a
contract that must stay correct when the network misbehaves — and the network always eventually
misbehaves.

## First, what actually happens when you make a request?

Before we can reason about what goes wrong, we need a picture of the journey. Say you type
\`https://shop.example.com/orders/42\` into a browser (a phone app does exactly the same things
underneath). Four things happen in order.

**1. DNS — turn the name into an address.** Computers on the internet find each other by numeric
**IP addresses** (like \`93.184.216.34\`), not names. The **Domain Name System (DNS)** is the
internet's phone book: your device asks a DNS resolver "what's the address of shop.example.com?" and gets
a number back. Answers are cached, so often this costs almost nothing; when not cached, it's a round trip
or several.

**2. TCP — open a reliable connection.** **TCP** is the protocol that makes an unreliable network
look like a reliable pipe: it numbers the pieces of data, resends lost ones, and delivers them in order.
Opening a TCP connection takes a "handshake" — a short hello/hello-back/ok exchange that costs one
**round trip**. (A *round trip time*, **RTT**, is the time for a message to go to the server and a reply
to come back. From India to a US server it's around 200 ms; within one city, a few ms.)

**3. TLS — make the pipe private.** The \`s\` in \`https\` means the connection is encrypted with
**TLS**. The two sides must agree on encryption keys before sending anything real, which costs one more
round trip (two with the older TLS 1.2).

**4. HTTP — the actual request and response.** Finally the browser sends the request: a *method* (like
\`GET\`), a *path* (\`/orders/42\`), some *headers*, maybe a *body*. The server does its work and sends
back a response: a *status code* (like \`200\`), headers, and a body. That's one more round trip plus
however long the server takes.

~~~text
 client                                             server
   |--- DNS query: shop.example.com? -----> resolver     (often cached)
   |<-- 93.184.216.34 --------------------
   |--- TCP SYN ------------------------------------->|  \
   |<-- SYN-ACK --------------------------------------|   } 1 round trip
   |--- TLS hello (+ ACK) --------------------------->|  \
   |<-- TLS keys ------------------------------------ |   } 1 round trip
   |--- GET /orders/42 ------------------------------>|  \
   |              (server works: ~30 ms)              |   } 1 round trip + server time
   |<-- 200 OK  { "id": 42, ... } ------------------- |  /
~~~

The key lesson from this picture: **a fresh connection costs several round trips before a single byte
of your real request moves.** That's why real clients *reuse* connections (called keep-alive or
connection pooling): the DNS, TCP, and TLS costs are paid once, and every later request costs only one
round trip plus server time.
`,
    },
    {
      type: 'example',
      title: 'pricing one page load, round trip by round trip',
      md: md`
A user in Bengaluru opens an app whose server is in Virginia. Assume:

- RTT to the server: **200 ms**
- DNS: answered by a nearby resolver's cache in **20 ms**
- TLS 1.3 (one round trip for the handshake)
- Server processing time: **30 ms**

**First request on a brand-new connection:**

| step | cost |
|---|---|
| DNS lookup | 20 ms |
| TCP handshake | 200 ms (1 RTT) |
| TLS handshake | 200 ms (1 RTT) |
| HTTP request → response | 200 ms (1 RTT) + 30 ms server |
| **total** | **650 ms** |

**Second request, reusing the same connection:** just 200 + 30 = **230 ms**. Reuse saved 420 ms —
nearly two thirds of the first request's time.

**Same app, but the page needs 5 API calls, one after another (each waits for the previous):**
5 × 230 = **1,150 ms** on a warm connection. If the 5 calls don't depend on each other, the app can send
all 5 at once, and the page waits only as long as the *slowest* one: about **230 ms**.

**And if we move a copy of the server to Mumbai (RTT 20 ms):** fresh connection = 20 + 20 + 20 + 20 +
30 = **110 ms**; warm = 20 + 30 = **50 ms**.

Three design levers fall straight out of this arithmetic, and you'll see all three again:

1. **Reuse connections** — don't pay handshakes twice.
2. **Parallelise independent calls** — sequential latency *adds up*; parallel latency is the *maximum*.
3. **Move the server closer to the user** — when the RTT dominates, geography beats code
   optimisation. (This is what CDNs and multi-region deployments are for — SD.5 and later.)
`,
    },
    {
      type: 'text',
      md: md`
## HTTP: a small vocabulary that decides what's safe

An HTTP request says *what you want to do* with its **method**, and *to what* with its **path**. A
**resource** is any "thing" your API exposes — an order, a user, a payment — and the path names it:
\`/orders\` is the collection of all orders, \`/orders/42\` is one order.

The five methods you'll use constantly:

| method | meaning | example |
|---|---|---|
| \`GET\` | read, change nothing | \`GET /orders/42\` |
| \`POST\` | create something new / perform an action | \`POST /orders\` (make a new order) |
| \`PUT\` | replace this resource with exactly this | \`PUT /users/7/address\` with the full address |
| \`PATCH\` | change some fields of this resource | \`PATCH /orders/42\` with \`{"note": "leave at door"}\` |
| \`DELETE\` | remove this resource | \`DELETE /carts/9/items/3\` |

Now the two properties that make this vocabulary matter. Both answer the question from the puzzle:
*"If I send this twice, what happens?"*

**Safe** means the request doesn't change anything on the server. Reading is safe. You can send a safe
request a hundred times and the world is unchanged.

**Idempotent** (from Latin: "same power") means that sending the request **N times has the same effect
as sending it once**. It *may* change things — but repeating it changes nothing further.

Concrete intuition before the table:

- "Set the thermostat to 21°" is **idempotent**. Press it five times; it's 21°.
- "Raise the thermostat by 1°" is **not**. Press it five times; it's 5° hotter.
- "Look at the thermostat" is **safe** (and therefore idempotent too).

| method | safe? | idempotent? | why |
|---|---|---|---|
| \`GET\` | yes | yes | it only reads |
| \`PUT\` | no | **yes** | "make it exactly this" — the second time, it already is |
| \`DELETE\` | no | **yes** | after the first delete it's gone; deleting again leaves it gone |
| \`POST\` | no | **no** | "create a new one" — twice means two new ones |
| \`PATCH\` | no | not guaranteed | "set note = X" is idempotent; "add 1 to quantity" is not |

One subtlety that trips people up: idempotency is about the **effect on the server's state**, not about
getting an identical response. The first \`DELETE /carts/9/items/3\` returns \`204 No Content\`; the
second may return \`404 Not Found\`. Different responses — but the state of the world is the same
("item 3 is not in the cart"), so \`DELETE\` is still idempotent.

**Why this property is the whole point:** idempotency is precisely the property that makes a *blind
retry* harmless. If an operation is idempotent, then on a timeout the client doesn't need to know
whether the first attempt worked — sending it again is safe either way. Our puzzle's payment was a
\`POST\` ("create a new charge"), which is not idempotent — so a retry was a gamble.
`,
    },
    {
      type: 'ponder',
      question: md`Browsers, proxies, and HTTP client libraries often **retry some requests
automatically** when a connection drops — without asking your code. Before revealing: which of \`GET\`,
\`PUT\`, \`DELETE\`, \`POST\`, and \`PATCH\` can a library retry automatically without risk, and why must it
refuse to auto-retry \`POST\` (by default)? Is there any case where retrying a "safe to retry" method still
surprises you?`,
      answer: md`**Safe to auto-retry: \`GET\`, \`PUT\`, \`DELETE\`** (and the rarer \`HEAD\` / \`OPTIONS\`). They are
idempotent, so whether the first attempt was lost or merely its reply was lost, sending again leaves the
server in the same state. The library doesn't need to know which world it's in — and it *can't* know,
which is exactly why the property matters.

**Not safe: \`POST\` and \`PATCH\`.** \`POST /payments\` means "create a *new* payment." If the first one
succeeded and only the response vanished, a retry creates a second payment — our \$80 puzzle. \`PATCH\`
*might* be idempotent ("set status = shipped") or might not ("increment quantity"); the library can't
tell from the method, so it has to assume the worst. This is why browsers show "Confirm form
resubmission?" when you refresh a page that was the result of a \`POST\`: the browser is admitting it
doesn't know whether repeating is harmless.

**The surprise:** idempotent does not mean *order-independent*. Suppose you send \`PUT /profile
{name: "A"}\`, it times out, then you send \`PUT /profile {name: "B"}\` — and *then* the delayed first
request finally arrives. The server now says "A." Each request was idempotent; the *sequence* still went
wrong. Real APIs handle this with version numbers ("only apply if the current version is 7"), a
technique called **optimistic concurrency**: the server rejects a write made against an
out-of-date version, and the client re-reads and tries again.

So the default rule is: **retry idempotent requests freely; never blindly retry a non-idempotent one.**
The rest of this lesson shows how to make \`POST\` *safe to retry anyway* — which is what the payments
industry actually does.`,
    },
    {
      type: 'text',
      md: md`
## Status codes: the server's one-number answer

Every response starts with a three-digit **status code**. The first digit is the family, and the family
alone tells a client most of what it needs — especially *whether retrying could help*.

| family | meaning | retry? |
|---|---|---|
| **2xx** | success | no need |
| **3xx** | "look elsewhere" (redirect) | follow the redirect |
| **4xx** | **you** (the client) did something wrong | no — the same request will fail the same way (except 429) |
| **5xx** | **the server** failed | maybe — the problem may be temporary |

The handful that matter in design discussions:

| code | name | when you use it |
|---|---|---|
| \`200\` | OK | a successful read or update |
| \`201\` | Created | a \`POST\` created a resource; send a \`Location\` header pointing to it |
| \`301\` / \`302\` | Moved Permanently / Found (temporary) | redirects — the URL shortener from SD.1 returns one of these |
| \`400\` | Bad Request | malformed input: missing field, amount is "banana" |
| \`401\` | Unauthorized | we don't know who you are — log in / send a valid token |
| \`403\` | Forbidden | we know who you are, and you may not do this |
| \`404\` | Not Found | no such resource |
| \`409\` | Conflict | the request clashes with current state: cancelling an already-shipped order |
| \`429\` | Too Many Requests | you're over your rate limit — slow down |
| \`500\` | Internal Server Error | a bug or unexpected failure on the server |
| \`503\` | Service Unavailable | the server is overloaded or down for maintenance — try later |

(\`401\` vs \`403\` is a classic confusion. A useful mnemonic: 401 = "who are you?", 403 = "I know who you
are, and no.")

**Headers** are key–value metadata riding along with requests and responses. You'll meet these few
repeatedly:

- \`Content-Type: application/json\` — what format the body is in.
- \`Authorization: Bearer <token>\` — who is calling.
- \`Location: /orders/42\` — on a \`201\`, where the new resource lives.
- \`Retry-After: 30\` — on a \`429\` or \`503\`, how many seconds to wait before trying again.
- \`Idempotency-Key: 7f3c...\` — the hero of this lesson, coming shortly.

## Designing resources: the REST style

**REST** is a style for designing HTTP APIs around *resources* (nouns) acted on by the standard
methods (verbs), rather than inventing a new URL for every action. Its rules of thumb:

- Paths are **nouns**, plural for collections: \`/orders\`, \`/orders/42\`, \`/orders/42/items\`.
- The **method** carries the verb: not \`POST /createOrder\`, but \`POST /orders\`.
- Responses use **status codes honestly** — not \`200 OK\` with \`{"error": "not found"}\` in the body.
- Each request carries everything the server needs (who you are, what you want); the server keeps no
  per-client memory between requests. This is called being **stateless**, and it's what lets any of
  many servers answer any request — the foundation of horizontal scaling in SD.7.
`,
    },
    {
      type: 'example',
      title: 'a complete orders API for a shop',
      md: md`
**Requirements (step 1, briefly):** customers place orders, view one order, list their order history,
change the delivery note before shipping, and cancel before shipping. Payments must never double-charge.

**The endpoints:**

~~~text
POST   /orders                      create an order              -> 201 + Location
GET    /orders/{id}                 read one order               -> 200 | 404
GET    /orders?limit=20&cursor=...  list my orders, newest first -> 200 (one page)
PATCH  /orders/{id}                 change delivery note         -> 200 | 409 if already shipped
POST   /orders/{id}/cancel          cancel                       -> 200 | 409 if already shipped
~~~

**Creating an order — the full exchange:**

~~~text
POST /orders HTTP/1.1
Host: api.shop.example.com
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json
Idempotency-Key: 5b1e9c2a-8f4d-4e7b-9a61-2c0d3f6e8b17

{ "items": [ { "sku": "SHOE-42", "qty": 1 } ],
  "payment_method": "card_8812",
  "delivery_note": "ring twice" }
~~~

~~~text
HTTP/1.1 201 Created
Location: /orders/ord_7Hq2
Content-Type: application/json

{ "id": "ord_7Hq2", "status": "paid", "total_cents": 4000,
  "created_at": "2026-09-26T10:14:03Z" }
~~~

Notice three deliberate choices. Money is sent as **integer cents** (\`4000\`), never a floating-point
\`40.00\` — floats can't represent most decimal fractions exactly. The response returns the **whole new
resource**, so the client doesn't need a second \`GET\`. And there's an **Idempotency-Key** header — the
next section explains why that line is the difference between a working shop and our puzzle.

**Every way it can go wrong, and the honest answer:**

| situation | response |
|---|---|
| \`qty\` is \`-3\` | \`400 Bad Request\` with \`{"error": "qty must be at least 1"}\` |
| no / expired token | \`401 Unauthorized\` |
| reading someone else's order | \`404 Not Found\` (\`403\` would confirm the order exists — a small information leak) |
| cancelling a shipped order | \`409 Conflict\` with \`{"error": "order already shipped"}\` |
| 200 orders in a minute from one account | \`429 Too Many Requests\` + \`Retry-After: 30\` |
| database down | \`503 Service Unavailable\` |

**Why is cancel \`POST /orders/{id}/cancel\` and not \`DELETE /orders/{id}\`?** Because a cancelled order
doesn't disappear — it still exists, with a refund, a history, and an entry in the accounts. \`DELETE\`
would lie about what happens. REST is a guide, not a religion: when an action isn't naturally "create /
read / replace / remove a thing," a small action endpoint is the clear choice. (And is cancel
idempotent? It should be designed to be: cancelling an already-cancelled order returns \`200\` with the
cancelled order, not a second refund.)
`,
    },
    {
      type: 'text',
      md: md`
## The fix for the \$80 bug: idempotency keys

We can't make the network stop losing replies. We can't make the phone know whether the charge
happened. So we change the *meaning* of the request: we make \`POST\` idempotent on purpose.

**The idea:** before its first attempt, the client invents a unique random string for *this one
payment* — the **idempotency key** — and sends it with the request, and with every retry of that same
request. The server remembers, for each key, the result it produced. When a request arrives:

- **Never seen this key?** Do the work, store \`key → result\`, return the result.
- **Seen this key and it finished?** Don't do the work again. Return the **stored** result.
- **Seen this key and it's still in progress** (the retry raced the original)? Return \`409 Conflict\`
  ("still processing, retry shortly") rather than starting a second charge.

~~~python
def create_payment(request):
    key = request.headers["Idempotency-Key"]
    saved = idem_store.get(key)
    if saved is not None:
        if saved.status == "in_progress":
            return Response(409, {"error": "request in progress, retry later"})
        return saved.response                      # replay: no second charge

    idem_store.put(key, status="in_progress")      # must be atomic: 'insert if absent'
    result = charge_card(request.body)             # the real side effect, done once
    response = Response(201, result)
    idem_store.put(key, status="done", response=response)
    return response
~~~

Three details make this correct in practice rather than just in the sketch:

1. **The key must be created once per *intent*, not once per attempt.** If the app generates a new key
   on each retry, the server sees two different payments. The key is born when the user taps Pay, and is
   reused for every retry of that tap.
2. **"Insert if absent" must be atomic.** If two copies of the request arrive at the same moment, only
   one may win the right to charge. A database unique constraint on the key column does exactly this.
3. **Same key, different body is a client bug.** If key \`abc\` first arrived for \$40 and now arrives
   for \$400, reject it (\`422\` or \`400\`) — never replay the \$40 answer for a \$400 request.

Keys aren't kept forever — typically 24 hours, long enough to cover any sane retry window. Payment
providers such as Stripe expose exactly this header, and it is the standard answer to "how do you
prevent double charges?" in an interview.
`,
    },
    {
      type: 'example',
      title: 'replaying the puzzle with an idempotency key',
      md: md`
Same customer, same flaky tunnel, same \$40 shoes. This time the app generates a key when Pay is
tapped: \`k_91f3\`.

~~~text
t = 0.00 s   phone:  POST /payments  Idempotency-Key: k_91f3  { amount_cents: 4000 }
t = 0.08 s   server: key k_91f3 unseen -> mark in_progress -> charge card $40 (OK)
                     store k_91f3 -> (201, { id: "pay_55", status: "succeeded" })
t = 0.10 s   server: sends 201 ... lost in the tunnel
t = 10.0 s   phone:  timeout. retry #1 after backoff
t = 10.5 s   phone:  POST /payments  Idempotency-Key: k_91f3  { amount_cents: 4000 }
t = 10.6 s   server: key k_91f3 found, status done -> return stored response
                     (card NOT charged again)
t = 10.7 s   phone:  201 { id: "pay_55", status: "succeeded" }  -> "Payment complete"
~~~

**Bank statement: one charge of \$40.** The app can retry 1 time or 10 times; every retry after the
first success just replays \`pay_55\`.

**Now the counting that the puzzle hides.** Suppose, without keys, the app retries up to 3 times, and
in a bad tunnel *every* response except the last is lost — while every request gets through:

| attempt | request arrives? | response arrives? | charges so far (no key) | charges so far (key) |
|---|---|---|---|---|
| 1 | yes | lost | \$40 | \$40 |
| 2 (retry 1) | yes | lost | \$80 | \$40 |
| 3 (retry 2) | yes | lost | \$120 | \$40 |
| 4 (retry 3) | yes | arrives | \$160 | \$40 |

Without the key: $1 + 3 = 4$ charges, **3 of them duplicates** — \$160 for \$40 shoes. With the key:
exactly one. In general, **N retries that all get through, without idempotency, cause up to N duplicate
side effects.** Retries are only as safe as the operation they repeat.

**One more case to check your understanding:** what if the *first request itself* was lost (never
reached the server)? Then on retry the server has never seen \`k_91f3\`, so it charges — correctly, for
the first time. The key handles both worlds the phone can't tell apart. That's the whole trick.
`,
    },
    {
      type: 'text',
      md: md`
## Retries done right: timeouts, backoff, jitter

Idempotency makes retries *safe*. Three more ideas make them *sensible*.

**1. Always set a timeout.** A request with no timeout can wait forever — and a thread waiting forever
is a thread that can't serve anyone else. A timeout turns "hung" into "failed, decide what to do." Pick
it from real latency: if the p99 is 300 ms, a 2-second timeout means "something is genuinely wrong," not
"slightly slow."

**2. Back off exponentially.** If the server is failing because it's overloaded, retrying *immediately*
adds load exactly when it can least take it. So wait longer after each failure — double the wait each
time:

~~~text
base = 100 ms
retry 1: wait 100 ms
retry 2: wait 200 ms
retry 3: wait 400 ms
retry 4: wait 800 ms
retry 5: wait 1600 ms        (usually with a cap, e.g. never more than 10 s)
total waiting across 5 retries: 100 + 200 + 400 + 800 + 1600 = 3,100 ms
~~~

The formula is $\text{wait}_n = \text{base} \times 2^{n-1}$. Quick failures get quick retries; a
persistent outage gets gentle, spaced-out retries instead of a hammering. And always cap the *number* of
retries — after that, report the error to the user.

**3. Only retry what can succeed.** Retry \`5xx\`, timeouts, dropped connections, and \`429\` (after
waiting as \`Retry-After\` says). Don't retry \`400\`, \`401\`, \`403\`, \`404\`, \`409\`: the identical
request will fail identically.

But exponential backoff alone has a hidden flaw, which appears only when you have *many* clients.
`,
    },
    {
      type: 'ponder',
      question: md`A service with **1,000 connected clients** goes down for 30 seconds. Every client
uses the same library: "on failure, wait exactly 1 second, then retry" (later doubling to 2 s, 4 s, …).
The server comes back up — but while recovering (cold caches, warming up) it can handle only about **400
requests per second**. Predict what happens in the next few seconds. Then: what single change to the
clients fixes it?`,
      answer: md`**What happens: a synchronized stampede.** All 1,000 clients failed at about the same
moment, and they all wait *exactly* the same amount of time. So all 1,000 retries arrive within a few
milliseconds of each other — a wall of 1,000 requests hitting a server that can take ~400 per second, and
far fewer in any given millisecond. The server is overwhelmed, times out most of them, and may crash
again. Now the failed clients all back off *exactly* 2 seconds — and arrive together *again*. Exponential
backoff has spaced the waves out in time, but each wave is still a spike. This is called the
**thundering herd** problem, and it can keep a service down long after the original cause is fixed.

**The fix: jitter — add randomness to each wait.** Instead of waiting exactly $2^{n-1} \times$ base,
each client waits a *random* amount between 0 and that value ("full jitter"). Now the 1,000 retries are
spread across the whole window instead of stacked at its end.

Numbers: spread 1,000 retries uniformly over a 4-second window and the server sees about
$1{,}000 \div 4 = 250$ requests per second — comfortably under its 400/s recovery capacity. It serves
them, warms up, and recovers. Same clients, same total number of retries; the only change is *when* they
arrive.

The general principle: **synchronized behaviour across many independent actors is dangerous** — cache
entries that all expire at midnight, cron jobs all set to minute 0, clients all retrying at +1 s.
Randomness is the cheap, powerful cure, and you will see it again in caching (SD.5) and failure handling
(SD.7).`,
    },
    {
      type: 'text',
      md: md`
## Pagination: reading a long list in pieces

A user with 3,000 orders asks for their order history. Returning all 3,000 in one response would be
slow, heavy, and mostly wasted (they'll look at the first 20). So the API returns **pages**.

**Offset pagination** is the obvious way: "skip this many, give me that many."

~~~text
GET /orders?limit=20&offset=0     -> orders 1-20
GET /orders?limit=20&offset=20    -> orders 21-40
GET /orders?limit=20&offset=40    -> orders 41-60
~~~

It's simple and lets you jump to "page 37." But it has two problems. The database must still walk past
all the skipped rows (offset 100,000 means reading and discarding 100,000 rows), so deep pages get slow.
And the second, subtler problem is the one in the next ponder.

**Cursor pagination** instead says "give me the next 20 *after this specific item*." The server returns
an opaque **cursor** — a bookmark, usually an encoded form of the last item's sort key — and the client
sends it back:

~~~json
GET /orders?limit=20

{ "data": [ { "id": "ord_900", ... }, ..., { "id": "ord_881", ... } ],
  "next_cursor": "eyJjcmVhdGVkIjoiMjAyNi0wOS0yNlQxMDoxNCJ9" }

GET /orders?limit=20&cursor=eyJjcmVhdGVkIjoiMjAyNi0wOS0yNlQxMDoxNCJ9

{ "data": [ ...20 older orders... ], "next_cursor": "..." }
~~~

Underneath, the server runs a query like "orders *older than* the bookmarked one, newest first, limit
20" — which an index answers directly, no matter how deep you are. When \`next_cursor\` is missing or
\`null\`, you've reached the end. The price: no "jump to page 37" — you can only walk forward (and
sometimes back).
`,
    },
    {
      type: 'ponder',
      question: md`A social feed shows posts **newest first**, 10 per page, using **offset pagination**.
You load page 1 (\`offset=0\`) and read posts P1 … P10 (P1 is the newest). While you're reading, **3 new
posts** are published. Now you tap "next" (\`offset=10\`). Predict *exactly* which posts you see on page
2. Then predict what happens if, instead, 3 of the posts on page 1 had been **deleted** while you were
reading.`,
      answer: md`**With 3 inserts: you see 3 duplicates.** The list is now N1, N2, N3, P1, P2, …, P10, P11, …
— everything shifted down three places. \`offset=10\` means "skip the first 10 of the *current* list":
those are N1–N3 and P1–P7. So page 2 starts at **P8**: you get P8, P9, P10 (already read!) and then
P11 … P17. Three repeats, and you never see N1–N3 unless you go back to the top.

**With 3 deletes: you silently skip 3 posts.** Now the list shifted *up*: the 7 surviving posts from
page 1 are followed immediately by P11, P12, P13, P14, … Skipping 10 skips the 7 survivors plus **P11,
P12, P13** — so page 2 begins at P14, and P11–P13 are never shown to you at all. Duplicates are annoying;
*skips* are worse, because nobody notices. For an export job ("download all my transactions"), a skip
is data loss.

**Why cursors don't have this bug:** page 2's request is "posts older than P10." Inserts at the top and
deletions elsewhere don't change which posts are older than P10 — so you get exactly P11 … P20. Offsets
describe a *position*, and positions shift under you. Cursors describe a *place in the data*, which
doesn't.

That's the rule of thumb: offset pagination for small, slow-changing lists where "jump to page N"
matters (an admin table); **cursor pagination for feeds, timelines, logs, and anything large or
changing** — which is most of what you'll design.`,
    },
    {
      type: 'text',
      md: md`
## Rate limiting: protecting the server from its clients

One buggy client in a loop can send 10,000 requests a second. A scraper can hammer your search endpoint.
A single enormous customer can starve everyone else. **Rate limiting** caps how many requests a client
(identified by API key, user id, or IP address) may make in a period, and politely rejects the excess
with \`429 Too Many Requests\` and a \`Retry-After\` header.

The most common algorithm is the **token bucket**, and it's easiest to picture literally:

- Each client has a bucket that holds at most **C tokens** (the *capacity*).
- Tokens drip into the bucket at a steady **rate r** per second, until it's full.
- Every request must take one token. **No token? The request gets a 429.**

~~~text
capacity C = 10, refill r = 1 token/s, bucket starts full

t = 0 s    client fires 12 requests at once -> 10 allowed, 2 get 429   (bucket: 0)
t = 5 s    5 tokens have dripped in        -> next 5 requests allowed (bucket: 0)
t = 60 s   bucket refilled, but capped at 10 (not 55!)
~~~

Two numbers, two meanings: **C is how big a burst you tolerate**, **r is the long-run average rate you
allow**. Over any window of $T$ seconds, a client can get at most about $C + r \times T$ requests
through: the stored burst, plus everything that drips in. That's why the token bucket is so popular: it
lets a user's app fire 10 calls when a screen opens (a harmless burst) while still holding their
long-run average to 1 per second.

In a real system the counters live in a fast shared store (like Redis, SD.5) so that every server
enforces the same limit for the same client.

## REST vs RPC vs GraphQL: tradeoffs, not fashion

REST isn't the only way for services to talk. Three styles dominate, and each is best at something
different:

| | **REST** (HTTP + JSON) | **RPC**, e.g. **gRPC** | **GraphQL** |
|---|---|---|---|
| the model | resources + standard methods | call a remote *function*: \`GetOrder(id)\` | client sends a *query* describing exactly the fields it wants |
| data format | JSON text (human-readable) | Protocol Buffers: compact binary, with a strict schema | JSON |
| strengths | universal, debuggable with a browser, HTTP caching just works | fast, small messages, generated client code, streaming built in | one request fetches exactly the nested data a screen needs |
| weaknesses | over-fetching or many round trips for complex screens | not browser-friendly; binary is hard to eyeball | caching and rate limiting are harder; one query can be very expensive |
| typical home | public APIs, most web backends | service-to-service calls inside a company | apps with many different screens over rich, connected data |

The reasoning, not the fashion: a **public** API wants REST because every language and tool speaks it.
**Internal** services calling each other thousands of times a second want gRPC's speed and strict
contracts. A **mobile app** whose home screen needs a user, their last 5 orders, and each order's items
would need several REST round trips (at 200 ms each — remember the first example!); GraphQL fetches it
in one. Plenty of companies use all three, each where it fits.

## Real-time: when the server needs to speak first

HTTP as described so far is *request → response*: the client always speaks first. But some data should
reach the user the moment it exists — a chat message, a delivery driver's location, an AI model's next
word. Four options, in increasing sophistication:

| technique | how it works | good for | cost |
|---|---|---|---|
| **Polling** | client asks "anything new?" every N seconds | data that changes rarely; simple dashboards | wasted requests; up to N seconds stale |
| **Long polling** | client asks; server *holds* the request open until there's news (or ~30 s pass), then client asks again | near-real-time where only plain HTTP works | one open request per client; reconnect after each message |
| **Server-Sent Events (SSE)** | one long HTTP response that the server keeps writing events into | **one-way** server → client streams: notifications, live scores, **LLM token streaming** | one-way only; client-to-server still uses normal requests |
| **WebSockets** | the HTTP connection is upgraded into a persistent **two-way** channel | chat, multiplayer games, collaborative editing | stateful connections: harder to load-balance and scale |

**The LLM connection.** When you use a chat model and the answer appears word by word, you're almost
certainly watching **SSE**. The client sends one ordinary \`POST\` with the prompt; the server responds
with \`Content-Type: text/event-stream\` and keeps the response open, writing a small event each time the
model produces a few tokens:

~~~text
event: content_block_delta
data: {"type": "content_block_delta", "delta": {"text": "Hello"}}

event: content_block_delta
data: {"type": "content_block_delta", "delta": {"text": " there"}}

event: message_stop
data: {"type": "message_stop"}
~~~

Why SSE and not WebSockets? Because the traffic is **one-way**: the user asks once, then the model
talks. SSE is plain HTTP — it passes through proxies and load balancers, reuses the existing
authentication and the normal request/response model — so it gives streaming without the operational
cost of a persistent two-way connection. Choose WebSockets when *both* sides genuinely need to speak at
any moment, as in chat or a multiplayer game.

## What you now own

1. **The central fact of networked systems:** a timeout doesn't tell you whether the request failed or
   succeeded — so every retry is a guess unless the operation is idempotent.
2. **The journey of a request:** DNS → TCP handshake → TLS handshake → HTTP request/response, each
   costing round trips; hence reuse connections, parallelise independent calls, and move servers closer.
3. **HTTP methods and their two key properties:** safe (\`GET\`) and idempotent (\`GET\`, \`PUT\`,
   \`DELETE\`), and why \`POST\` is neither by default.
4. **Status code families** (2xx/3xx/4xx/5xx) and the dozen codes that matter — including which ones are
   worth retrying.
5. **REST resource design:** noun paths, honest status codes, integer money, action endpoints when an
   operation isn't a plain CRUD verb.
6. **Idempotency keys:** one key per user intent, stored atomically with the result, replayed on retry
   — the standard cure for double charges.
7. **Retry discipline:** timeouts, exponential backoff with a cap, **jitter** to prevent synchronized
   stampedes, and retrying only errors that can succeed.
8. **Pagination:** offset (simple, but shifts cause duplicates and skips) vs cursor (stable, scales).
9. **Rate limiting:** the token bucket — capacity sets the burst, refill rate sets the average; reject
   with \`429\` + \`Retry-After\`.
10. **Style and channel choices as tradeoffs:** REST vs gRPC vs GraphQL; polling vs long polling vs SSE vs
    WebSockets — and why LLM streaming uses SSE.

Next: the API says what the system *does*; SD.4 turns to where the data *lives* — databases, and how the
reads you just designed decide how to store them.
`,
    },
  ],
  questions: [
    {
      id: 'sd-l3-q1',
      kind: 'mcq',
      prompt: md`Which HTTP method is **idempotent but not safe**?`,
      options: [
        md`\`GET\``,
        md`\`POST\``,
        md`\`PUT\``,
        md`\`PATCH\``,
      ],
      answer: 2,
      explain: md`\`PUT\` changes state (so it isn't safe) but means "make this resource exactly this," so
repeating it changes nothing further (idempotent). \`GET\` tempts because it *is* idempotent — but it's
also safe, so it doesn't fit "not safe." \`PATCH\` tempts because it's an update like \`PUT\`, but a patch
can be "add 1 to quantity," which is not idempotent, so the method makes no guarantee. \`POST\` is neither:
"create a new one" twice creates two.`,
    },
    {
      id: 'sd-l3-q2',
      kind: 'numeric',
      prompt: md`**Fermi.** A payments app processes **10 million** payments per day. For about **0.1%**
of them, the charge succeeds but the response is lost, and the app — which sends **no idempotency key**
— automatically retries once, and that retry succeeds too. Roughly how many **duplicate charges** happen
per day?`,
      answer: 10000,
      tolerance: 2000,
      explain: md`$10^7 \times 0.001 = 10^4$ — about **10,000 duplicate charges per day**. At an average of
\$40 each, that's roughly \$400,000 a day wrongly taken from customers, plus 10,000 support tickets and
refunds. A "rare" 0.1% event becomes an enormous absolute number at scale — which is exactly why
idempotency keys aren't optional polish in payments. With keys, the answer is zero: each retry replays
the stored result.`,
    },
    {
      id: 'sd-l3-q3',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid's parent was charged twice for one game purchase, and
the kid asks: "How can a computer charge twice if nothing broke?" Explain, using an analogy you invent
(sending letters, ordering pizza by phone, passing notes in class): (1) why the app couldn't tell whether
the payment worked, (2) why trying again caused the double charge, and (3) how a "ticket number" (the
idempotency key) fixes it — including why the ticket number must stay the same when trying again. No
jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **The uncertainty (why the app couldn't tell):** a strong analogy — you phone a pizza shop and order
   one pizza; the shop hears you and starts making it, but the line goes dead before they say "got it."
   You don't know if they heard you or not. Silence looks the same either way.
2. **Why retrying double-charged:** you call again and order "one pizza" — the shop, which never
   hung up on anything, happily makes a *second* pizza. Nobody did anything wrong; the problem is that
   "make me a pizza" means a new pizza every time you say it.
3. **The ticket-number fix:** before calling, you write down a special number, like "order 7351." You say
   it on every call. The shop keeps a list: if they've already made order 7351, they say "yep, that's
   already in the oven" instead of making another. **Why it must stay the same:** if you made up a new
   number on the second call, the shop would think it's a different order — and make a second pizza.
4. **Accuracy:** must convey that the request *did* arrive the first time and only the reply was lost.
   An explanation implying "the first payment failed" misses the core point.
5. **Jargon audit:** "idempotent," "request," "response," "server," "timeout," "API," "retry logic" used
   without a kid-level translation = partial credit at best. Full credit is an explanation a real
   12-year-old could repeat back.`,
    },
    {
      id: 'sd-l3-q4',
      kind: 'mcq',
      prompt: md`Your API's rate limiter decides a client has exceeded its allowance. Which response is
most appropriate?`,
      options: [
        md`\`503 Service Unavailable\``,
        md`\`429 Too Many Requests\` with a \`Retry-After\` header`,
        md`\`403 Forbidden\``,
        md`\`400 Bad Request\``,
      ],
      answer: 1,
      explain: md`\`429\` says precisely "*you* are sending too much; slow down," and \`Retry-After\` tells
a well-behaved client exactly how long to wait. \`503\` tempts because rate limiting feels like
overload — but \`503\` says the *server* is unavailable to everyone, which misleads clients and
monitoring. \`403\` tempts because the request is refused, but \`403\` means "you are never allowed to do
this," so a client would reasonably give up instead of waiting. \`400\` says the request itself is
malformed — it isn't; the same request would succeed a moment later.`,
    },
    {
      id: 'sd-l3-q5',
      kind: 'numeric',
      prompt: md`Rendering a product page requires five backend calls. First **A** (40 ms) must finish,
because its result is needed by the others. Then **B** (60 ms), **C** (90 ms), and **D** (50 ms) are
independent of each other and can run **in parallel**. Finally **E** (30 ms) needs the results of B, C,
and D. What is the total latency in **milliseconds** if everything that can run in parallel does?`,
      answer: 160,
      tolerance: 0,
      explain: md`Sequential stages add; a parallel stage costs its *slowest* member. So: A (40) + max(60,
90, 50) = 90 + E (30) = **160 ms**. Running all five one after another would cost 40 + 60 + 90 + 50 + 30
= 270 ms, so parallelising B, C, D saved 110 ms. Notice what this tells you about optimisation: speeding
up B or D does nothing here — only C sits on the **critical path**. Make C 30 ms faster and the page gets
30 ms faster (down to B's 60 ms, at which point B becomes the bottleneck).`,
    },
    {
      id: 'sd-l3-q6',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Using only the definition "an operation is idempotent if doing it
N times has the same effect on the server's state as doing it once," decide — with a one-line argument
each — whether these are idempotent: (a) \`set balance = 100\`; (b) \`add 10 to balance\`; (c) \`delete
order 7\`; (d) \`append "login" to the activity log\`; (e) \`PUT /users/5\` with the full user record; (f)
\`set status = shipped only if the current status is paid\`. Then (g) redesign operation (b) so a client
can safely retry it after a timeout, and trace what happens when a retry arrives.`,
      rubric: md`**(a) Idempotent.** After one or five applications, the balance is 100.

**(b) Not idempotent.** Once: +10; three times: +30. Each repetition changes state further.

**(c) Idempotent.** After the first, order 7 is gone; repeats leave it gone. The *response* may change
(\`204\` then \`404\`), but idempotency concerns state, not the reply. (Must make this distinction for full
credit.)

**(d) Not idempotent.** Each repeat adds another log entry.

**(e) Idempotent.** "Replace with exactly this record" — the second application finds it already so.

**(f) Idempotent.** First call: paid → shipped. Repeats: status isn't \`paid\` any more, so nothing
changes. Conditional updates are a common way to *make* operations idempotent.

**(g) Redesign, either approach earns credit:**
- **Idempotency key:** the client generates a unique key per intended deposit and sends it with every
  retry; the server atomically records \`key → result\` in the same transaction as the +10 and replays the
  stored result if the key is seen again. Trace: first attempt applies +10 and stores the key; the reply
  is lost; the retry finds the key and returns the original result — balance rose by 10 exactly once.
- **Turn it into a conditional set:** "set balance = 110 if balance is currently 100 (or version = 7)."
  A retry finds the condition false and does nothing (returning the current state or \`409\`).

Full credit: correct verdict with a *derived* reason for all six, the state-vs-response point on (c),
and a (g) redesign with an explicit retry trace. Answers that just recite "PUT and DELETE are
idempotent" without arguing from the definition earn partial credit.`,
    },
    {
      id: 'sd-l3-q7',
      kind: 'mcq',
      prompt: md`Clients already use exponential backoff. Why do well-designed retry policies **also** add
random **jitter** to each wait?`,
      options: [
        md`To make each individual retry happen sooner on average, reducing user-visible latency`,
        md`To spread out retries from many clients so they don't arrive at the recovering server in synchronized waves`,
        md`To make non-idempotent requests like \`POST\` safe to retry`,
        md`To reduce the total number of retries each client needs before succeeding`,
      ],
      answer: 1,
      explain: md`Clients that failed together and use identical backoff retry together, in spikes that
can knock a recovering server over again (the thundering herd). Jitter breaks the synchronization. The
first option tempts because full jitter *does* shorten the average wait, but that's a side effect, not the
purpose — its job is decorrelation across clients. The third is a dangerous confusion: timing never makes
a duplicate charge acceptable; only idempotency (e.g. keys) does. The fourth tempts because a healthier
server means fewer failures overall, but jitter doesn't directly cut any one client's retries.`,
    },
    {
      id: 'sd-l3-q8',
      kind: 'numeric',
      prompt: md`A token-bucket rate limiter has **capacity 20** tokens and refills at **5 tokens per
second**. The bucket starts **full**. A misbehaving client then fires requests as fast as it can —
**100 per second** — for **10 seconds**. Approximately how many of those requests are **allowed**?`,
      answer: 70,
      tolerance: 2,
      explain: md`The client gets the stored burst plus everything that drips in: $C + r \times T = 20 + 5
\times 10 = 70$ allowed. It sent $100 \times 10 = 1{,}000$, so about 930 get \`429\`. After the first
instant the bucket is always empty, so the client is held to exactly the refill rate — 5 per second —
no matter how hard it pushes. That's the token bucket's promise: a burst of up to C, then the long-run
average r.`,
    },
    {
      id: 'sd-l3-q9',
      kind: 'written',
      prompt: md`**API design exercise.** Design the API for a **hotel room booking** service. Users search
available rooms for dates, book a room (paying by card), view their bookings, and cancel a booking (free
until 24 hours before check-in). Write: (1) each endpoint with method and path; (2) one full example
request and response for creating a booking, with status code and key headers; (3) the status code for
each of these: invalid dates, room already taken for those dates, cancelling inside the 24-hour window,
not logged in, too many searches; (4) how you prevent a double booking/charge when the app retries after a
timeout; (5) how you paginate "my bookings" and why.`,
      rubric: md`**(1) Endpoints (reasonable variants accepted):**

~~~text
GET  /rooms/availability?hotel_id=...&check_in=...&check_out=...&limit=...&cursor=...
POST /bookings
GET  /bookings/{id}
GET  /bookings?limit=20&cursor=...
POST /bookings/{id}/cancel
~~~

Noun paths, methods carrying the verbs. Cancel as an action endpoint (or \`PATCH\` with
\`{"status": "cancelled"}\`) rather than \`DELETE\`, because the booking and its refund history persist —
explaining this earns credit.

**(2) Example:** \`POST /bookings\` with \`Authorization\`, \`Content-Type: application/json\`,
\`Idempotency-Key\`, and a body with room id, dates, and payment method. Response \`201 Created\` with a
\`Location: /bookings/bk_...\` header and the booking (id, status, total in integer cents).

**(3) Status codes:** invalid dates (check-out before check-in) → \`400\`; room already taken → \`409\`;
cancelling inside 24 h → \`409\` (clashes with current state; \`422\` also acceptable with reasoning); not
logged in → \`401\`; too many searches → \`429\` with \`Retry-After\`.

**(4) Retries:** an idempotency key generated once per booking attempt (when the user taps Book), reused
on every retry, stored atomically with the result and replayed; same key with a different body rejected.
Also: the "room taken" check and the booking insert must be atomic (e.g. a unique constraint on room +
date), so two *different* users can't both win the last room.

**(5) Pagination:** cursor-based, because bookings are added over time and offset pages would shift,
causing duplicates or skips; a cursor ("bookings older than this one") is stable and uses an index.

Full credit needs all five parts, correct status codes with reasons, and an idempotency answer that
specifies *one key per intent, reused across retries*.`,
    },
    {
      id: 'sd-l3-q10',
      kind: 'mcq',
      prompt: md`A chat interface for a large language model shows the answer word by word as the model
generates it. The client sends one prompt, then only listens. Which transport is the most natural fit —
and the one most LLM APIs use?`,
      options: [
        md`WebSockets, because streaming requires a persistent two-way connection`,
        md`Server-Sent Events: one HTTP response kept open, with the server writing events as tokens are generated`,
        md`Long polling: the client asks for the next token, waits, and asks again`,
        md`Polling every 100 ms for any new tokens`,
      ],
      answer: 1,
      explain: md`The traffic is **one-way** after the prompt: server → client. SSE does exactly that over
plain HTTP (\`Content-Type: text/event-stream\`), so it works with ordinary load balancers, proxies, and
authentication. WebSockets tempt because they're the famous "real-time" technology — but their two-way
channel isn't needed here, and persistent stateful connections are harder to scale. Long polling and
polling would work, clumsily: one request per chunk (or per 100 ms tick) adds round trips, wasted
requests, and choppy output.`,
    },
    {
      id: 'sd-l3-q11',
      kind: 'numeric',
      prompt: md`An export job downloads all of a customer's orders through an API that returns at most
**50 orders per page** (cursor pagination). The customer has **1,234 orders**. How many **requests** does
the job need to fetch every order?`,
      answer: 25,
      tolerance: 0,
      explain: md`$1{,}234 \div 50 = 24.68$, and you can't make 0.68 of a request, so round **up**: 24 full
pages (1,200 orders) plus a 25th page with the remaining 34 — **25 requests**. The job knows it's done
because the 25th response has no \`next_cursor\`. At 200 ms per request that's 5 seconds end to end,
and since cursor pages don't shift, orders created during the export can't cause duplicates or skips
among the ones already being walked. With offset pagination, a new order at the top mid-export would
shift every later page by one.`,
    },
    {
      id: 'sd-l3-q12',
      kind: 'written',
      prompt: md`**Choose the channel and the style.** For each scenario, pick a real-time technique
(polling, long polling, SSE, or WebSockets) **or** an API style (REST, gRPC, GraphQL) — whichever the
scenario is asking about — and justify it in 2–3 sentences with the tradeoff you are accepting: (a) an
internal sales dashboard whose numbers update every 15 minutes; (b) a group chat app; (c) live cricket
scores pushed to millions of viewers; (d) two internal backend services that call each other 50,000 times
per second; (e) a public API that thousands of outside developers will use; (f) a mobile home screen that
needs a user profile, their last 5 orders, and each order's items in one go.`,
      rubric: md`Grade on the *reasoning* — alternative answers earn credit when justified by the same
tradeoffs.

**(a) Polling.** Data changes every 15 minutes, so polling every minute or so is cheap and dead simple;
the few wasted requests cost nothing. Anything persistent is over-engineering.

**(b) WebSockets.** Both sides speak at unpredictable moments (sending, receiving, typing indicators), so
a two-way channel fits. Accepted cost: stateful connections that need a connection layer to scale.

**(c) SSE.** One-way server → viewer, huge audience; plain HTTP streams pass through standard
infrastructure and reconnect automatically. WebSockets would work but pay for a two-way channel nobody
uses.

**(d) gRPC.** High-volume internal traffic benefits from compact binary messages, strict schemas, and
generated clients; not needing browser-friendliness removes its main drawback.

**(e) REST.** Every language and tool speaks HTTP + JSON, it's debuggable with a browser or \`curl\`, and
HTTP caching works — the priority for outsiders is accessibility, not raw speed.

**(f) GraphQL** (or a purpose-built REST endpoint for that screen). One query fetches exactly the nested
data, avoiding several sequential round trips — which matter on mobile networks with high RTT. Accepted
cost: harder caching and the need to limit expensive queries.

Full credit: all six with a correct choice *and* a named tradeoff each. Answers that pick WebSockets for
everything "real-time," or GraphQL because it's modern, show the fashion-over-tradeoff thinking this
lesson warns against.`,
    },
  ],
}
