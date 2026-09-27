// Python Foundations, Lesson 7 — Errors, context managers & type hints
//
// Content uses the `md` tag from ../md.js: it behaves like String.raw, and an escaped
// backtick \` becomes a real backtick. Code blocks use ~~~python fences (no escaping).
// NEVER write the sequence dollar-brace inside content (JS interpolation).

import { md } from '../md.js'

export default {
  id: 'py-l7',
  title: 'Py.7 Errors, context managers & type hints — code that fails well',
  subtitle:
    'Every real program fails sometimes. This lesson starts from a money transfer that silently loses money, and builds the tools that make failure loud, local, and safe: specific exceptions, cleanup that always runs, the with statement, and type hints that catch bugs before the code even starts.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Here's a tiny money-transfer script, written with nothing but dicts and functions — the kind of thing
you could write this week:

~~~python
accounts = {"A": 100, "B": 50}

def deposit(name, amount):
    accounts[name] += amount

def transfer(src, dst, amount):
    accounts[src] -= amount      # step 1: take the money out of src
    deposit(dst, amount)         # step 2: put it into dst

try:
    transfer("A", "b", 30)       # note the typo: lowercase "b"
except:
    pass                         # "just to be safe"

print(accounts)   # {'A': 70, 'B': 50}
~~~

Read the output slowly. A lost 30. B gained nothing. **Thirty units of money have left the universe**,
the program printed no error, nothing was logged, and the script carried on as if all was well.

What actually happened:

1. Step 1 ran: \`accounts["A"]\` went from 100 to 70.
2. Step 2 called \`deposit("b", 30)\`. There is no key \`"b"\`, so \`accounts["b"] += 30\` raised a
   \`KeyError\`.
3. The \`except: pass\` caught it and threw it away.

There are **two bad habits** tangled together here:

- **Habit 1 — swallowing errors.** \`except: pass\` doesn't make code safe; it makes code *quiet*.
  The typo was a bug that wanted to be seen, and we blindfolded it. A crash with a clear message would
  have been far better than this silent corruption.
- **Habit 2 — half-finished work.** Even if we'd *noticed* the error, the transfer was left
  half-done: money out, money not in. We needed "all of it happens, or none of it happens."

Fixing both is not a single trick. It's a way of thinking about failure: **fail loudly, fail
specifically, and always leave things tidy.** By the end of this lesson you'll rewrite this transfer so
that the typo produces a clear error *and* A gets its 30 back automatically.

## What an exception actually is

When Python hits something it can't do — divide by zero, look up a missing key, turn \`"abc"\` into a
number — it creates an **exception**: an object describing what went wrong. Then it does something
unusual: it **abandons the current line and starts travelling back up** through the functions that
called it, looking for someone willing to handle it.

Watch it travel through three functions:

~~~python
def c():
    print("c1")
    raise KeyError("k")      # 'raise' means: create this exception and start it travelling
    print("c2")              # never runs

def b():
    print("b1")
    c()
    print("b2")              # never runs: c() didn't return normally

def a():
    print("a1")
    b()
    print("a2")              # never runs either

try:
    a()
except KeyError:
    print("caught")

# a1
# b1
# c1
# caught
~~~

Trace the journey. \`a\` called \`b\`, which called \`c\` — that's the **call stack**, a pile of
"who is waiting for whom": \`a\` is waiting for \`b\`, \`b\` is waiting for \`c\`. When \`c\` raises,
the exception pops out of \`c\` (skipping \`c2\`), lands in \`b\` at the line \`c()\` — no handler
there, so it pops out of \`b\` (skipping \`b2\`), lands in \`a\`, pops out of \`a\` (skipping \`a2\`),
and finally lands at the \`try\` at the top, whose \`except KeyError\` catches it.

If *nobody* catches it, it pops off the top of the program, Python prints a **traceback** — the list
of every function it travelled through — and the program stops:

~~~python
def read_number(text):
    return int(text)

def parse_age(text):
    return read_number(text)

def load_user(row):
    return {"name": row[0], "age": parse_age(row[1])}

load_user(["Ana", "twelve"])

# Traceback (most recent call last):
#   File "app.py", line 10, in <module>
#     load_user(["Ana", "twelve"])
#   File "app.py", line 8, in load_user
#     return {"name": row[0], "age": parse_age(row[1])}
#   File "app.py", line 5, in parse_age
#     return read_number(text)
#   File "app.py", line 2, in read_number
#     return int(text)
# ValueError: invalid literal for int() with base 10: 'twelve'
~~~

Read tracebacks **from the bottom up**: the last line says *what* went wrong (\`ValueError\` and a
message), and the lines above it say *where*, innermost call last. That traceback is evidence. It is
the single most useful thing a bug can give you — and it's precisely what \`except: pass\` destroys.

## Catching the right thing: try / except with a specific type

The shape is:

~~~python
try:
    risky code
except SomeErrorType:
    what to do if that particular thing goes wrong
~~~

Always name the type you expect. Here's a function that asks "is this text a whole number?":

~~~python
def to_int_or_none(text):
    try:
        return int(text)
    except ValueError:
        return None

print(to_int_or_none("42"))      # 42
print(to_int_or_none("forty"))   # None
~~~

We catch \`ValueError\` because that is *exactly* what \`int()\` raises for bad text, and "not a
number" is a situation we have a real plan for (return \`None\`). Everything else — including our own
typos — still crashes loudly, which is what we want.

You can catch several types, and grab the exception object with \`as\` to read its message:

~~~python
def safe_ratio(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return float("inf")
    except TypeError as err:
        print("bad input:", err)
        return None

print(safe_ratio(6, 3))      # 2.0
print(safe_ratio(6, 0))      # inf
print(safe_ratio(6, "x"))    # bad input: unsupported operand type(s) for /: 'int' and 'str'
                             # None
~~~

Python checks the \`except\` clauses **top to bottom** and runs only the **first** one that matches.
To handle two types the same way, use a tuple: \`except (KeyError, IndexError):\`.

## Why bare \`except:\` is dangerous

A bare \`except:\` (no type) catches **everything**. That sounds safe. It is the opposite:

1. **It catches your bugs.** A typo in a variable name raises \`NameError\`; a wrong key raises
   \`KeyError\`. Bare \`except\` treats your mistakes as "expected situations" and hides them — the
   puzzle's exact failure.
2. **It catches things that aren't errors at all.** When you press Ctrl+C to stop a runaway program,
   Python raises \`KeyboardInterrupt\` inside it. A bare \`except\` inside a loop catches *that* too —
   and your program refuses to stop:

~~~python
import time

while True:
    try:
        time.sleep(1)       # pretend this is real work
    except:
        pass                # Ctrl+C lands here and is thrown away. You can't quit.
~~~

3. **\`except Exception: pass\` is only slightly better.** \`Exception\` is the parent of nearly all
   ordinary errors (it deliberately does *not* include \`KeyboardInterrupt\`), so Ctrl+C works again —
   but every bug is still silently swallowed. The \`pass\` is the real crime: you caught something and
   then destroyed the evidence.

The rules that follow from this:

- Catch the **narrowest** type you have a real plan for.
- Put **as little code as possible** inside the \`try\` — only the line that can fail in the way you
  expect.
- If you truly must catch broadly (say, at the very top of a web server so one bad request doesn't
  kill it), **log the error** — never \`pass\`.

~~~python
import logging

def handle(request):
    try:
        process(request)
    except Exception:
        logging.exception("request failed")   # records the full traceback
        return "500 Internal Server Error"
~~~
`,
    },
    {
      type: 'text',
      md: md`
## else and finally: the full shape

A \`try\` statement can have two more parts:

- **\`else:\`** runs **only if the \`try\` block raised nothing**. It's for "the follow-up that should
  only happen on success" — kept *outside* the \`try\` so its own errors don't get caught by mistake.
- **\`finally:\`** runs **always** — after success, after a caught exception, even after an exception
  nobody caught (it runs, *then* the exception keeps travelling). It's for cleanup.

~~~python
try:
    ...            # attempt
except SomeError:
    ...            # runs only if the attempt raised SomeError
else:
    ...            # runs only if the attempt raised nothing
finally:
    ...            # runs no matter what
~~~

Before you read further, predict an exact sequence of prints.
`,
    },
    {
      type: 'ponder',
      question: md`Predict the **exact** output of each call, line by line, before revealing:

~~~python
def f(x):
    print("start")
    try:
        print("try")
        n = 10 // x
    except ZeroDivisionError:
        print("except")
    else:
        print("else", n)
    finally:
        print("finally")
    print("end")

f(2)
print("--")
f(0)
~~~`,
      answer: md`~~~python
start
try
else 5
finally
end
--
start
try
except
finally
end
~~~

**\`f(2)\`:** \`10 // 2\` is 5, no exception, so \`except\` is skipped, \`else\` runs, then \`finally\`,
then normal code continues with \`end\`.

**\`f(0)\`:** \`10 // 0\` raises \`ZeroDivisionError\` — the rest of the \`try\` block is abandoned
(there was nothing more, but if there had been it would be skipped). \`except\` matches and runs;
\`else\` is skipped *because* there was an exception; \`finally\` runs; and since the exception was
handled, execution carries on to \`end\`.

Notice that \`except\` and \`else\` are mirror images — exactly one of them runs (when the exception
matches) — while \`finally\` doesn't care. Now imagine \`f("a")\`: \`10 // "a"\` raises \`TypeError\`,
which no clause catches. Output: \`start\`, \`try\`, \`finally\` — and then the \`TypeError\` continues
up the stack, so \`end\` never prints. **\`finally\` runs even on the way out of a crash.** That's
the whole reason it exists.`,
    },
    {
      type: 'text',
      md: md`
## finally is for cleanup — and nothing clever

The classic use: something you opened must be closed, whatever happens.

~~~python
f = open("data.txt")
try:
    first = f.readline()
    value = int(first)       # might raise ValueError
finally:
    f.close()                # runs whether or not int() blew up
~~~

Without the \`finally\`, a bad line in the file would raise, skip \`f.close()\`, and leak an open file.
Do that in a loop a few thousand times and your operating system refuses to open any more files.

But \`finally\` has one sharp edge, and it's worth deriving rather than memorising.
`,
    },
    {
      type: 'ponder',
      question: md`What does this print? Think about what "finally *always* runs" implies when the
\`try\` has *already decided* to return.

~~~python
def g():
    try:
        return "from try"
    finally:
        return "from finally"

print(g())
~~~

And a bonus: what does \`h()\` do?

~~~python
def h():
    try:
        raise ValueError("important!")
    finally:
        return "all good"
~~~`,
      answer: md`\`g()\` prints **\`from finally\`**.

Derive it: \`return "from try"\` doesn't leave the function instantly — it sets up "the answer is
\`'from try'\`" and starts leaving. But leaving the \`try\` means \`finally\` must run first. \`finally\`
then executes its *own* \`return\`, which replaces the pending answer. **The last return to execute
wins**, and \`finally\` always executes last.

\`h()\` is worse: it returns \`"all good"\` and the \`ValueError\` **disappears**. The exception was on
its way up the stack, \`finally\` ran, and its \`return\` cancelled the journey. That's the puzzle's
silent-swallowing bug again, in disguise.

The rule: **never \`return\` (or \`break\`/\`continue\`) inside \`finally\`.** Use \`finally\` only for
cleanup that doesn't change the outcome. Python agrees — since version 3.14 it prints
\`SyntaxWarning: 'return' in a 'finally' block\` when it sees one.`,
    },
    {
      type: 'text',
      md: md`
## Raising your own exceptions

Exceptions aren't only for Python to raise. When *your* function is asked to do something that
doesn't make sense, the right move is usually to \`raise\` — loudly, with a message that tells the
caller exactly what was wrong:

~~~python
def withdraw(balance, amount):
    if amount <= 0:
        raise ValueError(f"amount must be positive, got {amount}")
    if amount > balance:
        raise ValueError(f"insufficient funds: balance {balance}, requested {amount}")
    return balance - amount

print(withdraw(100, 30))     # 70
withdraw(100, 500)
# ValueError: insufficient funds: balance 100, requested 500
~~~

Compare that message with a function that just returns \`None\` or \`-1\` on failure. A \`None\`
travels silently into the next calculation and blows up three functions later, somewhere unrelated.
A raised exception stops *here*, names the problem, and shows the numbers. **A good error message
answers: what was wrong, and with what values?**

## Custom exception classes — inheritance pays off

\`ValueError\` is vague: a caller can't easily tell "insufficient funds" apart from "you passed a
negative number". The fix is to **make your own exception types**. An exception type is just a class
that inherits from \`Exception\` — Py.2's inheritance, used for something new:

~~~python
class BankError(Exception):
    """Anything that goes wrong in the bank."""

class InsufficientFunds(BankError):
    pass

class AccountFrozen(BankError):
    pass

def withdraw(balance, amount, frozen=False):
    if frozen:
        raise AccountFrozen("account is frozen")
    if amount > balance:
        raise InsufficientFunds(f"balance {balance}, requested {amount}")
    return balance - amount
~~~

The body can be just \`pass\` (or a docstring): the class *name* carries the meaning, and the message
still goes in the parentheses because \`Exception.__init__\` stores it for you.

Now the Py.2 connection: **\`except\` matches by \`isinstance\`**. Catching a parent class catches
all of its children:

~~~python
try:
    withdraw(10, 50)
except BankError as err:                   # catches InsufficientFunds AND AccountFrozen
    print(type(err).__name__, "-", err)

# InsufficientFunds - balance 10, requested 50
~~~

So a caller chooses how precise to be. Code that only cares "did the bank say no?" catches
\`BankError\`. Code that wants to offer "top up your account?" catches \`InsufficientFunds\`
specifically. One consequence: when you list several \`except\` clauses, put **children before
parents**, because the first match wins — \`except BankError\` placed first would catch everything
before \`except InsufficientFunds\` ever got a look.

## raise ... from err — keeping the original cause

Often you catch a low-level error and want to replace it with one that makes sense at *your* level.
Reading a port number from a config file: the low-level problem is \`int("80a")\` failing, but the
caller should hear "your config is wrong":

~~~python
class ConfigError(Exception):
    pass

def load_port(text):
    try:
        return int(text)
    except ValueError as err:
        raise ConfigError(f"port must be a number, got {text!r}") from err

try:
    load_port("80a")
except ConfigError as e:
    print(e)
    print("caused by:", repr(e.__cause__))

# port must be a number, got '80a'
# caused by: ValueError("invalid literal for int() with base 10: '80a'")
~~~

\`from err\` **chains** the two: the new exception remembers the old one in \`__cause__\`, and if it
goes uncaught the traceback shows *both*, joined by "The above exception was the direct cause of the
following exception". You translate the error into your own vocabulary without throwing away the
evidence underneath it.
`,
    },
    {
      type: 'example',
      title: 'EAFP vs LBYL — and the race where "looking first" is wrong',
      md: md`
There are two styles for dealing with things that might not work.

**LBYL — Look Before You Leap:** check first, then act.
**EAFP — Easier to Ask Forgiveness than Permission:** just act, and handle the exception if it fails.

~~~python
settings = {"theme": "dark"}

# LBYL
if "font" in settings:
    font = settings["font"]
else:
    font = "default"

# EAFP
try:
    font = settings["font"]
except KeyError:
    font = "default"

print(font)   # default
~~~

For a dict, both are fine (and \`settings.get("font", "default")\` beats both). Python code leans
towards EAFP, and here is the case that shows why — a file checked, then used:

~~~python
import os

# LBYL — looks safe, isn't
if os.path.exists("report.csv"):
    # ... another program (or another thread) deletes report.csv RIGHT HERE ...
    with open("report.csv") as f:          # FileNotFoundError anyway!
        data = f.read()
~~~

Between the check and the use there's a gap — a few microseconds, but real. Anything else running on
the computer can delete, rename, or lock the file in that gap. This is called a **race condition**:
the result depends on who gets there first. The check gives you a false sense of safety, and you
*still* need to handle the failure.

~~~python
# EAFP — no gap, because there is no separate check
try:
    with open("report.csv") as f:
        data = f.read()
except FileNotFoundError:
    data = ""
~~~

The \`open\` itself is the check. Either it works, or it raises — there is no moment where the world
can change between asking and doing. The same logic applies to anything shared: files, network
connections, database rows, keys that another thread might remove.

LBYL is still right when the check is cheap, can't go stale, and failure would be expensive to undo —
e.g. validating user input *before* starting a long job. The question to ask: **"Can the answer to my
check change before I act on it?"** If yes, EAFP.
`,
    },
    {
      type: 'text',
      md: md`
## Context managers: cleanup you can't forget

Back to files. The \`try/finally\` version works, but look at how much ceremony it needs, and how easy
it is to forget:

~~~python
f = open("log.txt", "w")
f.write("start\n")
risky_step()          # raises -> the next line never runs
f.close()             # leaked: file never closed, buffered text may never reach disk
~~~

The same shape appears everywhere: a **lock** acquired and never released (every other thread waits
forever); a **database connection** opened and never returned; a **temporary setting** changed and
never restored. The pattern is always *set up → do work → tear down*, and the tear-down must happen
even if the work explodes.

Python gives that pattern its own statement, \`with\`:

~~~python
with open("log.txt", "w") as f:
    f.write("start\n")
    risky_step()      # raises -> the file is STILL closed, then the exception continues
# here, f is closed — guaranteed
~~~

\`with\` guarantees the tear-down. It's the \`try/finally\` you would have written, packaged so you
can't get it wrong.

### How with works: two dunder methods

An object that works with \`with\` is called a **context manager**. It's any object with two special
methods (Py.3's dunders, again):

- \`__enter__(self)\` — runs at the start of the block. Whatever it returns is bound to the name after
  \`as\`.
- \`__exit__(self, exc_type, exc, tb)\` — runs at the end, **always**. If the block raised, the three
  arguments describe the exception (type, the exception object, the traceback); if not, all three are
  \`None\`. If \`__exit__\` returns \`True\`, the exception is swallowed; return \`False\` (or nothing)
  and it carries on up the stack. Almost always you want \`False\`.

So this:

~~~python
with manager as x:
    body
~~~

behaves roughly like:

~~~python
x = manager.__enter__()
try:
    body
finally:
    manager.__exit__(...)     # with the exception's details, if there was one
~~~

Let's write one — a timer that prints how long a block took, even if the block crashed:

~~~python
import time

class Timer:
    def __init__(self, label):
        self.label = label

    def __enter__(self):
        self.start = time.perf_counter()
        return self                      # so 'as t' gives us the Timer itself

    def __exit__(self, exc_type, exc, tb):
        self.elapsed = time.perf_counter() - self.start
        status = "failed" if exc_type else "ok"
        print(f"{self.label}: {self.elapsed:.3f}s ({status})")
        return False                     # never swallow exceptions

with Timer("sum") as t:
    total = sum(range(1_000_000))
# sum: 0.005s (ok)

print(round(t.elapsed, 3))   # 0.005 (or similar) — the object outlives the block
~~~

### The shortcut: @contextmanager and a generator

Writing a class for every set-up/tear-down pair is a lot of typing. The \`contextlib\` module has a
decorator (Py.5) that turns a **generator with exactly one \`yield\`** (Py.6) into a context manager:

~~~python
from contextlib import contextmanager
import time

@contextmanager
def timer(label):
    start = time.perf_counter()          # everything before yield  = __enter__
    try:
        yield                            # the with-block runs HERE
    finally:
        print(f"{label}: {time.perf_counter() - start:.3f}s")   # after yield = __exit__

with timer("loop"):
    for i in range(100_000):
        pass
# loop: 0.002s
~~~

Remember from Py.6 that a generator *pauses* at \`yield\`. That pause is exactly where the body of the
\`with\` runs. When the body finishes, the generator is resumed after the \`yield\`. And if the body
**raises**, the exception is re-raised *at the \`yield\` line* inside the generator — which is why the
\`try/finally\` around the \`yield\` matters. Without it, a crash in the block would skip your
clean-up code, and you'd be back to the original bug. Whatever you \`yield\` becomes the value after
\`as\`.
`,
    },
    {
      type: 'example',
      title: 'fixing the puzzle: a transaction that rolls back on error',
      md: md`
Now we have everything to repair the opening transfer. The plan: take a **snapshot** of the accounts
on entry; if the block raises, **restore the snapshot** and let the exception continue (loudly!).

~~~python
from contextlib import contextmanager

class InsufficientFunds(Exception):
    pass

@contextmanager
def transaction(accounts):
    snapshot = dict(accounts)           # copy of every balance, taken on entry
    try:
        yield accounts
    except Exception:
        accounts.clear()
        accounts.update(snapshot)       # put every balance back
        print("rolled back")
        raise                           # re-raise the SAME exception: never swallow

def transfer(accounts, src, dst, amount):
    if accounts[src] < amount:
        raise InsufficientFunds(f"{src} has {accounts[src]}, needs {amount}")
    with transaction(accounts):
        accounts[src] -= amount
        accounts[dst] += amount


accounts = {"A": 100, "B": 50}

try:
    transfer(accounts, "A", "b", 30)            # the same typo as the puzzle
except KeyError as err:
    print("transfer failed, unknown account:", err)
print(accounts)

transfer(accounts, "A", "B", 30)                # a correct transfer
print(accounts)

# rolled back
# transfer failed, unknown account: 'b'
# {'A': 100, 'B': 50}
# {'A': 70, 'B': 80}
~~~

Walk the failing call:

1. \`transfer\` checks funds (100 is enough), enters \`with transaction(accounts)\`: the snapshot
   \`{'A': 100, 'B': 50}\` is taken, the generator pauses at \`yield\`.
2. \`accounts["A"] -= 30\` → A is 70. \`accounts["b"] += 30\` → \`KeyError: 'b'\`.
3. The \`KeyError\` is thrown into the generator at the \`yield\`. \`except Exception\` catches it,
   restores the snapshot (A back to 100), prints, and \`raise\` with no argument **re-raises the same
   exception**.
4. It travels up out of \`transfer\` to our \`except KeyError\`, which *handles it* — by reporting it.

Compare with the puzzle. Both bad habits are gone: the error is **specific and visible** (we caught
\`KeyError\` on purpose, and printed it), and the work is **all-or-nothing** (the half-done withdrawal
was undone). Note too that the bare \`raise\` inside a handler is the idiom for "I did my clean-up,
now keep going" — catching an error, doing something, and re-raising is fine. Catching and *passing* is
the crime.

(A real database does exactly this with \`with connection:\` — commit if the block succeeds, roll back
if it raises. You've now built the idea yourself.)
`,
    },
    {
      type: 'text',
      md: md`
## Type hints: saying what you expect

The last tool catches a whole class of bugs **before the program ever runs**. Consider:

~~~python
def total(prices):
    return sum(prices)

def find_price(catalog, name):
    return catalog.get(name)       # returns None if the name is missing

catalog = {"apple": 0.5, "bread": 2.0}
p = find_price(catalog, "milk")
print(p * 3)
# TypeError: unsupported operand type(s) for *: 'NoneType' and 'int'
~~~

The bug is that \`find_price\` *can* return \`None\`, and the caller forgot. You find out only when
that exact line runs with that exact missing name — maybe in production, months later.

**Type hints** (also called *annotations*) let you write down what types a function expects and
returns:

~~~python
def total(prices: list[float]) -> float:
    return sum(prices)

def find_price(catalog: dict[str, float], name: str) -> float | None:
    return catalog.get(name)
~~~

Reading them:

- \`prices: list[float]\` — "\`prices\` should be a list of floats."
- \`-> float\` — "this function returns a float."
- \`dict[str, float]\` — "a dict whose keys are strings and whose values are floats."
- \`float | None\` — "a float, **or** \`None\`." You'll also see the older spelling
  \`Optional[float]\` (from \`from typing import Optional\`); it means exactly the same thing.

Hints work on variables and on dataclass fields (Py.3), where they're actually required — the
\`@dataclass\` decorator reads the annotations to know which fields exist:

~~~python
from dataclasses import dataclass

@dataclass
class Item:
    name: str
    price: float
    tags: list[str]
    discount: float | None = None

count: int = 0
~~~
`,
    },
    {
      type: 'ponder',
      question: md`The function below says it takes an \`int\` and returns an \`int\`. What happens when you
run this? Does Python stop the second and third calls?

~~~python
def double(n: int) -> int:
    return n * 2

print(double(4))
print(double("ab"))
print(double(2.5))
~~~`,
      answer: md`Nothing stops them. It prints:

~~~python
8
abab
5.0
~~~

**Python does not enforce type hints at runtime.** The annotations are stored (you can see them in
\`double.__annotations__\`) but the interpreter never checks them: \`"ab" * 2\` is perfectly legal
string repetition, and \`2.5 * 2\` is \`5.0\`. The function happily returns a string while its label
says \`int\`.

So who reads them? A separate program called a **type checker** — the most common is **mypy** — that
reads your code *without running it* and compares every call with every hint:

~~~python
# running: mypy double.py
# double.py:6: error: Argument 1 to "double" has incompatible type "str"; expected "int"
# double.py:7: error: Argument 1 to "double" has incompatible type "float"; expected "int"
~~~

Your editor (VS Code, PyCharm) runs the same kind of checker as you type, and underlines the call in
red. That's the trade: hints cost nothing at runtime and guarantee nothing at runtime — their power is
all *before* you run.`,
    },
    {
      type: 'text',
      md: md`
## Why hints pay off anyway

If Python ignores them, why bother? Three concrete reasons.

**1. They catch \`None\` bugs before you run.** With the hint \`-> float | None\` on \`find_price\`,
mypy flags the careless caller:

~~~python
p = find_price(catalog, "milk")
print(p * 3)
# mypy: error: Unsupported operand types for * ("None" and "int")
~~~

— and it keeps complaining until you handle the \`None\` case. Once you check, the checker *knows*
\`p\` is a float inside the \`if\`:

~~~python
p = find_price(catalog, "milk")
if p is None:
    print("not in catalog")
else:
    print(p * 3)        # mypy is happy: here p can only be a float
~~~

"Forgot it could be None" is one of the most common bugs in all of programming. A checker turns it
from a production crash into a red underline.

**2. Your editor becomes smarter.** When the editor knows \`prices\` is a \`list[float]\`, typing
\`prices.\` offers list methods, and renaming or misspelling something is flagged immediately.

**3. They're documentation that can't go out of date.** A comment saying "returns a price" can lie
after someone edits the function. A hint is checked on every run of mypy, so it stays true.

## Protocol: type hints for duck typing

In Py.2 you met **duck typing**: Python doesn't care what class an object is, only whether it has the
methods you call. "If it quacks, it's a duck." But how do you *write that down* as a hint? Not with a
parent class — the whole point is that unrelated classes should qualify.

\`typing.Protocol\` describes a shape rather than a family:

~~~python
from typing import Protocol

class HasArea(Protocol):
    def area(self) -> float: ...

class Square:                       # NOT a subclass of HasArea
    def __init__(self, side: float):
        self.side = side
    def area(self) -> float:
        return self.side ** 2

class Circle:                       # nor is this
    def __init__(self, r: float):
        self.r = r
    def area(self) -> float:
        return 3.14159 * self.r ** 2

def total_area(shapes: list[HasArea]) -> float:
    return sum(s.area() for s in shapes)

print(total_area([Square(2), Circle(1)]))   # 7.14159
~~~

The \`...\` in the protocol is literally an ellipsis: "body intentionally left out." \`Square\` and
\`Circle\` never mention \`HasArea\`, yet the type checker accepts them, because they have an
\`area()\` returning a float. Pass something *without* an \`area\` method and mypy objects. It's duck
typing, checked before you run.

## Putting it together

~~~python
from contextlib import contextmanager
from dataclasses import dataclass


class BankError(Exception):
    pass

class InsufficientFunds(BankError):
    pass


@dataclass
class Account:
    owner: str
    balance: float


@contextmanager
def transaction(*accounts: Account):
    saved = [a.balance for a in accounts]
    try:
        yield
    except Exception:
        for a, b in zip(accounts, saved):
            a.balance = b
        raise


def transfer(src: Account, dst: Account, amount: float) -> None:
    if amount <= 0:
        raise ValueError(f"amount must be positive, got {amount}")
    with transaction(src, dst):
        if src.balance < amount:
            raise InsufficientFunds(f"{src.owner} has {src.balance}, needs {amount}")
        src.balance -= amount
        dst.balance += amount


a, b = Account("Ana", 100), Account("Ben", 50)
try:
    transfer(a, b, 500)
except InsufficientFunds as err:
    print("refused:", err)
print(a, b)

# refused: Ana has 100, needs 500
# Account(owner='Ana', balance=100) Account(owner='Ben', balance=50)
~~~

Every tool in its place: **specific** custom exceptions with informative messages, a context manager
that guarantees all-or-nothing, a narrow \`except\` at the call site that *reports* rather than hides,
and type hints that document — and let a checker verify — what every function expects.

## What you now own

1. **What an exception is:** an object that abandons the current line and travels *up* the call stack
   until an \`except\` handles it — or it reaches the top and prints a traceback (read it bottom-up).
2. **Catch specifically:** name the exact type you have a plan for, keep the \`try\` small; bare
   \`except:\` and \`except Exception: pass\` swallow bugs and even Ctrl+C, and destroy the evidence.
3. **The full shape:** \`except\` runs on a matching error, \`else\` only on success, \`finally\`
   always — and never \`return\` inside \`finally\`.
4. **Raising well:** messages that say what was wrong and with what values; custom exception classes
   in a hierarchy (catching the parent catches the children); \`raise ... from err\` to translate
   errors without losing the cause.
5. **EAFP over LBYL** whenever the answer to your check can change before you act (the race condition).
6. **Context managers:** \`with\` guarantees tear-down; build one with \`__enter__\`/\`__exit__\` or with
   \`@contextmanager\` and a single \`yield\` wrapped in \`try/finally\` — up to a rolling-back
   transaction.
7. **Type hints:** annotations like \`list[float]\`, \`dict[str, float]\`, \`X | None\`; not enforced at
   runtime, but checked by mypy and your editor — especially for forgotten \`None\` — plus \`Protocol\`
   for typed duck typing.

Next: code that is correct *and* stays correct — testing, so that you find the bugs before your users
do.
`,
    },
  ],
  questions: [
    {
      id: 'py-l7-q1',
      kind: 'mcq',
      prompt: md`A loop processes thousands of files and wraps its body in \`try: ... except: pass\`. Which is
the **most serious** problem with that bare \`except\`?`,
      options: [
        md`It makes the loop run slower, because Python has to check every exception type`,
        md`It catches and discards everything — your own bugs (like a \`NameError\` from a typo) and even \`KeyboardInterrupt\`, so the program hides its failures and may not stop on Ctrl+C`,
        md`It's a syntax error in Python 3; you must always name a type`,
        md`It only catches exceptions raised directly in the loop body, not ones from functions it calls`,
      ],
      answer: 1,
      explain: md`A bare \`except\` catches *everything*, including \`KeyboardInterrupt\` and every
bug you didn't anticipate, and \`pass\` throws the evidence away. Option A tempts because "catching
everything" sounds expensive, but the cost of a \`try\` is negligible — the damage is silent wrong
results. Option C is false: bare \`except:\` is legal (that's what makes it dangerous). Option D gets
propagation backwards: exceptions travel *up* the call stack, so a \`try\` catches errors from every
function called inside it, however deep.`,
    },
    {
      id: 'py-l7-q2',
      kind: 'numeric',
      prompt: md`How many lines does this print?

~~~python
def c():
    print("c1")
    raise KeyError("k")
    print("c2")

def b():
    print("b1")
    c()
    print("b2")

def a():
    print("a1")
    b()
    print("a2")

try:
    a()
except KeyError:
    print("caught")
finally:
    print("done")
~~~`,
      answer: 5,
      tolerance: 0,
      explain: md`\`a1\`, \`b1\`, \`c1\`, then the \`KeyError\` travels up through \`c\`, \`b\`, and \`a\`,
skipping \`c2\`, \`b2\`, and \`a2\` — each function is abandoned at the line where the exception
arrived. The \`except\` prints \`caught\` and \`finally\` prints \`done\`: **5** lines. If you said 8,
you imagined that the callers resume after a callee fails — they don't, unless they catch it.`,
    },
    {
      id: 'py-l7-q3',
      kind: 'mcq',
      prompt: md`Given

~~~python
class BankError(Exception): pass
class InsufficientFunds(BankError): pass
~~~

which handler list is written **correctly**, so that \`InsufficientFunds\` gets its own special
handling and other bank errors get a general one?`,
      options: [
        md`\`except BankError:\` first, then \`except InsufficientFunds:\``,
        md`\`except InsufficientFunds:\` first, then \`except BankError:\``,
        md`Either order works — Python picks the most specific matching handler`,
        md`Neither: you can't catch a subclass exception by name, only \`Exception\``,
      ],
      answer: 1,
      explain: md`Python tries \`except\` clauses **top to bottom** and runs the **first** match, and
\`except BankError\` matches every child too (it's an \`isinstance\` check). So children must come
first. Option C is the tempting one because some languages and many people *assume* "most specific
wins" — Python doesn't do that. With option A the \`InsufficientFunds\` handler can never run. Option D
is false: catching custom exception classes by name is the whole point of making them.`,
    },
    {
      id: 'py-l7-q4',
      kind: 'numeric',
      prompt: md`What is printed?

~~~python
count = 0
for x in [1, 0, 2, "a", 4]:
    try:
        r = 10 // x
    except ZeroDivisionError:
        count += 10
    except TypeError:
        count += 100
    else:
        count += 1
    finally:
        count += 1000
print(count)
~~~`,
      answer: 5113,
      tolerance: 0,
      explain: md`\`finally\` runs on all 5 iterations: **5000**. \`else\` runs for the three successes
(1, 2, 4): **+3**. \`0\` raises \`ZeroDivisionError\`: **+10**. \`"a"\` raises \`TypeError\` (you
can't \`//\` an int by a string): **+100**. Total 5000 + 3 + 10 + 100 = **5113**. Designing the
increments as different powers of ten lets you read each clause's count straight from the digits —
a handy trick for tracing.`,
    },
    {
      id: 'py-l7-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Python's standard library has \`contextlib.suppress\`, which
ignores only the exception types you name:

~~~python
with ignored(KeyError):
    del settings["missing"]      # KeyError is ignored; anything else still raises
print("carried on")
~~~

On paper, implement \`ignored(*types)\` **twice**: (1) as a class with \`__enter__\` and \`__exit__\`;
(2) with \`@contextmanager\` and a generator. Then (3) explain in one or two sentences why this is
*not* the same bad habit as \`except: pass\`, and (4) say exactly what your class's \`__exit__\`
returns in each of three cases: no exception, a \`KeyError\`, a \`ValueError\`.`,
      rubric: md`**(1) Class version:**

~~~python
class ignored:
    def __init__(self, *types):
        self.types = types

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        # True tells Python "swallow it"; False lets it propagate
        return exc_type is not None and issubclass(exc_type, self.types)
~~~

**(2) Generator version:**

~~~python
from contextlib import contextmanager

@contextmanager
def ignored(*types):
    try:
        yield
    except types:         # a tuple of types works directly in except
        pass
~~~

**(3)** It swallows only the types the caller *explicitly named*, at a spot where they've decided that
failure is fine (e.g. "delete this key if present"). Everything unexpected — bugs, Ctrl+C — still
propagates. \`except: pass\` swallows everything, including errors nobody anticipated.

**(4)** No exception: \`exc_type\` is \`None\` → returns \`False\` (nothing to swallow). \`KeyError\`:
\`issubclass(KeyError, (KeyError,))\` is true → \`True\`, swallowed. \`ValueError\`: \`False\` → it
propagates.

Full credit: both versions work; the class uses the \`__exit__\` return value correctly (returning
\`True\` *unconditionally* is the key mistake — that recreates \`except: pass\`); the generator catches
only \`types\`; and (3) names the "only what you asked for" distinction. Using \`issubclass\` (so
subclasses of a named type are also ignored) is the mark of a strong answer; \`exc_type in self.types\`
is acceptable with a note that it misses subclasses.`,
    },
    {
      id: 'py-l7-q6',
      kind: 'mcq',
      prompt: md`Why is this code — check first, then open — considered wrong in Python?

~~~python
if os.path.exists("data.csv"):
    with open("data.csv") as f:
        rows = f.read()
~~~`,
      options: [
        md`\`os.path.exists\` is slow, so the program wastes time`,
        md`The file can be deleted or renamed by something else between the check and the \`open\`, so \`open\` can still raise — the check gives false safety (a race condition); try the \`open\` and catch \`FileNotFoundError\` instead`,
        md`\`with open\` requires the file to be checked with \`try\` first, or it won't close`,
        md`It's fine; LBYL is always the preferred Python style`,
      ],
      answer: 1,
      explain: md`The gap between checking and acting is a **race condition**: the world can change in
between, so you need exception handling anyway — and once you have it, the check adds nothing. Option A
tempts because two operations *feel* wasteful, but speed isn't the issue; correctness is. Option C is
false: \`with\` closes the file on its own. Option D inverts Python's usual advice: EAFP is preferred
precisely when the thing being checked can change before you use it.`,
    },
    {
      id: 'py-l7-q7',
      kind: 'numeric',
      prompt: md`Handlers are numbered by what they print. Which number is printed?

~~~python
class BankError(Exception): pass
class InsufficientFunds(BankError): pass

try:
    raise InsufficientFunds("balance too low")
except ValueError:
    print(1)
except BankError:
    print(2)
except InsufficientFunds:
    print(3)
except Exception:
    print(4)
~~~`,
      answer: 2,
      tolerance: 0,
      explain: md`\`InsufficientFunds\` is not a \`ValueError\` (their families are unrelated), so
handler 1 doesn't match. It *is* a \`BankError\` — a child counts as its parent — so handler **2**
matches and runs, and no later handler is even considered. Answering 3 means assuming the most
specific handler wins; Python simply takes the first match. Handler 3 here is dead code: it can never
run.`,
    },
    {
      id: 'py-l7-q8',
      kind: 'mcq',
      prompt: md`You run this file with plain \`python3\` (no type checker). What happens?

~~~python
def area(width: float, height: float) -> float:
    return width * height

print(area("ab", 3))
~~~`,
      options: [
        md`\`TypeError\` before anything runs, because \`"ab"\` is not a \`float\``,
        md`\`TypeError\` when \`area\` is called, because Python checks the arguments against the hints`,
        md`It prints \`ababab\` — hints are not enforced at runtime; a checker like mypy would flag the call`,
        md`It prints \`0\`, because Python converts \`"ab"\` to the nearest float`,
      ],
      answer: 2,
      explain: md`Python stores annotations but never checks them while running, and \`"ab" * 3\` is legal
string repetition. Options A and B are what the hints *look like* they promise — and what they would do
in languages such as Java — which is why they tempt. The checking happens in a separate tool (mypy, or
your editor) that reads the code without running it. Option D invents a conversion Python never does.`,
    },
    {
      id: 'py-l7-q9',
      kind: 'numeric',
      prompt: md`What does the last line print?

~~~python
log = []

class Tracker:
    def __enter__(self):
        log.append("in")
        return self

    def __exit__(self, exc_type, exc, tb):
        log.append("out")
        return False

for i in range(3):
    try:
        with Tracker():
            if i == 1:
                raise ValueError("boom")
            log.append("body")
    except ValueError:
        log.append("caught")

print(len(log))
~~~`,
      answer: 9,
      tolerance: 0,
      explain: md`\`i = 0\`: \`in\`, \`body\`, \`out\` (3). \`i = 1\`: \`in\`, then the raise skips
\`body\`; \`__exit__\` still runs → \`out\`; it returns \`False\`, so the \`ValueError\` continues to
the \`except\` → \`caught\` (3). \`i = 2\`: \`in\`, \`body\`, \`out\` (3). Total **9**. The key facts:
\`__exit__\` runs even when the block raises, and returning \`False\` lets the exception keep going. If
\`__exit__\` had returned \`True\`, the \`caught\` entry would vanish and the answer would be 8.`,
    },
    {
      id: 'py-l7-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid who has written a few Python games asks: "What is an
exception, what does \`try/except\` do, and why did my teacher say \`except: pass\` is bad? Also, what's
\`finally\` for?" Explain using an analogy you invent (a relay race, a restaurant kitchen, a school
office — or something better). No jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **Exception, made concrete** — e.g. a restaurant: the cook finds there are no eggs. They can't make
   the omelette, so they stop and pass a note *back* — to the waiter, then to the manager — until
   someone who knows what to do with it decides (offer pancakes instead). That note travelling back
   until someone deals with it is the exception.
2. **try/except** — "try to make the omelette; *if* the no-eggs note comes back, do this instead." The
   kid should see you only catch the problems you have a plan for.
3. **Why \`except: pass\` is bad** — it's like a manager who screws up *every* note without reading it:
   "out of eggs", "the kitchen is on fire", "the customer wants to leave". Nobody fixes anything, the
   customer gets no food, and nobody knows why. Hiding problems doesn't solve them.
4. **finally** — "no matter what happened, turn off the stove before you go home." Clean-up that
   happens whether things went well or badly.
5. **Jargon audit:** "call stack", "propagate", "handler", "raise", "traceback", or "cleanup
   semantics" used without a kid-level translation first = partial at best. An answer that is correct
   but reads like documentation loses most of the marks — the task is teaching.`,
    },
    {
      id: 'py-l7-q11',
      kind: 'written',
      prompt: md`**Design on paper.** A school app reads a student's marks from text like \`"Ana,87"\`.
Write, with type hints throughout:

1. A custom exception \`BadRecord\` (and say what class it should inherit from).
2. \`parse_record(line: str) -> tuple[str, int]\` that raises \`BadRecord\` with a helpful message if
   the line has no comma, or if the mark isn't a whole number — using \`raise ... from err\` for the
   second case — or if the mark is outside 0–100.
3. \`load_all(lines: list[str]) -> dict[str, int]\` that skips bad lines but **prints** (doesn't hide)
   each problem, and returns the good ones.

Then say in one sentence why \`load_all\` catching \`BadRecord\` is fine while catching \`Exception\`
there would be worse.`,
      rubric: md`A strong answer:

~~~python
class BadRecord(ValueError):          # or Exception; ValueError fits "bad value"
    pass

def parse_record(line: str) -> tuple[str, int]:
    if "," not in line:
        raise BadRecord(f"expected 'name,mark', got {line!r}")
    name, mark_text = line.split(",", 1)
    try:
        mark = int(mark_text)
    except ValueError as err:
        raise BadRecord(f"mark must be a whole number, got {mark_text!r}") from err
    if not 0 <= mark <= 100:
        raise BadRecord(f"mark must be 0-100, got {mark}")
    return name.strip(), mark

def load_all(lines: list[str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for line in lines:
        try:
            name, mark = parse_record(line)
        except BadRecord as err:
            print("skipping:", err)
            continue
        result[name] = mark
    return result

print(load_all(["Ana,87", "Ben", "Cy,abc", "Di,140", "Ed,55"]))
# skipping: expected 'name,mark', got 'Ben'
# skipping: mark must be a whole number, got 'abc'
# skipping: mark must be 0-100, got 140
# {'Ana': 87, 'Ed': 55}
~~~

**Must have:** \`BadRecord\` inheriting from \`Exception\` (or a subclass such as \`ValueError\`); messages
that include the bad value; \`from err\` on the \`int()\` failure; the \`try\` kept small; bad lines
*reported*, not passed silently; hints on every signature.

**The sentence:** catching \`BadRecord\` handles only the failure we have a plan for (bad input); catching
\`Exception\` would also hide real bugs in our own code (a typo raising \`NameError\`, say) as if they were
bad records.

Partial credit if the code works but swallows errors silently, uses a bare \`except\`, or loses the
original cause.`,
    },
    {
      id: 'py-l7-q12',
      kind: 'written',
      prompt: md`**Find the bugs.** This code has **four** separate problems. For each, say what goes wrong
when it runs (or what it hides), and write the fix.

~~~python
from contextlib import contextmanager

@contextmanager
def opened(path):
    f = open(path)
    yield f
    f.close()

def read_total(path: str) -> int:
    try:
        with opened(path) as f:
            return sum(int(line) for line in f)
    except Exception:
        return 0
    finally:
        return -1

def average(nums: list[int]) -> float:
    if len(nums) == 0:
        return None
    return sum(nums) / len(nums)
~~~`,
      rubric: md`**Bug 1 — no \`try/finally\` around \`yield\`.** If the \`with\` block raises (e.g. a line
isn't a number), the exception is thrown in at \`yield\`, so \`f.close()\` never runs and the file leaks
— exactly what a context manager was supposed to prevent. *Fix:*

~~~python
@contextmanager
def opened(path):
    f = open(path)
    try:
        yield f
    finally:
        f.close()
~~~

**Bug 2 — \`except Exception: return 0\` swallows everything.** A missing file, a bad line, and a real
bug in our code all turn into a silent \`0\`, indistinguishable from an empty file. *Fix:* catch only
what you have a plan for (e.g. \`FileNotFoundError\`) and let the rest propagate — or raise a clear error
of your own with \`from err\`.

**Bug 3 — \`return -1\` inside \`finally\`.** \`finally\` always runs last and its \`return\` replaces
any other return value, so \`read_total\` **always returns -1**, even on success — and it would cancel
any exception in flight. *Fix:* remove the \`finally\` entirely (the \`with\` already handles closing).

**Bug 4 — the hint lies.** \`average\` is annotated \`-> float\` but can return \`None\`. Python won't
complain at runtime, but callers trusting the hint will write \`average(xs) * 2\` and crash on empty
lists; mypy flags the \`return None\`. *Fix:* either annotate \`-> float | None\` (and callers must
check), or — usually better — \`raise ValueError("average of empty list")\`.

**Corrected \`read_total\`:**

~~~python
def read_total(path: str) -> int:
    with opened(path) as f:
        return sum(int(line) for line in f)
~~~

Full credit = all four, each with its concrete consequence (not just "bad style"). Spotting that bug 3
makes the function return -1 *even on success* shows you've derived how \`finally\` interacts with
\`return\` — the lesson's sharpest edge.`,
    },
  ],
}
