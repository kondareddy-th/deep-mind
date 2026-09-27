// Python Foundations, Lesson 6 — Iterators, generators & comprehensions
//
// Content uses the `md` tag from ../md.js: it behaves like String.raw, and an escaped
// backtick \` becomes a real backtick. Code blocks use ~~~python fences (no escaping).
// NEVER write the sequence dollar-brace inside content (JS interpolation).

import { md } from '../md.js'

export default {
  id: 'py-l6',
  title: "Py.6 Iterators, generators & comprehensions — processing data you can't fit in memory",
  subtitle:
    'A 40 GB log file, a 16 GB laptop, and two lines of code that look almost identical: one crashes, one sails through. This lesson opens up the for loop to see why, then builds the tools that let you process data far bigger than your memory — one item at a time.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Your team's web server wrote a log file overnight. It's 40 GB. Your laptop has 16 GB of RAM. Your job
is simple: count how many lines contain the word \`ERROR\`.

Here's the first thing most people write:

~~~python
f = open("server.log")
lines = f.readlines()          # read every line into a list
errors = 0
for line in lines:
    if "ERROR" in line:
        errors += 1
print(errors)
~~~

It runs for a minute, your fan screams, the machine starts swapping, and then — \`MemoryError\`, or
the operating system simply kills Python. Now here's a version that differs by one line:

~~~python
f = open("server.log")
errors = 0
for line in f:                 # loop over the file directly
    if "ERROR" in line:
        errors += 1
print(errors)
~~~

This one finishes happily, and while it runs Python's memory use barely moves — a few megabytes,
the whole time, whether the file is 40 KB or 40 GB.

Same file. Same loop body. Same answer. One needs more memory than your computer has; the other
needs almost none. **What is the second version doing differently?**

A quick size check on the first version, so you feel the problem. Say the average line is about 100
characters. Then 40 GB is roughly 400 million lines. \`readlines()\` turns every one into a Python
string, and each string carries about 50 bytes of bookkeeping on top of its characters, plus an
8-byte slot in the list pointing at it. That's about 400 million × (100 + 50 + 8) bytes ≈ **63 GB**.
Not a chance.

The second version never builds that list. It asks the file for *one line*, runs the loop body,
forgets that line, and asks for the *next* one. At any moment only one line is in memory. To see how
a \`for\` loop can do that, we need to look at what \`for\` actually does.

## What \`for\` really does

A \`for\` loop doesn't know anything about lists, files, strings, or dicts. It speaks one tiny
language, built from two built-in functions:

- \`iter(thing)\` — "give me something that can hand out your items one at a time."
- \`next(that_something)\` — "hand me the next item."

When there are no items left, \`next\` doesn't return a special value — it **raises** an exception
called \`StopIteration\`. Try it by hand:

~~~python
nums = [10, 20, 30]
it = iter(nums)
print(next(it))   # 10
print(next(it))   # 20
print(next(it))   # 30
print(next(it))   # raises StopIteration
~~~

That's the entire protocol. So this loop:

~~~python
for x in nums:
    print(x)
~~~

is really this, written out in full:

~~~python
it = iter(nums)              # step 1: get a hand-out-one-at-a-time object
while True:
    try:
        x = next(it)         # step 2: ask for the next item
    except StopIteration:    # step 3: no more items -> leave the loop
        break
    print(x)                 # the loop body
~~~

Read that while-loop slowly, because it's the key to the whole lesson. Nowhere does it ask "how long
is \`nums\`?" or "give me item number 7". It only ever asks "next, please". That's why \`for\` works on
a 40 GB file: the file answers "next, please" by reading one more line from disk.

## Two words: iterable and iterator

The thing \`iter()\` gives back has a name. An **iterator** is an object that hands out one item at a
time *and remembers where it is*. You call \`next\` on it, it gives you an item and moves its
bookmark forward.

An **iterable** is anything you can *get* an iterator from — anything you can hand to \`iter()\`.
Lists, strings, tuples, dicts, sets, ranges, and files are all iterables.

The picture to keep: a list is a **bookshelf**; an iterator is a **bookmark** in it. The shelf just
sits there holding everything. The bookmark knows your position and moves forward one book at a time.

~~~python
shelf = ["a", "b", "c"]
bookmark1 = iter(shelf)
bookmark2 = iter(shelf)
print(next(bookmark1))   # a
print(next(bookmark1))   # b
print(next(bookmark2))   # a    <- a separate bookmark, starting from the beginning
print(next(shelf))       # TypeError: 'list' object is not an iterator
~~~

That last line is worth remembering: a list is iterable, but it is *not* an iterator — it has no
bookmark, so \`next\` makes no sense on it. Every \`for\` loop over a list quietly makes a fresh
bookmark, which is why you can loop over the same list as many times as you like.

## Building an iterator yourself

In Py.3 you met double-underscore methods: \`__len__\` is what Python calls when you write
\`len(x)\`, \`__repr__\` when it needs to show \`x\`. The iteration protocol is the same trick:

- \`iter(x)\` calls \`x.__iter__()\`
- \`next(x)\` calls \`x.__next__()\`

So you can build your own iterator as a class. Here's one that counts down:

~~~python
class Countdown:
    def __init__(self, start):
        self.current = start          # the bookmark

    def __iter__(self):
        return self                   # I am already an iterator: hand out myself

    def __next__(self):
        if self.current <= 0:
            raise StopIteration       # "no more items"
        value = self.current
        self.current -= 1             # move the bookmark forward
        return value


for n in Countdown(3):
    print(n)
# 3
# 2
# 1

print(list(Countdown(4)))   # [4, 3, 2, 1]
~~~

Nothing in \`Countdown\` stores "all the numbers". It stores *one* number — where it is — and
computes the next item only when asked. \`Countdown(1_000_000_000)\` uses exactly as much memory as
\`Countdown(3)\`.

It works, but look at the ceremony: a class, an \`__init__\`, an \`__iter__\` that returns \`self\`,
a \`__next__\` that manually saves state, manually updates it, and manually raises
\`StopIteration\`. Twelve lines to say "count down from 3". There's a much easier way.
`,
    },
    {
      type: 'text',
      md: md`
## Generators: a function that can pause

Here is the same countdown written as a **generator**:

~~~python
def countdown(start):
    while start > 0:
        yield start
        start -= 1


for n in countdown(3):
    print(n)
# 3
# 2
# 1
~~~

Four lines. The new word is \`yield\`. Any function with \`yield\` anywhere in its body becomes a
**generator function**, and it behaves very differently from a normal function:

1. **Calling it doesn't run it.** \`countdown(3)\` runs *none* of the body. It just returns a
   **generator object** — which is an iterator, ready and waiting.
2. **\`next()\` runs the body until the next \`yield\`**, hands out the yielded value, and then
   **pauses** — freezing every local variable exactly where it is.
3. **The next \`next()\` resumes right after that \`yield\`**, with all the locals still intact.
4. **When the body finishes** (falls off the end, or hits \`return\`), the generator raises
   \`StopIteration\` for you.

~~~python
g = countdown(3)
print(g)          # <generator object countdown at 0x...>
print(next(g))    # 3
print(next(g))    # 2
print(next(g))    # 1
print(next(g))    # raises StopIteration
~~~

Compare with the class. The bookmark (\`self.current\`) became an ordinary local variable
(\`start\`) — the generator *remembers its locals* between calls, so you don't need \`self\` to store
state. The \`raise StopIteration\` became "the function ends". Python writes the \`__iter__\` and
\`__next__\` for you.

A normal function is like a phone call: it starts, runs to the end, hangs up, and forgets everything.
A generator is like reading a book with a bookmark: you read to the next \`yield\`, close the book,
and when you open it again you're exactly where you left off.

The best way to *believe* the pausing is to watch it. Put prints everywhere.
`,
    },
    {
      type: 'ponder',
      question: md`Predict the **exact** output of this program, line by line, before revealing. The
tricky part is the *interleaving* — which prints come from inside the generator and which from the
loop, and in what order.

~~~python
def countdown(n):
    print("start")
    while n > 0:
        print("about to yield", n)
        yield n
        print("resumed after", n)
        n -= 1
    print("done")

g = countdown(2)
print("created")
for x in g:
    print("got", x)
~~~`,
      answer: md`
~~~python
created
start
about to yield 2
got 2
resumed after 2
about to yield 1
got 1
resumed after 1
done
~~~

Walk through it:

- \`g = countdown(2)\` prints **nothing**. The body hasn't started — you only got a generator object.
  That's why \`created\` comes first, *before* \`start\`. (Most people get this line wrong.)
- The \`for\` calls \`next(g)\`: the body finally runs — \`start\`, \`about to yield 2\` — and freezes at
  \`yield 2\`. The loop body runs: \`got 2\`.
- The \`for\` calls \`next(g)\` again: the generator resumes *right after the yield* — \`resumed after 2\`,
  then \`n\` becomes 1, loops, \`about to yield 1\`, freezes. Loop body: \`got 1\`.
- Third \`next(g)\`: \`resumed after 1\`, \`n\` becomes 0, the while ends, \`done\`, the function falls off
  the end → \`StopIteration\` → the \`for\` loop exits quietly.

The control flow ping-pongs between the generator and the loop, one item at a time. The generator
never runs ahead. That "never runs ahead" is exactly what saves your memory.`,
    },
    {
      type: 'text',
      md: md`
## Laziness, measured

Doing work only when someone asks for the result is called being **lazy** — in programming, a
compliment. The opposite, computing everything up front, is called **eager**. Let's put numbers on it
with \`sys.getsizeof\`, which reports how many bytes an object takes:

~~~python
import sys

def squares(n):
    for i in range(n):
        yield i * i

big_list = [i * i for i in range(1_000_000)]   # eager: a million squares, now
lazy = squares(100_000_000)                      # lazy: zero squares, so far

print(sys.getsizeof(big_list))   # 8000056   (about 8 MB)
print(sys.getsizeof(lazy))       # about 200 (exact number varies by Python version)
~~~

Two things to notice, and the second one is sneaky:

1. The generator for **100 million** squares is about 200 bytes. It stores the paused function —
   its current \`i\`, where it's stopped — and nothing else. Make it a billion; still about 200 bytes.
2. That 8 MB for the list is **only the list's slots** — 8 bytes per slot, each one pointing at an
   integer object that lives somewhere else. \`sys.getsizeof\` doesn't count the things pointed to.
   Each integer object is another 28 bytes or so (\`sys.getsizeof(12345)\` is 28).

So the true cost of a list of 100 million ints is roughly:

- slots: 100 million × 8 bytes = 0.8 GB
- int objects: 100 million × 28 bytes = 2.8 GB
- total: **about 3.6 GB** — versus about 200 bytes for the generator.

That's a ratio of roughly twenty million to one. Laziness isn't a small optimisation; for big data
it's the difference between "runs" and "doesn't".

The honest trade-off: a generator only gives you items *in order, once*. You can't ask it for item
number 5,000 without walking past the first 4,999, and you can't ask for \`len()\`. When you need
random access or multiple passes, a list is the right tool — as long as it fits.

## Generator expressions

Writing a whole \`def\` for a one-line generator is a lot of typing, so Python has a shorthand. Put
the loop *inside parentheses*:

~~~python
lazy_squares = (i * i for i in range(100_000_000))
print(next(lazy_squares))   # 0
print(next(lazy_squares))   # 1
print(next(lazy_squares))   # 4
~~~

That's a **generator expression**. It means exactly the same as the \`squares\` generator function
above. And when it's the only argument to a function, you can even drop its own parentheses:

~~~python
total = sum(i * i for i in range(1_000_000))
print(total)   # 333332833333500000
~~~

That line adds up a million squares while holding only one of them in memory at a time.
`,
    },
    {
      type: 'ponder',
      question: md`Two lines that differ only in their brackets:

~~~python
a = [x * x for x in range(100_000_000)]   # line A: square brackets
b = (x * x for x in range(100_000_000))   # line B: round brackets
print(next(b))
~~~

Predict: (1) Which of lines A and B takes several seconds to run and which is instant? (2) Roughly how
much memory does each one hold on to? (3) At the moment \`print(next(b))\` runs, how many
multiplications has \`b\` done in total?`,
      answer: md`**(1)** Line A takes seconds; line B is instant. Square brackets make a **list** —
eager — so line A performs all 100 million multiplications right there, before moving on. Round
brackets make a **generator** — lazy — so line B does no multiplications at all; it just builds the
paused machinery.

**(2)** Line A holds roughly 0.8 GB of list slots plus about 100 million integer objects of 28–32
bytes each (big squares need a few more bytes than small numbers) — **about 4 GB**. On a 16 GB laptop
that works, slowly; make it a billion and it crashes. Line B holds **about 200 bytes**, however big
the range.

**(3)** Exactly **one**. \`next(b)\` wakes the generator up, it computes \`0 * 0\`, yields \`0\`, and
freezes. The other 99,999,999 squares have not been computed and will only be computed if someone
asks.

The rule of thumb: if you're going to *loop over the result once* — sum it, count it, write it to a
file, feed it to the next step — use round brackets. Use square brackets only when you genuinely need
all the results sitting in memory at once (to index into, sort, or loop over repeatedly).`,
    },
    {
      type: 'text',
      md: md`
## Pipelines: chaining lazy steps

Back to the log. Real questions are rarely "count the lines with ERROR". They're more like "*which
service* is producing the errors?" That needs several steps: read lines, keep only errors, pull out
the service name, count per service.

The tempting way is to do each step as a list:

~~~python
lines = open("server.log").readlines()             # 63 GB list
errors = [l for l in lines if " ERROR " in l]      # another big list
services = [l.split()[3] for l in errors]          # another list
~~~

Every step builds a full intermediate list, and the very first one already doesn't fit. The fix is to
make every step a generator that **takes an iterator in and yields items out**. Then you can snap them
together like pipe sections, and one line flows through the *whole* pipe before the next line is even
read from disk.

If you've ever used a Unix shell, this is exactly \`cat server.log | grep ERROR | cut -d' ' -f4\`:
each program handles a trickle of lines, never the whole file.
`,
    },
    {
      type: 'example',
      title: 'a lazy log pipeline, end to end',
      md: md`
To keep this runnable on any computer, we fake a small log file with \`io.StringIO\` — an object that
behaves like an open file but reads from a string. On the real 40 GB file you'd swap in
\`open("server.log")\` and change nothing else.

~~~python
import io

fake_file = io.StringIO(
    "2026-09-01 12:00:01 INFO auth login ok\n"
    "2026-09-01 12:00:02 ERROR db timeout\n"
    "2026-09-01 12:00:03 ERROR auth bad token\n"
    "2026-09-01 12:00:04 INFO db query ok\n"
    "2026-09-01 12:00:05 ERROR db timeout\n"
)

def read_lines(f):
    for line in f:
        yield line.rstrip("\n")          # strip the newline, hand out one line

def only_errors(lines):
    for line in lines:
        if " ERROR " in line:
            yield line                   # pass errors through, drop everything else

def service_names(lines):
    for line in lines:
        parts = line.split()             # date, time, level, service, message...
        yield parts[3]

pipeline = service_names(only_errors(read_lines(fake_file)))
# Nothing has been read yet! The pipeline is three paused generators, stacked.

counts = {}
for service in pipeline:
    counts[service] = counts.get(service, 0) + 1

print(counts)   # {'db': 2, 'auth': 1}
~~~

Trace the *first* item the \`for\` loop receives:

1. The loop calls \`next\` on \`service_names\`, which needs a line, so it calls \`next\` on
   \`only_errors\`.
2. \`only_errors\` needs a line, so it calls \`next\` on \`read_lines\`, which reads line 1 from the file
   (\`INFO auth ...\`) and yields it.
3. \`only_errors\` checks it — not an error — and asks \`read_lines\` for another. Line 2
   (\`ERROR db timeout\`) passes and is yielded up.
4. \`service_names\` splits it and yields \`'db'\`. The loop counts it.

Only then does line 3 get read. At no point does more than one line exist in the pipe. The memory used
is: one line, plus the \`counts\` dict — which has one entry per *service*, maybe a few dozen, no
matter how big the log is.

The same pipeline with generator expressions, for when each step is a one-liner:

~~~python
with open("server.log") as f:
    lines = (line.rstrip("\n") for line in f)
    errors = (line for line in lines if " ERROR " in line)
    services = (line.split()[3] for line in errors)

    counts = {}
    for service in services:
        counts[service] = counts.get(service, 0) + 1
~~~

Notice the loop is *inside* the \`with\` block. The generators read from \`f\` lazily, so the file must
still be open when the loop actually pulls items through. (Move the loop outside the \`with\` and you
get \`ValueError: I/O operation on closed file\` — laziness means the work happens *later* than the
line that sets it up.)
`,
    },
    {
      type: 'ponder',
      question: md`You compute a total, then want to reuse the same numbers for a second calculation.
Predict both printed values:

~~~python
g = (x * x for x in range(5))
print(sum(g))
print(sum(g))
~~~`,
      answer: md`
~~~python
30
0
~~~

The first \`sum\` pulls all five items — 0, 1, 4, 9, 16 — and adds them: **30**. The second \`sum\`
asks the *same* generator for items, and it has none left: its bookmark is at the end, and bookmarks
only move forward. The very first \`next\` raises \`StopIteration\`, so \`sum\` adds up nothing and
returns **0**.

No error, no warning — just a wrong answer. This is the **exhaustion gotcha**, and it bites
everyone once: *a generator (like any iterator) can be consumed only once.*

Compare a list: \`nums = [x * x for x in range(5)]\`, then \`sum(nums)\` twice gives 30 and 30,
because each \`sum\` makes its own fresh bookmark into the shelf. A generator isn't a shelf; it *is*
the bookmark.

Three fixes, depending on your situation:

~~~python
# Fix 1: small data -> just make a list and reuse it
nums = [x * x for x in range(5)]
print(sum(nums), max(nums))        # 30 16

# Fix 2: big data -> call the generator function again for a fresh generator
def squares(n):
    for x in range(n):
        yield x * x
print(sum(squares(5)), max(squares(5)))   # 30 16

# Fix 3: big data, one pass -> compute everything you need in a single loop
total, biggest = 0, None
for v in squares(5):
    total += v
    biggest = v if biggest is None else max(biggest, v)
print(total, biggest)              # 30 16
~~~

Open files behave the same way, by the way: loop over \`f\` once and a second loop over \`f\` gets
nothing, because the file's bookmark is at the end.`,
    },
    {
      type: 'text',
      md: md`
## Comprehensions: the build-a-list loop, in one line

You've been seeing \`[x * x for x in ...]\` all lesson. Time to take it apart properly, because you
will write hundreds of these. Start with a loop you've written many times:

~~~python
squares = []
for x in range(6):
    squares.append(x * x)
print(squares)   # [0, 1, 4, 9, 16, 25]
~~~

Three lines of ceremony — make an empty list, loop, append — to say one thing: "the square of each
x". A **list comprehension** says exactly that:

~~~python
squares = [x * x for x in range(6)]
print(squares)   # [0, 1, 4, 9, 16, 25]
~~~

Read it left to right as English: "*x times x*, for each *x* in *range(6)*". The part before
\`for\` is what goes into the list; the part after is where the items come from.

**Filtering** — add an \`if\` at the end to keep only some items:

~~~python
nums = [4, -2, 7, 0, -5, 3]
positives = [n for n in nums if n > 0]
print(positives)   # [4, 7, 3]
~~~

**Choosing between two values** — a different \`if\`, at the *front*, with an \`else\`:

~~~python
labels = ["even" if n % 2 == 0 else "odd" for n in [1, 2, 3]]
print(labels)   # ['odd', 'even', 'odd']
~~~

Keep the two apart: an \`if\` at the **end** *filters* (decides whether an item gets in at all, no
\`else\` allowed). An \`if ... else\` at the **front** *transforms* (every item gets in, as one value or
the other).

The same idea works for dicts and sets — just change the brackets:

~~~python
words = ["cat", "horse", "ox", "cat"]

lengths = {w: len(w) for w in words}      # dict comprehension: key: value
print(lengths)   # {'cat': 3, 'horse': 5, 'ox': 2}

unique = {w for w in words}               # set comprehension: duplicates vanish
print(len(unique))   # 3

prices = {"apple": 3, "pear": 5}
by_price = {v: k for k, v in prices.items()}   # flip a dict around
print(by_price)   # {3: 'apple', 5: 'pear'}
~~~

Four bracket types, one pattern: \`[...]\` list, \`{k: v ...}\` dict, \`{...}\` set, \`(...)\` generator.
Only the last one is lazy.

## When a comprehension stops helping

You can stack several \`for\`s, and they run in the same order as nested loops written top to bottom:

~~~python
grid = [[1, 2, 3], [4, 5, 6]]
flat = [n for row in grid for n in row]   # "for row in grid:  for n in row:"
print(flat)   # [1, 2, 3, 4, 5, 6]
~~~

That's still readable. This is not:

~~~python
pairs = [(a, b) for a in xs if a > 0 for b in ys if b != a if (a + b) % 3 == 0]
~~~

When you have to squint, write the loop. Loops give you room for names and comments:

~~~python
pairs = []
for a in xs:
    if a <= 0:
        continue                   # only positive a
    for b in ys:
        if b != a and (a + b) % 3 == 0:
            pairs.append((a, b))
~~~

A good rule: **one \`for\` and one condition is a comprehension; more than that, consider a loop.**
Comprehensions exist to make code *easier* to read. The moment one doesn't, it has lost its reason to
exist. And never use a comprehension just for side effects, like \`[print(x) for x in items]\` — that
builds a useless list of \`None\`s. If you're not collecting results, use a plain \`for\`.
`,
    },
    {
      type: 'example',
      title: 'rewriting real loops as comprehensions',
      md: md`
Each block shows a loop you might write this week, then the comprehension that replaces it. Check
that each pair prints the same thing.

~~~python
students = [("Asha", 91), ("Ben", 58), ("Chen", 77), ("Dev", 45)]

# 1. Names of students who passed (score >= 60)
passed = []
for name, score in students:
    if score >= 60:
        passed.append(name)
print(passed)                                        # ['Asha', 'Chen']

passed = [name for name, score in students if score >= 60]
print(passed)                                        # ['Asha', 'Chen']

# 2. A lookup table name -> score
table = {}
for name, score in students:
    table[name] = score
table = {name: score for name, score in students}
print(table["Chen"])                                 # 77

# 3. Grade letters for everyone (transform, not filter)
grades = ["pass" if score >= 60 else "fail" for name, score in students]
print(grades)                                        # ['pass', 'fail', 'pass', 'fail']

# 4. Which first letters appear? (a set: no duplicates)
letters = {name[0] for name, score in students}
print(sorted(letters))                               # ['A', 'B', 'C', 'D']

# 5. Average score, without building a list at all
average = sum(score for name, score in students) / len(students)
print(average)                                       # 67.75
~~~

Line 5 is a small habit worth building: \`sum(score for ...)\` feeds a generator expression straight
into \`sum\`, so no intermediate list exists. With four students it doesn't matter. With four hundred
million log lines it's the whole game.
`,
    },
    {
      type: 'text',
      md: md`
## Tools that speak the protocol: enumerate, zip, itertools

Because \`for\` only needs "next, please", Python ships many small tools that take an iterator and
give back an iterator — all lazy, all happy with 40 GB inputs.

**\`enumerate\`** — when you need the position *and* the item. Replaces the clumsy
\`for i in range(len(items))\`:

~~~python
for i, word in enumerate(["red", "green", "blue"], start=1):
    print(i, word)
# 1 red
# 2 green
# 3 blue
~~~

**\`zip\`** — walks several iterables side by side, handing out tuples. It **stops at the shortest**,
silently:

~~~python
names = ["Asha", "Ben", "Chen"]
scores = [91, 58]
print(list(zip(names, scores)))   # [('Asha', 91), ('Ben', 58)]   <- Chen quietly dropped
~~~

(If unequal lengths would be a bug in your program, write \`zip(names, scores, strict=True)\` and
Python raises an error instead of dropping items.)

The \`itertools\` module holds the rest. Four you'll use constantly:

~~~python
from itertools import islice, chain, count, groupby

# count: an endless counter -- lazy, so "endless" is fine
# islice: take a slice of ANY iterator (you can't write gen[:4] on a generator)
print(list(islice(count(10, 5), 4)))          # [10, 15, 20, 25]

# islice on a file: peek at the first 3 lines of a huge log, reading only 3 lines
# with open("server.log") as f:
#     for line in islice(f, 3):
#         print(line)

# chain: glue iterables end to end, lazily
print(list(chain([1, 2], [3], (x for x in [4, 5]))))   # [1, 2, 3, 4, 5]
~~~

**\`groupby\`** — groups *consecutive* equal items. That word "consecutive" is a trap:

~~~python
levels = ["error", "info", "error", "error", "info"]

print([(k, len(list(g))) for k, g in groupby(levels)])
# [('error', 1), ('info', 1), ('error', 2), ('info', 1)]     <- NOT what you wanted

print([(k, len(list(g))) for k, g in groupby(sorted(levels))])
# [('error', 3), ('info', 2)]                                  <- sort first
~~~

\`groupby\` is lazy: it only ever looks at the current item and the one before, so it can't know that
another \`"error"\` is coming three items later. It starts a new group every time the value changes.
**Sort by the same key first**, or data that's already grouped (like a log sorted by date, grouped by
date) — otherwise you get the same key several times. And note sorting means loading everything into
a list; for huge unsorted data, counting with a dict (as in the pipeline) is usually the better tool.
`,
    },
    {
      type: 'example',
      title: 'itertools on a day of logs: errors per hour',
      md: md`
Log files are written in time order, which makes them *already grouped by hour* — exactly the case
where \`groupby\` shines without any sorting, and without loading the file.

~~~python
import io
from itertools import groupby

log = io.StringIO(
    "09:05 ERROR db\n"
    "09:40 INFO auth\n"
    "09:59 ERROR auth\n"
    "10:02 ERROR db\n"
    "11:15 INFO db\n"
    "11:30 ERROR db\n"
    "11:31 ERROR db\n"
)

def hour_of(line):
    return line[:2]                     # "09:05 ..." -> "09"

for hour, lines_in_hour in groupby(log, key=hour_of):
    n_errors = sum(1 for line in lines_in_hour if " ERROR " in line)
    print(hour, n_errors)
# 09 2
# 10 1
# 11 2
~~~

What's happening:

- \`groupby(log, key=hour_of)\` reads lines one at a time and starts a new group whenever
  \`hour_of(line)\` changes. The \`key=\` works like the \`key=\` in \`sorted\`: "group by *this*".
- Each \`lines_in_hour\` is itself a lazy iterator over just that hour's lines.
- \`sum(1 for line in ... if ...)\` counts matching items with a generator expression — a common idiom
  for "how many?" without building a list.

Now the gotcha, in a new costume. The inner group is an iterator too, and once \`groupby\` moves on to
the next hour, the previous group is gone. If you'd saved them — \`groups = list(groupby(log,
key=hour_of))\` — and looped over the groups later, every one would be empty. Consume each group
inside the loop, while it's current.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The iteration protocol:** \`for x in thing\` is \`iter(thing)\`, then \`next()\` over and over
   until \`StopIteration\` — and you can write that while-loop yourself.
2. **Iterable vs iterator:** the bookshelf (list, file, range — anything \`iter()\` accepts) versus the
   bookmark (hands out one item at a time, remembers its place, only moves forward).
3. **Iterator classes** with \`__iter__\` returning \`self\` and \`__next__\` raising \`StopIteration\`
   — the same dunder idea as Py.3.
4. **Generators:** a function with \`yield\` returns a paused object; each \`next()\` runs to the next
   \`yield\` and freezes the locals. Calling it runs *nothing*.
5. **Laziness in numbers:** a list of 100 million ints is about 3.6 GB; a generator for them is about
   200 bytes. That's why \`for line in f\` handles a 40 GB file.
6. **Pipelines:** stack generators (read → filter → parse → count) so one item flows through every
   stage before the next is read — memory stays flat, like a Unix pipe.
7. **Exhaustion:** a generator can be consumed once; the second \`sum\` gives 0. Fix it with a list, a
   fresh call, or a single pass.
8. **Comprehensions:** list/dict/set/generator forms, filter-\`if\` at the end versus choose-\`if else\`
   at the front — and the judgment to switch to a loop when one gets hard to read.
9. **The toolkit:** \`enumerate\`, \`zip\` (stops at the shortest), \`islice\`, \`chain\`, \`count\`,
   and \`groupby\` (groups only *consecutive* items — sort first).

Next: what happens when things go wrong mid-stream — exceptions, \`with\` blocks, and writing code
that cleans up after itself even when the 39th gigabyte turns out to be corrupted.
`,
    },
  ],
  questions: [
    {
      id: 'py-l6-q1',
      kind: 'mcq',
      prompt: md`When Python runs \`for x in thing:\`, what does it do first with \`thing\`?`,
      options: [
        md`Calls \`len(thing)\` to learn how many times to loop, then reads items by index 0, 1, 2, ...`,
        md`Calls \`iter(thing)\` to get an iterator, then calls \`next()\` on that iterator until it raises \`StopIteration\``,
        md`Calls \`next(thing)\` directly, until it returns \`None\``,
        md`Copies \`thing\` into a list, then walks through the list`,
      ],
      answer: 1,
      explain: md`\`for\` only ever does \`iter()\` once, then \`next()\` repeatedly. Option A is tempting
if you've seen counting loops in other languages — but generators and files have no \`len()\`, and
\`for\` works on them fine. Option C is close but wrong twice: calling \`next\` directly on a list fails
(a list isn't an iterator), and the end is signalled by the \`StopIteration\` *exception*, not by
returning \`None\` — which matters, because \`None\` can be a perfectly legitimate item. Option D would
make the 40 GB log impossible, which is exactly the puzzle this lesson started with.`,
    },
    {
      id: 'py-l6-q2',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
words = ["apple", "Avocado", "banana", "apple", "cherry", "Banana", "fig"]
s = {w.lower() for w in words if len(w) > 5}
print(len(s) + sum(len(w) for w in s))
~~~`,
      answer: 22,
      tolerance: 0,
      explain: md`The filter \`len(w) > 5\` keeps "Avocado" (7), "banana" (6), "cherry" (6), "Banana" (6) —
"apple" has exactly 5 letters and fails \`> 5\`, and "fig" is too short. Lowercasing turns "Banana"
into "banana", and because it's a **set**, the duplicate vanishes: \`s = {'avocado', 'banana',
'cherry'}\`. So \`len(s)\` is 3 and the lengths sum to 7 + 6 + 6 = 19. Total **22**. The common wrong
answers come from counting "apple" (off-by-one on \`>\` vs \`>=\`) or forgetting that the set merges the
two bananas.`,
    },
    {
      id: 'py-l6-q3',
      kind: 'mcq',
      prompt: md`This generator function has a \`print\` on its first line. What appears on the screen
when the line \`g = numbers()\` runs?

~~~python
def numbers():
    print("starting")
    yield 1
    yield 2

g = numbers()
~~~`,
      options: [
        md`\`starting\``,
        md`\`starting\` followed by \`1\``,
        md`Nothing at all`,
        md`An error, because a function containing \`yield\` must be called with \`next\``,
      ],
      answer: 2,
      explain: md`Calling a generator function runs **none** of its body — it only builds and returns a
paused generator object. \`starting\` appears only on the first \`next(g)\` (or the first step of a
\`for\` loop). Option A is what every normal function would do, which is why it tempts; it's exactly the
difference between a phone call and a bookmarked book. Option D is half right in spirit — the body
does need \`next\` to run — but calling \`numbers()\` itself is perfectly legal; that's how you get the
generator.`,
    },
    {
      id: 'py-l6-q4',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
g = (x * x for x in range(5))
a = sum(g)
b = sum(g)
print(a + b)
~~~`,
      answer: 30,
      tolerance: 0,
      explain: md`\`a\` is 0 + 1 + 4 + 9 + 16 = 30. The first \`sum\` exhausts the generator, so the second
\`sum\` receives no items at all and returns 0. \`a + b\` = **30**. If you answered 60, you treated
\`g\` like a list, which can be looped over again and again. A generator is a bookmark, not a
bookshelf: once it reaches the end it stays there — silently, with no error.`,
    },
    {
      id: 'py-l6-q5',
      kind: 'mcq',
      prompt: md`What does this print?

~~~python
from itertools import groupby
pets = ["cat", "dog", "cat", "cat"]
print([k for k, g in groupby(pets)])
~~~`,
      options: [
        md`\`['cat', 'dog']\``,
        md`\`['cat', 'dog', 'cat']\``,
        md`\`['cat', 'cat', 'cat', 'dog']\``,
        md`\`['cat', 'dog', 'cat', 'cat']\``,
      ],
      answer: 1,
      explain: md`\`groupby\` groups only **consecutive** equal items: "cat" | "dog" | "cat", "cat" — three
groups, so the keys are \`['cat', 'dog', 'cat']\`. Option A is what you'd get from
\`groupby(sorted(pets))\`, and it's the answer most people expect because "group by" sounds like it
should collect *all* the cats — that expectation is the whole gotcha. Option C looks sorted but
groupby never sorts anything. Option D would mean no grouping happened at all; the last two cats are
adjacent, so they do merge into one group.`,
    },
    {
      id: 'py-l6-q6',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
def tripler():
    x = 1
    while True:
        yield x
        x = x * 3

it = tripler()
next(it)
next(it)
print(next(it) + next(it))
~~~`,
      answer: 36,
      tolerance: 0,
      explain: md`The generator yields 1, 3, 9, 27, 81, ... forever — \`while True\` is fine because it's
lazy and only runs when asked. The two bare \`next(it)\` calls consume 1 and 3 (their values are
thrown away, but the bookmark still moves). The next two calls give 9 and 27, so the answer is
**36**. The usual slip is to think the discarded \`next\` calls "don't count"; they do — every \`next\`
advances the iterator whether or not you keep the value.`,
    },
    {
      id: 'py-l6-q7',
      kind: 'mcq',
      prompt: md`Which line produces \`['odd', 'even', 'odd']\`?`,
      options: [
        md`\`[n for n in [1, 2, 3] if n % 2 == 0 else "odd"]\``,
        md`\`["even" for n in [1, 2, 3] if n % 2 == 0]\``,
        md`\`["even" if n % 2 == 0 else "odd" for n in [1, 2, 3]]\``,
        md`\`("even" if n % 2 == 0 else "odd" for n in [1, 2, 3])\``,
      ],
      answer: 2,
      explain: md`To give *every* item one of two values, the \`if ... else\` goes at the **front** — it
transforms. Option A tries to put an \`else\` on the filter at the end, which is a \`SyntaxError\`: a
filter only decides "in or out", so there's nothing for \`else\` to mean. Option B is valid but
*filters* — it keeps only the even number, giving \`['even']\`. Option D is the tempting one: the
expression is identical to C, but round brackets make a lazy **generator**, so printing it shows
\`<generator object ...>\`, not a list.`,
    },
    {
      id: 'py-l6-q8',
      kind: 'numeric',
      prompt: md`**Fermi estimate.** You write \`nums = list(range(100_000_000))\`. Each list slot is an
8-byte pointer, and each integer object takes about 28 bytes. Estimate the total memory used, **in
gigabytes, rounded to the nearest whole number**. (For comparison, the generator
\`(i for i in range(100_000_000))\` takes about 200 bytes.)`,
      answer: 4,
      tolerance: 1,
      explain: md`Slots: 100 million × 8 bytes = 800 million bytes = 0.8 GB. Integer objects: 100 million ×
28 bytes = 2.8 GB. Total ≈ **3.6 GB**, which rounds to **4**. The common mistake is to trust
\`sys.getsizeof(nums)\`, which reports only the 0.8 GB of slots — it doesn't count the objects the slots
point to. The generator, meanwhile, holds one current number and a paused function: about 200 bytes,
roughly twenty million times smaller. On a 16 GB laptop the list fits (barely, slowly); at a billion
items it doesn't, and the generator doesn't care.`,
    },
    {
      id: 'py-l6-q9',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Implement your own version of \`range\` for positive steps,
\`my_range(start, stop, step)\`, **twice** on paper: (1) as an iterator class with \`__iter__\` and
\`__next__\`; (2) as a generator function. Then (3) write out, as a \`while True\` loop with
\`try\`/\`except\`, exactly what Python does when it runs

~~~python
for x in my_range(0, 10, 3):
    print(x)
~~~

and state what it prints. Finally, (4) say in one sentence which parts of your class version the
generator version made unnecessary.`,
      rubric: md`**(1) Iterator class:**

~~~python
class MyRange:
    def __init__(self, start, stop, step=1):
        self.current = start
        self.stop = stop
        self.step = step

    def __iter__(self):
        return self

    def __next__(self):
        if self.current >= self.stop:
            raise StopIteration
        value = self.current
        self.current += self.step
        return value
~~~

**(2) Generator:**

~~~python
def my_range(start, stop, step=1):
    current = start
    while current < stop:
        yield current
        current += step
~~~

**(3) What \`for\` does:**

~~~python
it = iter(my_range(0, 10, 3))
while True:
    try:
        x = next(it)
    except StopIteration:
        break
    print(x)
~~~

Prints 0, 3, 6, 9 (each on its own line) — 12 is not less than 10, so the generator ends.

**(4)** The generator removes the need for \`self\` to store the position (a local variable
survives between \`yield\`s), for writing \`__iter__\`/\`__next__\` by hand, and for raising
\`StopIteration\` manually (the function ending does it).

Full credit: \`__iter__\` returns \`self\`; \`__next__\` saves the value *before* advancing (advancing
first is the classic off-by-one that skips \`start\`); the stop test is \`>=\` / \`<\` (not \`>\`, which
would wrongly include \`stop\`); the while-loop has \`iter()\` *outside* the loop and \`break\` in the
\`except\`; the output is exactly 0, 3, 6, 9.`,
    },
    {
      id: 'py-l6-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid who knows a little Python asks: "Why does
\`lines = open(f).readlines()\` crash on a giant file, but \`for line in open(f):\` works fine? Isn't it
the same loop?" Explain it using an analogy you invent (a conveyor belt, reading a book, a queue at a
shop — or something better). Include what "one at a time" means, why the first version runs out of
room, and one catch of the one-at-a-time approach.`,
      rubric: md`Grade the teaching:

1. **A concrete analogy that matches the mechanism** — e.g. "\`readlines\` is photocopying the entire
   phone book and trying to hold every page in your arms at once before you start counting. The \`for\`
   loop is flipping through the phone book one page at a time: look at a page, make a tally mark, turn
   the page." The kid should be able to see that the book never has to fit in your arms.
2. **Why the first one runs out of room** — the computer's memory is like the size of your arms (or
   your desk); a 40 GB file is bigger than the desk, so trying to lay every page out at once fails,
   even though the counting part is identical.
3. **What "one at a time" means** — the loop keeps asking "next, please"; the file hands over one line,
   the computer looks at it, forgets it, asks again. Only one line is ever on the desk.
4. **One honest catch** — you can only go forwards: once you've flipped past a page you can't jump
   back to it without starting over (the "used up" / exhaustion idea), or you can't ask "how many pages
   are there?" without going through them all.
5. **Jargon audit:** "iterator", "generator", "lazy", "RAM", "StopIteration", "protocol" used without a
   kid-level translation first = partial credit at best. Saying "it streams the data" without saying
   what that *means* doesn't count as an explanation.`,
    },
    {
      id: 'py-l6-q11',
      kind: 'written',
      prompt: md`**Find the bugs.** This code is supposed to count, in a 40 GB log, how many ERROR lines
each service produced (the service is the 4th word of a line) and print the total. It has **four**
separate bugs. For each one say what actually goes wrong when it runs, then write a corrected version.

~~~python
from itertools import groupby

def error_services(path):
    lines = open(path).readlines()
    for line in lines:
        if " ERROR " in line:
            return line.split()[3]

services = error_services("server.log")
total = len(list(services))
for service, group in groupby(services):
    print(service, len(list(group)))
print("total", total)
~~~`,
      rubric: md`**Bug 1 — \`readlines()\` loads the whole file.** On 40 GB it runs out of memory before
anything else happens. *Fix:* loop over the file object directly (inside a \`with\` so it closes).

**Bug 2 — \`return\` instead of \`yield\`.** The function stops at the *first* error line and returns
one string, e.g. \`'db'\`. Then \`len(list('db'))\` is **2** — it counts the *characters* of the name —
and \`groupby\` groups the letters \`'d'\`, \`'b'\`. A silent, confusing wrong answer. *Fix:* \`yield\`.

**Bug 3 — the generator is consumed twice.** Once it's a generator, \`list(services)\` exhausts it
(and builds a big list), so the \`groupby\` loop receives nothing and prints nothing. *Fix:* one pass
that does both jobs.

**Bug 4 — \`groupby\` on unsorted data.** Error lines from different services are interleaved, so
\`groupby\` would print \`db\` many times with small counts. Sorting would fix it but needs every item in
memory. *Fix:* count with a dict in one pass.

**Corrected:**

~~~python
def error_services(path):
    with open(path) as f:
        for line in f:
            if " ERROR " in line:
                yield line.split()[3]

counts = {}
for service in error_services("server.log"):
    counts[service] = counts.get(service, 0) + 1

for service, n in counts.items():
    print(service, n)
print("total", sum(counts.values()))
~~~

Full credit = all four bugs, each with the *actual* symptom (bug 2's "counts characters" is the one
most people miss), and a fix that stays lazy — memory proportional to the number of *services*, not
lines. Fixing bug 3 by writing \`list(error_services(...))\` and reusing the list is partial credit:
correct, but it gives up the memory win the lesson is about.`,
    },
    {
      id: 'py-l6-q12',
      kind: 'written',
      prompt: md`**Build a pipeline.** Each line of a huge request log looks like
\`2026-09-01 12:00:02 ERROR db 350ms\` (date, time, level, service, latency). On paper, write:
(1) a generator \`parse(lines)\` that yields \`(level, service, ms)\` tuples with \`ms\` as an int;
(2) code that uses it to compute the **average latency of ERROR requests per service**, as a dict built
with a dict comprehension at the end; (3) one sentence on how much memory your solution needs and
why; (4) one comprehension in your code that would be a mistake to turn into a list, and why.`,
      rubric: md`A strong answer, give or take naming:

~~~python
def parse(lines):
    for line in lines:
        date, time, level, service, latency = line.split()
        yield level, service, int(latency.rstrip("ms"))

totals = {}      # service -> total ms
counts = {}      # service -> number of error requests

with open("requests.log") as f:
    for level, service, ms in parse(f):
        if level == "ERROR":
            totals[service] = totals.get(service, 0) + ms
            counts[service] = counts.get(service, 0) + 1

averages = {s: totals[s] / counts[s] for s in totals}
print(averages)
~~~

(An error-filter stage such as \`errors = (t for t in parse(f) if t[0] == "ERROR")\` is equally good.)

**Must have:**
- \`parse\` uses \`yield\` and converts latency to an int (\`"350ms"\` → \`350\`, via \`rstrip("ms")\`,
  slicing \`[:-2]\`, or \`replace\`).
- The loop runs **inside** the \`with\` block (the lazy generator needs the file open).
- A single pass keeping running totals and counts — *not* a list of every latency per service.
- The final dict comprehension divides total by count.

**(3) Memory:** proportional to the number of *services* (two small dicts), plus one line at a time —
independent of the file's size.

**(4)** Turning the parse stage or an error-filter stage into a list comprehension would load every
line (or every error) into memory at once — the 63 GB problem again.

Partial credit: collecting all latencies into lists and averaging at the end (correct but memory grows
with the file), or closing the file before consuming the generator.`,
    },
  ],
}
