// Python Foundations, Lesson 8 — From script to project: modules, testing & async
//
// Content uses the `md` tag from ../md.js: it behaves like String.raw, and an escaped
// backtick \` becomes a real backtick. Code blocks use ~~~python fences (no escaping).
// NEVER write the sequence dollar-brace inside content (JS interpolation).

import { md } from '../md.js'

export default {
  id: 'py-l8',
  title: 'Py.8 From script to project — modules, testing & async',
  subtitle:
    'Your 600-line script works, until a harmless-looking change silently breaks something three days away, and a job that calls an API 100 times spends 99% of its life waiting. This lesson turns a script into a project you can change safely (modules, packages, virtual environments, pytest) and teaches your code to stop waiting in line (async, gather, semaphores).',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You've written \`invoicer.py\`. It's 600 lines, it reads orders, computes tax, builds invoices, and
emails them. It works. Somewhere in the middle are these two functions:

~~~python
def tax(amount, rate=0.08):
    return round(amount * rate, 2)

def invoice_total(lines, rate=0.08):
    subtotal = sum(price * qty for price, qty in lines)
    return round(subtotal + tax(subtotal, rate), 2)

print(invoice_total([(3.50, 2), (4.25, 1), (2.00, 3)]))   # 18.63
~~~

On Monday your manager says "people keep typing 8 instead of 0.08 — make the tax rate a
percentage." Easy:

~~~python
def tax(amount, rate=8):
    return round(amount * rate / 100, 2)

print(tax(100))   # 8.0   -- looks right, ship it
~~~

You try \`tax(100)\`, get \`8.0\`, and move on. On Thursday a customer emails: their invoice for
18.63 now says **17.26**. \`invoice_total\`, 300 lines away, still passes \`rate=0.08\` — which the
new \`tax\` reads as 0.08 *percent*. You checked the function you changed. You didn't check the
function that *used* it, because you didn't remember it existed.

Now the second problem. The same script enriches each order by calling a web API, one order at a
time. Each call takes about one second. 100 orders → 100 seconds. You open Activity Monitor during
the run: the CPU is at roughly **1%**. Your laptop is doing almost nothing for 100 seconds.

Two problems, and they are the two problems every script hits as it grows up:

1. **You can't safely change code.** Nothing tells you when a change breaks something far away.
2. **You're waiting when you could be working.** Each call sits idle for the network, one after
   another, when the waits could overlap.

This lesson fixes both, in three parts. **Part 1** turns the one big file into a *project* — files
that import each other, an isolated environment, a config file that says what you depend on.
**Part 2** adds *tests*: small functions that re-check every behaviour you care about in under a
second, every time you change anything. **Part 3** teaches your code to overlap its waiting with
\`async\`.

# Part 1 — From one file to a project

## A module is just a file

Every \`.py\` file is a **module** — a file whose functions and variables other files can borrow.
You already use modules: \`import math\` loads a file called \`math\` that someone else wrote. Your own
files work exactly the same way. Put the tax code in its own file:

~~~python
# tax.py
DEFAULT_RATE = 0.08

def tax(amount, rate=DEFAULT_RATE):
    return round(amount * rate, 2)
~~~

~~~python
# app.py  (same folder)
import tax                      # loads tax.py, gives you a name "tax" for it
from tax import DEFAULT_RATE    # or pull out one name directly

print(tax.tax(50))              # 4.0
print(DEFAULT_RATE)             # 0.08
~~~

Run it with \`python3 app.py\`. The two import styles differ only in what name you get:
\`import tax\` gives you the module (so you write \`tax.tax(...)\`); \`from tax import tax\` gives you
the function itself.

## How does Python find \`tax.py\`?

When you write \`import tax\`, Python searches a list of folders, in order, for \`tax.py\` (or a
folder called \`tax\`). That list is \`sys.path\`, and you can print it:

~~~python
import sys
print(sys.path[0])     # the folder containing the script you ran
~~~

The first entry is the folder of the script you ran; after that come the standard library and the
folder where installed libraries live. Python takes the **first match** and stops. That explains two
classic surprises:

- \`import tax\` fails with \`ModuleNotFoundError\` when you run your script from a *different* folder
  structure than you expected — the folder isn't on the list.
- Naming your own file \`random.py\` or \`math.py\` breaks \`import random\` everywhere in that folder,
  because *your* file is found first.

One more fact, which the next ponder builds on: **importing a module runs the file.** Top to bottom,
once. \`def\` lines create functions; any other statements — including \`print\` — execute. Python
then caches the module, so a second \`import tax\` anywhere in the program just reuses the cached
copy without running anything again.
`,
    },
    {
      type: 'ponder',
      question: md`While developing, you put a quick self-check at the bottom of \`tax.py\`:

~~~python
# tax.py
print("loading tax.py")

def tax(amount, rate=0.08):
    return round(amount * rate, 2)

print("self-check:", tax(100))
~~~

Then a different file does this:

~~~python
# app.py
import tax
import tax
print("app sees", tax.tax(50))
~~~

Predict exactly what \`python3 app.py\` prints. Then: how could \`tax.py\` run its self-check when you
run it directly, but stay silent when it's imported?`,
      answer: md`It prints:

~~~text
loading tax.py
self-check: 8.0
app sees 4.0
~~~

The first \`import tax\` **runs the whole file**, so both top-level prints fire — you just leaked a
self-check into somebody else's program. The second \`import tax\` prints nothing: the module is
already cached, so Python hands back the same object without re-running it.

The fix uses a variable Python sets in every module, \`__name__\`. When a file is **run directly**,
its \`__name__\` is the string \`"__main__"\`. When it's **imported**, \`__name__\` is the module's
name, \`"tax"\`. Verify it yourself:

~~~python
# tax.py
print("__name__ is", __name__)
~~~

\`python3 tax.py\` prints \`__name__ is __main__\`; \`import tax\` prints \`__name__ is tax\`. So you
guard the "only when run directly" code:

~~~python
# tax.py
def tax(amount, rate=0.08):
    return round(amount * rate, 2)

if __name__ == "__main__":
    print("self-check:", tax(100))    # runs for "python3 tax.py", silent on import
~~~

That's the whole reason the famous line exists. It isn't ceremony — it follows directly from
"importing runs the file." Every file that is both a library *and* something you sometimes run
should put its "run me" code behind that guard, usually as a call to a \`main()\` function.`,
    },
    {
      type: 'text',
      md: md`
## Packages: a folder of modules

Once you have five or six modules, group them. A **package** is a folder of modules, marked by a
(usually empty) file called \`__init__.py\`. Imports then use dots: \`from invoicer.tax import tax\`
means "the \`tax\` module inside the \`invoicer\` package."

Here is the layout most modern Python projects use, called the **src layout**:

~~~text
invoicer/                  <- the project folder (what you open in your editor)
├── pyproject.toml         <- name, version, dependencies (see below)
├── src/
│   └── invoicer/          <- the package itself
│       ├── __init__.py
│       ├── tax.py
│       ├── invoice.py
│       └── cli.py         <- the "run me" entry point
└── tests/
    ├── test_tax.py
    └── test_invoice.py
~~~

Why tuck the package inside \`src/\`? It forces your tests to import the package *the way a user
would* — as an installed package — rather than accidentally picking up whatever files happen to sit
in the current folder. It's a small guard against "works on my machine."

Inside the package, modules import each other by their full dotted name:

~~~python
# src/invoicer/invoice.py
from invoicer.tax import tax, DEFAULT_RATE

def subtotal(lines):
    return sum(price * qty for price, qty in lines)

def invoice_total(lines, rate=DEFAULT_RATE):
    sub = subtotal(lines)
    return round(sub + tax(sub, rate), 2)
~~~

~~~python
# src/invoicer/cli.py
from invoicer.invoice import invoice_total

def main():
    order = [(3.50, 2), (4.25, 1), (2.00, 3)]
    print(f"Total due: {invoice_total(order)}")

if __name__ == "__main__":
    main()
~~~

Notice the split of responsibilities that the 600-line script never had: \`tax.py\` knows tax,
\`invoice.py\` knows invoices, \`cli.py\` knows how to run things. When the tax rule changes, you know
which file to open — and, in Part 2, which tests guard it.

## Virtual environments: one project, one set of libraries

Here's a problem you'll hit within your first month of real projects. Project A was written against
version 1 of some library; project B needs version 2, which changed a function A depends on.
Libraries normally install into one shared place for your whole computer — so installing version 2
for B silently breaks A.

A **virtual environment** (a "venv") is a private folder of installed libraries for *one* project.
Activate it, and \`python\` and \`pip\` use that folder instead of the shared one:

~~~bash
cd invoicer
python3 -m venv .venv          # create the private folder .venv/
source .venv/bin/activate      # use it in this terminal (Windows: .venv\Scripts\activate)
pip install -e ".[dev]"        # install this project + its dev tools into .venv
pytest                         # run the tests with THIS project's libraries
deactivate                     # back to normal
~~~

Two projects, two \`.venv\` folders, two different library versions, zero conflict. The rule of thumb:
**every project gets its own venv**, and you never install project libraries into the computer-wide
Python.

## pyproject.toml: what your project is and what it needs

\`pip\` is the tool that downloads and installs libraries. \`pyproject.toml\` is the file that tells it
what your project needs, so anyone (including future you) can recreate the environment with one
command:

~~~toml
[project]
name = "invoicer"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "httpx>=0.27",        # libraries the code needs to run
]

[project.optional-dependencies]
dev = ["pytest>=8"]       # only needed while developing

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
~~~

\`pip install -e ".[dev]"\` reads this file, installs the dependencies plus the \`dev\` extras, and
installs your own package in **editable** mode (\`-e\`): Python imports straight from your \`src/\`
folder, so edits take effect immediately without reinstalling.

**A faster modern tool:** as of this writing (2026), many projects use **uv**, a much faster
replacement for \`pip\` + \`venv\` that reads the same \`pyproject.toml\`. The shape is the same:

~~~bash
uv venv                        # create .venv
uv pip install -e ".[dev]"     # install, typically many times faster than pip
uv run pytest                  # run a command inside the project's environment
~~~

Tools come and go; the ideas — one isolated environment per project, dependencies written down in
one file — are what to keep.

# Part 2 — Testing with pytest

## A test is just a function that asserts

Back to the tax disaster. What you needed on Monday was something that re-checked \`invoice_total\`
automatically the moment you changed \`tax\`. That's a **test**: a small function that runs your code
on a known input and checks the output.

You met \`assert\` in Py.7: \`assert condition\` does nothing if the condition is true and raises
\`AssertionError\` if it's false. **pytest** (a library: \`pip install pytest\`) turns that into a
testing tool with two rules:

- put tests in files named \`test_something.py\`;
- write functions whose names start with \`test_\`.

~~~python
# test_billing.py
from billing import tax, invoice_total

def test_tax_on_simple_amount():
    assert tax(100) == 8.0

def test_invoice_total_includes_tax():
    assert invoice_total([(3.50, 2), (4.25, 1), (2.00, 3)]) == 18.63
~~~

Run \`pytest\` in the folder. It finds every \`test_*.py\` file, calls every \`test_*\` function, and
reports:

~~~text
..                                                                       [100%]
2 passed in 0.01s
~~~

Each dot is a passing test. That's it — no classes to inherit, no special syntax. A function that
doesn't raise *passes*; a function that raises *fails*.

## Reading a failure

Now make Monday's change — \`tax\` takes a percentage — and run \`pytest\` again. This is real output
(trimmed slightly):

~~~text
.F                                                                       [100%]
=================================== FAILURES ===================================
_______________________ test_invoice_total_includes_tax ________________________

    def test_invoice_total_includes_tax():
>       assert invoice_total([(3.50, 2), (4.25, 1), (2.00, 3)]) == 18.63
E       assert 17.26 == 18.63
E        +  where 17.26 = invoice_total([(3.5, 2), (4.25, 1), (2.0, 3)])

test_billing.py:7: AssertionError
=========================== short test summary info ============================
FAILED test_billing.py::test_invoice_total_includes_tax - assert 17.26 == 18.63
1 failed, 1 passed in 0.01s
~~~

Read it top to bottom: \`.F\` means test 1 passed, test 2 failed. The \`>\` marks the failing line.
The \`E\` lines show **the actual values**: the left side was 17.26, you expected 18.63, and pytest
even shows which call produced 17.26. You didn't write a single print statement.

And look at *which* test caught it. \`test_tax_on_simple_amount\` still **passes** — the new \`tax(100)\`
really does return 8.0. The bug was never in \`tax\`; it was in the *agreement* between \`tax\` and its
caller. That's exactly the bug you can't catch by checking the function you just edited, and exactly
the one a test suite catches in 0.01 seconds instead of three days.
`,
    },
    {
      type: 'example',
      title: 'a real test file: edge cases, errors, fixtures, parametrize',
      md: md`
Here's the tax module grown up a little — it now rejects negative amounts — and a test file that
uses every pytest tool this lesson covers. Every line below was run; the output is real.

~~~python
# billing.py
def tax(amount, rate=0.08):
    if amount < 0:
        raise ValueError("amount cannot be negative")
    return round(amount * rate, 2)


def invoice_total(lines, rate=0.08):
    subtotal = sum(price * qty for price, qty in lines)
    return round(subtotal + tax(subtotal, rate), 2)
~~~

~~~python
# test_billing.py
import pytest
from billing import tax, invoice_total


# 1. The normal case
def test_tax_on_simple_amount():
    assert tax(100) == 8.0


# 2. Edge cases: zero and empty
def test_tax_on_zero_is_zero():
    assert tax(0) == 0


def test_empty_invoice_totals_zero():
    assert invoice_total([]) == 0


# 3. The error you promised to raise (Py.7's exceptions)
def test_negative_amount_is_rejected():
    with pytest.raises(ValueError, match="negative"):
        tax(-5)


# 4. A fixture: shared setup, built fresh for each test that asks for it
@pytest.fixture
def cafe_order():
    return [(3.50, 2), (4.25, 1), (2.00, 3)]     # subtotal 17.25


def test_invoice_total_includes_tax(cafe_order):
    assert invoice_total(cafe_order) == 18.63


def test_invoice_total_uses_custom_rate(cafe_order):
    assert invoice_total(cafe_order, rate=0.10) == 18.98


# 5. Parametrize: one test body, many inputs (including a huge one)
@pytest.mark.parametrize("amount, expected", [
    (100, 8.0),
    (0, 0.0),
    (12.5, 1.0),
    (1_000_000, 80_000.0),
])
def test_tax_table(amount, expected):
    assert tax(amount) == expected
~~~

\`pytest -v\` (the \`-v\` means "verbose": one line per test):

~~~text
test_billing.py::test_tax_on_simple_amount PASSED
test_billing.py::test_tax_on_zero_is_zero PASSED
test_billing.py::test_empty_invoice_totals_zero PASSED
test_billing.py::test_negative_amount_is_rejected PASSED
test_billing.py::test_invoice_total_includes_tax PASSED
test_billing.py::test_invoice_total_uses_custom_rate PASSED
test_billing.py::test_tax_table[100-8.0] PASSED
test_billing.py::test_tax_table[0-0.0] PASSED
test_billing.py::test_tax_table[12.5-1.0] PASSED
test_billing.py::test_tax_table[1000000-80000.0] PASSED
============================== 10 passed in 0.01s ==============================
~~~

Count them: 6 ordinary tests + 4 parametrized cases = **10**. Each tool, one at a time:

**\`pytest.raises\`** is a context manager (Py.7's \`with\`). The test *passes* if the block raises
\`ValueError\` whose message matches \`"negative"\`, and *fails* with \`DID NOT RAISE\` if the code
quietly returns. Testing that bad input is refused is just as important as testing that good input
works — the refusal is a promise too.

**Fixtures.** \`@pytest.fixture\` marks \`cafe_order\` as setup. Any test that has a parameter
*named* \`cafe_order\` gets the fixture's return value passed in — pytest matches by name. Each test
gets a **fresh** copy, so one test mutating the list can't break another (remember the shared-list
trap from Py.1). Fixtures replace copy-pasting the same setup into ten tests.

**Parametrize** is a decorator (Py.5): it takes your one test function and makes pytest run it once
per row, filling in \`amount\` and \`expected\`. Each row is reported as its own test, with the values
in square brackets — so when row 3 fails, you know it's row 3.
`,
    },
    {
      type: 'text',
      md: md`
## What makes a good test

Look back at the names in that file: \`test_negative_amount_is_rejected\`,
\`test_empty_invoice_totals_zero\`. Three habits make tests worth having:

1. **One behaviour per test.** When \`test_negative_amount_is_rejected\` fails, you know what broke
   from the name alone. A test called \`test_everything\` with 20 asserts stops at the first failure and
   hides the other 19.
2. **A name that's a sentence.** Read the failure list in six months: \`FAILED
   test_empty_invoice_totals_zero\` is a bug report that wrote itself.
3. **Arrange / act / assert.** Set up the inputs, do the one thing, check the result. Keeping those
   three steps visible makes a test easy to read:

~~~python
def test_discount_never_makes_total_negative():
    lines = [(5.00, 1)]                          # arrange
    total = invoice_total(lines, rate=0.08)      # act
    assert total >= 0                            # assert
~~~

## Where the bugs live: edge cases

Most bugs don't hide in the typical case — you tried that by hand. They hide at the edges. For any
function, run down this list:

| edge | example for \`tax\` / \`invoice_total\` |
|---|---|
| **empty** | \`invoice_total([])\` — does \`sum\` of nothing give 0, or crash? |
| **zero** | \`tax(0)\`, a line with quantity 0 |
| **negative** | \`tax(-5)\` — refund or error? *Decide*, then test the decision |
| **huge** | \`tax(1_000_000)\` — any overflow, any rounding surprise? |
| **boundary** | exactly at a threshold, e.g. free shipping at exactly 50.00 |

One edge bites everyone once: floats. \`0.1 + 0.2 == 0.3\` is \`False\` in Python, because 0.1 can't be
stored exactly in binary. For computed floats, compare approximately:

~~~python
import pytest

def test_float_sum():
    assert 0.1 + 0.2 == pytest.approx(0.3)      # passes
~~~

## What NOT to test

Tests are code, and code costs time to maintain. Skip:

- **Python and libraries themselves.** \`assert len([1, 2]) == 2\` tests Python, not you.
- **Private details that might change.** Test *what* \`invoice_total\` returns, not *how* it computes
  it. If you rename an internal helper and twenty tests break while behaviour is unchanged, those
  tests were testing the wrong thing.
- **Real networks, real emails, real money.** A test that calls a live API is slow and fails when the
  Wi-Fi does. Test your logic with fake data; keep the live call thin.

## The feedback loop

Here's the payoff. With the test file above, Monday goes differently. You change \`tax\` to take a
percentage, type \`pytest\`, and within a second:

~~~text
....FF....
FAILED test_billing.py::test_invoice_total_includes_tax - assert 17.26 == 18.63
FAILED test_billing.py::test_invoice_total_uses_custom_rate - assert 17.27 ==...
2 failed, 8 passed in 0.01s
~~~

The four \`test_tax_table\` rows still pass — \`tax\` itself is "correct." Both invoice tests fail —
the caller is now wrong. You fix \`invoice_total\` (pass \`rate * 100\`, or update its default), rerun,
see \`10 passed\`, and ship. The customer never sees 17.26.

That is what tests buy: not proof your code is perfect, but **the freedom to change it**. Without
tests, every edit is a gamble you find out about days later; with them, you find out in a second.
Researchers lean on this constantly — change a data-loading function, and a test on a tiny batch tells
you immediately whether the shapes still line up.

# Part 3 — Async: stop waiting in line

## The waiting problem

Now the second puzzle: 100 API calls, one second each, 100 seconds total, CPU at 1%. Where does the
time go? Into **waiting**. Sending the request takes microseconds; then your program sits idle while
the request crosses the internet, a server somewhere does its work, and the answer travels back. Work
that is mostly waiting on something outside your program — the network, a disk, a database — is
called **I/O-bound** (I/O = input/output).

Sequential code waits for call 1 to finish before *starting* call 2. But nothing about call 2 depends
on call 1. It's like a waiter who takes one table's order, walks to the kitchen, stands there until
the food is cooked, delivers it, and only *then* goes to the second table.

## async def, await, asyncio.run

Python's \`asyncio\` (built in, no install) lets one program juggle many waits. Three new words:

- \`async def\` defines a **coroutine function** — a function that is allowed to pause.
- \`await something\` means "pause me here until *something* finishes — and while I'm paused, let
  other coroutines run."
- \`asyncio.run(main())\` starts the **event loop**: the scheduler that keeps a list of paused
  coroutines and resumes each one when the thing it's waiting for is ready.

We'll use \`asyncio.sleep(1)\` to stand in for a one-second API call — like a real request, it's pure
waiting, with the CPU free:

~~~python
import asyncio

async def greet(name):
    await asyncio.sleep(0.1)       # pretend network wait
    return f"hello {name}"

print(greet("Ada"))                # <coroutine object greet at 0x...>  (+ a warning)
print(asyncio.run(greet("Ada")))   # hello Ada
~~~

Look at the first line of output. Calling an \`async def\` function **does not run it** — it builds
a coroutine object, a paused piece of work waiting to be scheduled. Python even warns you:
\`RuntimeWarning: coroutine 'greet' was never awaited\`. Only \`await\` (inside another coroutine) or
\`asyncio.run\` (at the top level) actually runs it.
`,
    },
    {
      type: 'ponder',
      question: md`\`fetch\` pretends to be a one-second API call. Predict both printed times before
revealing:

~~~python
import asyncio
import time

async def fetch(i):
    await asyncio.sleep(1)      # stands in for a 1-second API call
    return i * 10

async def main():
    start = time.perf_counter()
    results = []
    for i in range(10):
        results.append(await fetch(i))
    print(f"sequential: {time.perf_counter() - start:.1f} s")

    start = time.perf_counter()
    results = await asyncio.gather(*(fetch(i) for i in range(10)))
    print(f"gather:     {time.perf_counter() - start:.1f} s")
    print(results)

asyncio.run(main())
~~~`,
      answer: md`Real output:

~~~text
sequential: 10.0 s
gather:     1.0 s
[0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
~~~

**The first loop is async code that isn't concurrent.** \`await fetch(i)\` inside a \`for\` loop means
"start call i, and don't move on until it's done." Each call waits its full second before the next one
even *starts*: 10 × 1 s = **10 s**. Writing \`async\` doesn't make anything faster by itself — this is
the most common async mistake.

**\`asyncio.gather\` starts all ten first, then waits for all of them.** \`gather(a, b, c, ...)\`
takes coroutines as separate arguments (hence the \`*\` to unpack the generator — Py.6), schedules
every one, and returns their results as a list **in the order you passed them**, not the order they
finished. All ten one-second waits happen *at the same time*, so the total is the longest single
wait: **≈ 1 s**.

The rule for predicting runtimes: **sequential awaits add up; gathered awaits overlap, so you pay for
the slowest one.** With 100 calls instead of 10: about 100 s versus about 1 s. That's the whole
second puzzle solved — the laptop was idle because it was waiting in line, and \`gather\` lets all the
waits share the same second.`,
    },
    {
      type: 'text',
      md: md`
## The crucial caveat: concurrency, not parallelism

\`gather\` feels like magic, so be precise about what it did. There is still **one** thread running
**one** piece of Python at a time. The event loop simply *switches* between coroutines at each
\`await\` — whenever one says "I'm waiting," another gets to run. Overlapping waits is called
**concurrency**. Doing two computations literally at the same instant on two CPU cores is
**parallelism**, and asyncio does not give you that.

Two consequences, both of which trip up real code.

**1. CPU-heavy work doesn't speed up.** If a coroutine is busy computing, it never reaches an \`await\`,
so nothing else can run:

~~~python
import asyncio
import time

async def count_up(n):
    total = 0
    for i in range(n):          # pure computation: no await anywhere
        total += i
    return total

async def main():
    start = time.perf_counter()
    for _ in range(4):
        await count_up(5_000_000)
    seq = time.perf_counter() - start

    start = time.perf_counter()
    await asyncio.gather(*(count_up(5_000_000) for _ in range(4)))
    con = time.perf_counter() - start
    print(f"sequential {seq:.2f} s, gather {con:.2f} s")

asyncio.run(main())
# sequential 0.34 s, gather 0.35 s     (your numbers will differ; they'll be about equal)
~~~

There was no waiting to overlap, so there's nothing to gain. (CPU-heavy work — resizing images,
crunching numbers — needs multiple processes, or libraries like NumPy that do the heavy lifting
outside Python. That's a topic for later.)

**2. A blocking call freezes everything.** \`time.sleep\` and ordinary (non-async) network libraries
don't know about the event loop. They don't say "I'm waiting, run someone else" — they just stop the
whole program. The next ponder shows what that costs.
`,
    },
    {
      type: 'ponder',
      question: md`Someone "converts" their code to async but keeps \`time.sleep\` (or an ordinary,
non-async HTTP call, which behaves the same way). Predict the runtime:

~~~python
import asyncio
import time

async def bad_fetch(i):
    time.sleep(1)               # note: time.sleep, not await asyncio.sleep
    return i

async def main():
    start = time.perf_counter()
    await asyncio.gather(*(bad_fetch(i) for i in range(10)))
    print(f"10 x time.sleep(1) under gather: {time.perf_counter() - start:.1f} s")

asyncio.run(main())
~~~`,
      answer: md`Real output:

~~~text
10 x time.sleep(1) under gather: 10.0 s
~~~

**Ten seconds — no better than a plain loop.** The \`gather\` was pointless.

Here's why, in terms of the event loop. \`gather\` schedules all ten coroutines. The loop starts the
first one, which hits \`time.sleep(1)\`. That call doesn't \`await\` anything; it tells the whole
program "freeze for one second." The event loop is *inside* that program, so it freezes too — it
can't switch to coroutine 2, because it isn't getting a turn. After one second coroutine 1 returns;
the loop starts coroutine 2, which freezes everything for another second; and so on. 10 × 1 s.

The one-line fix is \`await asyncio.sleep(1)\` — which *yields* control while waiting — and the
runtime drops to 1.0 s. For real work the same rule applies: inside \`async def\`, use async
libraries (an async HTTP client such as \`httpx.AsyncClient\`, the async client your LLM SDK provides)
and \`await\` them. **One blocking call inside async code blocks every coroutine**, which is why async
bugs often look like "it works, it's just mysteriously no faster."`,
    },
    {
      type: 'text',
      md: md`
## Too much of a good thing: capping concurrency

\`gather\` over 10,000 coroutines would try to fire 10,000 requests *at once*. Real APIs — LLM APIs
especially, which you'll call heavily in Module 7 — have **rate limits**: send too many requests
at once and you get errors (HTTP 429, "too many requests") or a temporary ban. You want *some*
concurrency, but a capped amount.

A **semaphore** is a counter of permits. \`asyncio.Semaphore(10)\` holds 10 permits; \`async with
limit:\` takes one on entry (pausing if none are left) and gives it back on exit. So at most 10
coroutines can be inside that block at any moment; the rest wait politely at the door.
`,
    },
    {
      type: 'example',
      title: '100 API calls, at most 10 in flight',
      md: md`
We track how many calls are "in flight" (started but not finished) to prove the cap works:

~~~python
import asyncio
import time

limit = asyncio.Semaphore(10)     # at most 10 calls inside the block at once
in_flight = 0
peak = 0

async def call_api(i):
    global in_flight, peak
    async with limit:             # wait here for a permit
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(1)    # stands in for the real 1-second request
        in_flight -= 1
        return i

async def main():
    start = time.perf_counter()
    results = await asyncio.gather(*(call_api(i) for i in range(100)))
    print(f"{len(results)} calls, peak in flight = {peak}, "
          f"took {time.perf_counter() - start:.1f} s")

asyncio.run(main())
# 100 calls, peak in flight = 10, took 10.0 s
~~~

The Fermi estimate you can now do in your head: 100 calls ÷ 10 at a time = 10 "waves," each wave
takes 1 s, so **≈ 10 s**. Compare the three strategies:

| strategy | concurrent calls | time for 100 one-second calls |
|---|---|---|
| sequential \`await\` in a loop | 1 | ≈ 100 s |
| \`gather\` + \`Semaphore(10)\` | ≤ 10 | ≈ 10 s |
| bare \`gather\` | 100 | ≈ 1 s (if the API doesn't reject you) |

The semaphore is the dial between "polite and slow" and "fast and rude." In practice you set it just
under the API's documented limit. The shape of a real LLM batch job is exactly this example, with
\`asyncio.sleep(1)\` replaced by an \`await\` on your SDK's async client:

~~~python
import asyncio

async def label_one(text, limit):
    async with limit:
        # real code: response = await client.create(...)  (your SDK's async call)
        await asyncio.sleep(1)
        return f"label for {text!r}"

async def label_all(texts, max_concurrent=10):
    limit = asyncio.Semaphore(max_concurrent)
    return await asyncio.gather(*(label_one(t, limit) for t in texts))

labels = asyncio.run(label_all(["great film", "awful plot", "fine"]))
print(labels)
# ["label for 'great film'", "label for 'awful plot'", "label for 'fine'"]
~~~

Notice this version creates the semaphore *inside* \`label_all\` and passes it down, instead of using a
module-level global. That makes the cap a parameter you can test and tune — and it's the version to
copy into your own projects.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

**This lesson:**

1. **Modules and packages:** every \`.py\` file is a module; a folder with \`__init__.py\` is a
   package; imports search \`sys.path\` and take the first match. **Importing runs the file** (once,
   then it's cached) — which is exactly why \`if __name__ == "__main__":\` exists.
2. **Project hygiene:** the src layout, one **virtual environment** per project so library versions
   can't collide, dependencies written down in \`pyproject.toml\`, installed with \`pip\` (or, as of
   this writing, the faster \`uv\`).
3. **pytest:** a test is a \`test_\` function that asserts; read failures from the \`E\` lines; one
   behaviour per test with a sentence for a name; hunt edge cases (empty, zero, negative, huge,
   boundary); \`pytest.raises\` for promised errors; fixtures for fresh shared setup; \`parametrize\`
   for one test over many inputs; \`pytest.approx\` for floats; don't test Python or private details.
   Tests are what make change safe.
4. **async:** \`async def\` / \`await\` / \`asyncio.run\`; sequential awaits add up, \`gather\` overlaps
   waits so you pay for the slowest; it's **concurrency for waiting**, not parallelism — CPU work
   doesn't speed up and one blocking call freezes everything; a **semaphore** caps how many calls are
   in flight.

**The whole Python section, Py.1 → Py.8:** you can bundle data with its rules in **classes** (Py.1),
share and override behaviour with **inheritance** or composition (Py.2), make objects feel native
with **dunders and dataclasses** (Py.3), guard attributes with **properties** (Py.4), treat
functions as values and wrap them with **decorators** (Py.5), stream data lazily with **iterators and
generators** (Py.6), fail loudly and clean up reliably with **exceptions, context managers and type
hints** (Py.7) — and now organise it all into a **tested, installable project that doesn't waste time
waiting** (Py.8). That's the Python a research codebase is written in: PyTorch models are classes,
training loops are generators and context managers, evaluation harnesses are pytest suites, and
LLM data pipelines are semaphore-capped async batches.

**Where to go next:** the **Coding** track in the sidebar is adaptive. It now generates Python
challenges tuned to your level — start there, write your answers on paper first, and let it push you
from "I've read this" to "I can write this cold."
`,
    },
  ],
  questions: [
    {
      id: 'py-l8-q1',
      kind: 'mcq',
      prompt: md`\`helpers.py\` ends with \`if __name__ == "__main__": run_demo()\`. You run
\`python3 train.py\`, and \`train.py\` contains \`import helpers\`. What happens to \`run_demo()\`?`,
      options: [
        md`It runs, because importing a module runs every line in it`,
        md`It does not run: inside \`helpers.py\`, \`__name__\` is \`"helpers"\` because it was imported, so the condition is false`,
        md`It runs, because the program as a whole was started directly, so \`__name__\` is \`"__main__"\` everywhere`,
        md`Python raises an error, because a module that is imported may not contain an \`if __name__\` block`,
      ],
      answer: 1,
      explain: md`Each module has its **own** \`__name__\`. Only the file you ran (\`train.py\`) gets
\`"__main__"\`; an imported file gets its module name. Option A is half right — importing *does* run
every line, including the \`if\` line — but the condition evaluates to false, so the body is skipped.
Option C is the tempting misreading: "the program was run directly" is true of \`train.py\`, not of
\`helpers.py\`. Option D is invented; the guard is legal (and recommended) in every module.`,
    },
    {
      id: 'py-l8-q2',
      kind: 'numeric',
      prompt: md`How many seconds does this take to run (to the nearest 0.5 s)?

~~~python
import asyncio

async def step(name, seconds):
    await asyncio.sleep(seconds)
    return name

async def main():
    await step("login", 2)
    await asyncio.gather(step("profile", 1), step("feed", 3))
    await step("log", 0.5)

asyncio.run(main())
~~~`,
      answer: 5.5,
      tolerance: 0.2,
      explain: md`Sequential awaits **add**; gathered awaits **overlap** (you pay for the slowest). Login
2 s, then profile and feed together — max(1, 3) = 3 s — then log 0.5 s: 2 + 3 + 0.5 = **5.5 s**
(measured: 5.5 s). If you got 6.5 you added profile's second in as well; the whole point of
\`gather\` is that its one second hides inside feed's three. If you got 3, you assumed *everything*
in \`main\` runs concurrently — but each bare \`await\` waits for its step to finish before the next line
runs.`,
    },
    {
      id: 'py-l8-q3',
      kind: 'numeric',
      prompt: md`How many tests does \`pytest\` collect and run from this file?

~~~python
import pytest

@pytest.mark.parametrize("lr", [0.1, 0.01, 0.001])
@pytest.mark.parametrize("batch_size", [16, 32, 64, 128])
def test_config_is_valid(lr, batch_size):
    assert lr > 0 and batch_size > 0

def test_defaults():
    assert True

def helper_check():
    assert False
~~~`,
      answer: 13,
      tolerance: 0,
      explain: md`Stacked \`parametrize\` decorators multiply: every \`lr\` is paired with every
\`batch_size\`, so 3 × 4 = **12** cases (like a grid search). Plus \`test_defaults\` = **13**.
\`helper_check\` doesn't start with \`test_\`, so pytest never collects it — which is why its
\`assert False\` never fails anything. If you answered 7, you added 3 + 4 instead of multiplying; if 14,
you counted the helper. (Verified: pytest reports 13 passed.)`,
    },
    {
      id: 'py-l8-q4',
      kind: 'mcq',
      prompt: md`Which of these jobs would you expect \`asyncio.gather\` to speed up dramatically?`,
      options: [
        md`Computing the SHA-256 hash of 50 large files that are already loaded into memory`,
        md`Sending 50 prompts to an LLM API, each taking about 3 seconds to respond`,
        md`Resizing 50 images with a pure-Python loop over their pixels`,
        md`Training a small neural network for 50 epochs`,
      ],
      answer: 1,
      explain: md`Async overlaps **waiting**. The LLM calls spend nearly all their 3 seconds waiting on
the network, so 50 of them can overlap into a few seconds. The other three are **CPU-bound**: the
work is computation, there is no waiting to overlap, and asyncio runs one piece of Python at a time
— so they take as long as a plain loop. Option A is tempting because "50 files" sounds like I/O, but
the files are already in memory: only the hashing is left, and that's pure computation. Option C
tempts for the same reason — images feel like "files" — but the pixel loop is all CPU.`,
    },
    {
      id: 'py-l8-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** pytest feels magical, but its core is small. On paper, write a
function \`run_tests(module)\` that: finds every attribute of \`module\` whose name starts with
\`test_\` and is callable; calls each one; counts it as passed if it returns normally, failed if it
raises \`AssertionError\`, and errored (also counted as a failure) if it raises anything else; prints
one line per test and a final summary like \`2 passed, 2 failed\`. Hint: \`dir(module)\` lists a
module's attribute names and \`getattr(module, name)\` fetches one. Then explain why \`helper_check\`
from the previous question would never run under your runner either.`,
      rubric: md`A model answer (verified against a test module with 2 passing, 1 failing, 1 crashing test —
prints \`2 passed, 2 failed\`):

~~~python
def run_tests(module):
    passed = failed = 0
    for name in dir(module):
        if not name.startswith("test_"):
            continue
        func = getattr(module, name)
        if not callable(func):
            continue
        try:
            func()
        except AssertionError:
            print(f"FAIL {name}")
            failed += 1
        except Exception as e:
            print(f"ERROR {name}: {type(e).__name__}: {e}")
            failed += 1
        else:
            print(f"ok   {name}")
            passed += 1
    print(f"{passed} passed, {failed} failed")
    return failed == 0

import test_billing
run_tests(test_billing)
~~~

**Must have:**
- The name filter (\`startswith("test_")\`) — this *is* pytest's discovery rule; it's why
  \`helper_check\` never runs.
- \`try / except AssertionError / except Exception / else\` from Py.7, with \`AssertionError\` caught
  **first** (it's a subclass of \`Exception\`, so the order matters — reversed, every failure would be
  reported as an error).
- Passing = "didn't raise," which is the key insight: a test is just a function, and \`assert\` is how
  it raises.

**Partial credit:** catching only \`AssertionError\` (a crashing test would crash the whole runner);
using a bare \`except:\` (also swallows Ctrl-C); forgetting the \`callable\` check (a module-level
variable named \`test_data\` would be "called" and error).

What real pytest adds on top: file discovery, fixtures injected by parameter name, parametrize
expansion, and those detailed \`E\` lines — but the loop above is the heart of it.`,
    },
    {
      id: 'py-l8-q6',
      kind: 'mcq',
      prompt: md`Inside an \`async def main()\`, you write \`result = fetch_price("BTC")\`, where
\`fetch_price\` is an \`async def\` function — you forgot \`await\`. What is \`result\`?`,
      options: [
        md`The price, because Python awaits coroutines automatically when you assign them`,
        md`\`None\`, because the function hasn't returned yet`,
        md`A coroutine object — the call built the paused piece of work but never ran it (Python later warns "coroutine ... was never awaited")`,
        md`A \`TypeError\` is raised immediately at that line`,
      ],
      answer: 2,
      explain: md`Calling an \`async def\` function only **creates** a coroutine object; nothing inside it
runs until something awaits it. So \`result\` is \`<coroutine object fetch_price at 0x...>\`, the fetch
never happens, and you usually discover this one line later when \`result * 2\` raises a
\`TypeError\` — plus the \`RuntimeWarning: coroutine 'fetch_price' was never awaited\` that the lesson
showed. Option A is how you *wish* it worked. Option B is tempting if you imagine the call "running in
the background," but there is no background: an un-awaited coroutine simply never starts. Option D
is wrong only in timing — the \`TypeError\` comes later, when you try to *use* the result.`,
    },
    {
      id: 'py-l8-q7',
      kind: 'numeric',
      prompt: md`**Fermi estimate.** You need an LLM to label 300 support tickets. Each API call takes about
2 seconds. Your account allows at most 25 concurrent requests, so you run them with \`asyncio.gather\`
under \`asyncio.Semaphore(25)\`. Roughly how many **seconds** does the whole job take? (For contrast,
also work out the sequential time on paper.)`,
      answer: 24,
      tolerance: 4,
      explain: md`300 calls ÷ 25 at a time = **12 waves**; each wave takes about 2 s; 12 × 2 = **≈ 24 s**.
Sequentially it would be 300 × 2 = 600 s — ten minutes — so the semaphore-capped version is 25×
faster while staying inside the rate limit. The same reasoning gives the lesson's example: 100 calls ×
1 s ÷ 10 concurrent ≈ 10 s (measured: 10.0 s). If you answered 2 s, you forgot the cap: only bare
\`gather\` with no limit would finish in about one call's time — and a real API would likely reject
most of those requests.`,
    },
    {
      id: 'py-l8-q8',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid who knows a little Python asks: "My program downloads 100
pictures and it takes forever. My friend said 'use async.' What is that, and why does it help?"
Explain what's actually slow, what async changes, and one situation where async would *not* help —
using an everyday analogy you invent. No jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching, not the vocabulary:

1. **What's slow is waiting, not working** — e.g. downloading a picture is like ordering a pizza: you
   make one quick phone call, then spend 20 minutes waiting for the doorbell. The computer is doing
   almost nothing during that wait.
2. **What async changes** — the slow way is: order pizza 1, wait at the door until it arrives, *then*
   order pizza 2. The async way: phone all the pizza places one after another (takes a minute), then
   answer the door whenever a doorbell rings. All the waiting happens at the same time, so 100 pictures
   take about as long as the slowest one, not 100 times as long.
3. **When it doesn't help** — if the job is *doing* work, not waiting (like doing 100 long-division
   problems yourself), there's nothing to overlap: you only have one pencil, and switching between
   problems doesn't make you write faster. Bonus: if you fall asleep at the door (a "blocking" call),
   nobody answers any doorbell.
4. **Optional but strong:** why you shouldn't phone 10,000 pizza places at once — they'd hang up on
   you (rate limits), so you keep only 10 orders going at a time.

**Jargon audit:** "I/O-bound," "coroutine," "event loop," "concurrency," "parallelism," "await,"
"non-blocking" used without a kid-level translation first = partial credit at best. An answer that is
technically correct but a 12-year-old couldn't repeat back fails the brief.`,
    },
    {
      id: 'py-l8-q9',
      kind: 'numeric',
      prompt: md`How many tests **pass** when you run \`pytest\` on this file?

~~~python
import pytest

def average(xs):
    return sum(xs) / len(xs)

def test_average_of_three():
    assert average([1, 2, 3]) == 2

def test_average_of_floats():
    assert 0.1 + 0.2 == 0.3

def test_average_of_floats_approx():
    assert 0.1 + 0.2 == pytest.approx(0.3)

def test_empty_list_raises():
    with pytest.raises(ZeroDivisionError):
        average([])

def test_single_value():
    with pytest.raises(ValueError):
        average([5])

def check_negative():
    assert average([-1, -3]) == -2
~~~`,
      answer: 3,
      tolerance: 0,
      explain: md`Five tests are collected (\`check_negative\` doesn't start with \`test_\`, so it never
runs). Of those: \`test_average_of_three\` **passes** (6 / 3 = 2.0, and 2.0 == 2 is True).
\`test_average_of_floats\` **fails** — 0.1 + 0.2 is 0.30000000000000004. The \`approx\` version
**passes**. \`test_empty_list_raises\` **passes**: \`sum([]) / len([])\` is 0 / 0, which raises
\`ZeroDivisionError\` as promised. \`test_single_value\` **fails** with \`DID NOT RAISE ValueError\` —
\`average([5])\` just returns 5.0. Total: **3 passed, 2 failed** (verified with pytest). The trap is
reading \`pytest.raises\` as "this test expects an error, so it's fine" — it *fails* when no error
happens.`,
    },
    {
      id: 'py-l8-q10',
      kind: 'mcq',
      prompt: md`You're testing \`split_bill(total, people)\`. Which single test is the best-written one?`,
      options: [
        md`\`def test_split_bill(): assert split_bill(90, 3) == 30; assert split_bill(0, 2) == 0; assert split_bill(10, 4) == 2.5\` — one test covering many cases`,
        md`\`def test_zero_people_raises_value_error(): with pytest.raises(ValueError): split_bill(50, 0)\``,
        md`\`def test_uses_division(): assert "/" in inspect.getsource(split_bill)\``,
        md`\`def test_it_works(): print(split_bill(90, 3))\``,
      ],
      answer: 1,
      explain: md`B tests **one behaviour** (dividing among zero people must be refused), its **name is a
sentence** you could read in a failure list, and it checks an edge case that's easy to get wrong. A
is tempting because it covers more — but it stops at the first failing assert and hides the rest, and
its name tells you nothing; three separate tests (or \`parametrize\`) is better. C tests an
**implementation detail**: rewrite the function without \`/\` and a correct function "fails." D
**asserts nothing**, so it passes even if \`split_bill\` returns nonsense — a print is something you
read, not something the computer checks.`,
    },
    {
      id: 'py-l8-q11',
      kind: 'written',
      prompt: md`**Find the bugs.** This script is meant to fetch 10 items concurrently (about 1 second
total) and print the sum of the results. It has **four** separate bugs. For each, say what actually
happens when the code runs, then write the corrected script.

~~~python
import asyncio, time

async def fetch(i):
    time.sleep(1)
    return i * 2

async def main():
    tasks = [fetch(i) for i in range(10)]
    results = asyncio.gather(tasks)
    print(sum(results))

main()
~~~`,
      rubric: md`**Bug 1 — \`main()\` is never run.** Calling an \`async def\` function only builds a
coroutine. The script prints nothing at all except \`RuntimeWarning: coroutine 'main' was never
awaited\`. *Fix:* \`asyncio.run(main())\`.

**Bug 2 — \`gather(tasks)\` passes one list, not ten coroutines.** \`gather\` wants each coroutine as
a separate argument. Once bug 1 is fixed, this crashes with \`TypeError: cannot use 'list' as a dict
key (unhashable type: 'list')\` — a confusing message that really means "you gave me a list." *Fix:*
\`asyncio.gather(*tasks)\`.

**Bug 3 — missing \`await\` on \`gather\`.** Without \`await\`, \`results\` is a pending future, not a
list. \`sum(results)\` crashes with \`TypeError: unsupported operand type(s) for +: 'int' and
'_GatheringFuture'\`, and the ten calls are cancelled before they finish. *Fix:*
\`results = await asyncio.gather(*tasks)\`.

**Bug 4 — \`time.sleep\` blocks the event loop.** Even with bugs 1–3 fixed, each \`fetch\` freezes the
whole program for a second, so the "concurrent" run takes **10 s**, not 1 s. *Fix:*
\`await asyncio.sleep(1)\` (or, in real code, an async HTTP client).

**Corrected (verified: prints 90, takes 1.0 s):**

~~~python
import asyncio, time

async def fetch(i):
    await asyncio.sleep(1)
    return i * 2

async def main():
    tasks = [fetch(i) for i in range(10)]
    results = await asyncio.gather(*tasks)
    print(sum(results))

start = time.perf_counter()
asyncio.run(main())
print(f"{time.perf_counter() - start:.1f} s")
~~~

Full credit = all four bugs, each with its *actual* symptom (nothing runs / TypeError / not a list /
10 s instead of 1 s). Bug 4 is the one most people miss, because the fixed-up code *works* — it's just
silently ten times slower than it should be.`,
    },
    {
      id: 'py-l8-q12',
      kind: 'written',
      prompt: md`**Design the tests.** You're handed this function:

~~~python
def split_bill(total, people):
    """Split a bill evenly, rounded to cents. total must be >= 0, people must be >= 1."""
    if people < 1:
        raise ValueError("need at least one person")
    if total < 0:
        raise ValueError("total cannot be negative")
    return round(total / people, 2)
~~~

On paper, write a pytest file that covers: the normal case; the edges (zero total, one person, a huge
total, a result that needs rounding); both promised errors, using \`pytest.raises\`; and at least one
use of \`@pytest.mark.parametrize\`. Give every test a sentence-like name. Then name one thing you
deliberately chose **not** to test, and why.`,
      rubric: md`A strong answer:

~~~python
import pytest
from bills import split_bill


@pytest.mark.parametrize("total, people, expected", [
    (90, 3, 30.0),          # normal case
    (0, 4, 0.0),            # zero total
    (57.5, 1, 57.5),        # one person pays everything
    (10, 3, 3.33),          # needs rounding
    (1_000_000, 7, 142857.14),   # huge
])
def test_split_bill_divides_evenly_and_rounds(total, people, expected):
    assert split_bill(total, people) == expected


def test_zero_people_is_rejected():
    with pytest.raises(ValueError, match="at least one"):
        split_bill(50, 0)


def test_negative_total_is_rejected():
    with pytest.raises(ValueError, match="negative"):
        split_bill(-10, 2)
~~~

That's 5 parametrized cases + 2 error tests = 7 tests collected.

**Must have:** both errors checked with \`pytest.raises\` (ideally with \`match\`, so the *right* error
is confirmed); at least four edge cases from the lesson's list (empty/zero, one, huge, boundary/rounding);
a parametrize with sensible rows; names that read as sentences.

**Good "not tested" answers:** that \`round\` itself works (that's testing Python); the exact wording
of the docstring; which arithmetic operator the function uses internally. Any answer of the form "an
implementation detail that could change without the behaviour changing" earns credit.

**Common partial answers:** one giant test with many asserts (hides failures); testing only the happy
path; a \`pytest.raises\` block that contains a call which *wouldn't* raise (e.g. \`split_bill(50, 1)\`),
which makes the test fail for the wrong reason; comparing a computed float like \`10 / 3\` without
rounding or \`pytest.approx\`.`,
    },
  ],
}
