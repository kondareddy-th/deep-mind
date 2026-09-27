// Python Foundations, Lesson 5 — Functions are objects: closures, decorators & flexible arguments
//
// Content uses the `md` tag from ../md.js: it behaves like String.raw, and an escaped
// backtick \` becomes a real backtick. Code blocks use ~~~python fences (no escaping).
// NEVER write the sequence dollar-brace inside content (JS interpolation).

import { md } from '../md.js'

export default {
  id: 'py-l5',
  title: 'Py.5 Functions are objects — closures, decorators & flexible arguments',
  subtitle:
    'You need timing on twelve functions and retries on five more. Instead of pasting the same code seventeen times, this lesson discovers that a function is just a value you can hand around — and invents closures, decorators, and flexible arguments as the tools that let you write "timing" once and apply it anywhere.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Your training pipeline is slow and you don't know where. There are twelve functions —
\`load_data\`, \`tokenize\`, \`build_batches\`, and nine more — and you want to know how long each one
takes. Here's the obvious approach, applied to the first one:

~~~python
import time

def load_data(path):
    start = time.perf_counter()
    # ... the real work ...
    rows = [line for line in open(path)]
    elapsed = time.perf_counter() - start
    print(f"load_data took {elapsed:.2f}s")
    return rows
~~~

Four lines of timing wrapped around one line of real work. Now do it eleven more times. Then your
colleague says: "Five of the functions call a flaky server. When the network fails, retry up to three
times." So five functions also get this:

~~~python
def fetch_labels(url):
    for attempt in range(3):
        try:
            # ... the real work ...
            return download(url)
        except ConnectionError:
            if attempt == 2:
                raise
~~~

That's seventeen functions with copy-pasted scaffolding. Count the ways it goes wrong:

- **Typos multiply.** In function nine you print \`"tokenize took..."\` inside \`build_batches\`, and
  for a week you chase the wrong bottleneck.
- **Changes multiply.** Your colleague wants milliseconds instead of seconds. That's twelve edits, and
  you'll miss one.
- **The real work disappears.** Each function is now mostly timing and retry code. The one line that
  matters is buried.

What you actually want to say is: *"here is the timing behaviour, written once — now apply it to
\`load_data\`, and to \`tokenize\`, and to anything else."* That requires treating a function as
something you can **hand to other code**, the same way you hand a list to \`len\`.

That's this whole lesson. It turns out Python already lets you do this, and once you see it, four
features that look unrelated — function tables, closures, decorators, and \`*args\` — all fall out of
the same single fact.

## The single fact: a function is a value

When you write \`def greet(): ...\`, Python does two things: it builds a **function object**, and it
binds the name \`greet\` to it — exactly like \`x = 5\` builds an int and binds \`x\` to it. The name and
the object are separate things.

~~~python
def greet(name):
    return f"Hello, {name}!"

print(greet)            # <function greet at 0x104b2c040>
print(type(greet))      # <class 'function'>

say_hi = greet          # no parentheses: we are NOT calling it, just naming it again
print(say_hi("Ada"))    # Hello, Ada!
print(say_hi is greet)  # True — two names, one function object
~~~

The parentheses are the whole difference. \`greet\` *is* the function. \`greet("Ada")\` *calls* it and
gives you back what it returns. Keep that distinction sharp — every bug in this lesson is someone
confusing the two.

Because a function is a value, you can do anything with it that you can do with a value:

**1. Store it in a list and loop over it.**

~~~python
def double(x):
    return x * 2

def square(x):
    return x * x

def negate(x):
    return -x

steps = [double, square, negate]
value = 3
for step in steps:
    value = step(value)
print(value)   # -36    (3 -> 6 -> 36 -> -36)
~~~

**2. Store it in a dict — the dispatch table.** Here's code you've probably written:

~~~python
def calculate(op, a, b):
    if op == "add":
        return a + b
    elif op == "sub":
        return a - b
    elif op == "mul":
        return a * b
    elif op == "div":
        return a / b
    else:
        raise ValueError(f"unknown op {op!r}")
~~~

Every new operation means another \`elif\`, and the function grows forever. But look at what the chain
really *is*: a lookup from a name to a behaviour. A dict is a lookup from a key to a value — and a
function is a value.

~~~python
def add(a, b): return a + b
def sub(a, b): return a - b
def mul(a, b): return a * b
def div(a, b): return a / b

OPERATIONS = {"add": add, "sub": sub, "mul": mul, "div": div}

def calculate(op, a, b):
    if op not in OPERATIONS:
        raise ValueError(f"unknown op {op!r}")
    return OPERATIONS[op](a, b)

print(calculate("mul", 6, 7))   # 42
~~~

Read \`OPERATIONS[op](a, b)\` in two steps: \`OPERATIONS[op]\` fetches a function object out of the dict;
\`(a, b)\` calls it. Adding an operation is now one line in the dict, and the table can even be built
or extended at runtime. You'll see this exact shape inside real ML code — a dict from
\`"relu"\`/\`"gelu"\`/\`"tanh"\` to activation functions, chosen by a config string.

**3. Pass it as an argument.** You've already done this without noticing:

~~~python
words = ["banana", "kiwi", "apple", "fig"]

print(sorted(words))            # ['apple', 'banana', 'fig', 'kiwi']   alphabetical
print(sorted(words, key=len))   # ['fig', 'kiwi', 'apple', 'banana']   by length
~~~

\`key=len\` hands the *function* \`len\` (no parentheses!) to \`sorted\`. Internally, \`sorted\` calls
\`len(word)\` on each word and sorts by those results. You can hand it your own function too:

~~~python
def last_letter(word):
    return word[-1]

print(sorted(words, key=last_letter))   # ['banana', 'apple', 'fig', 'kiwi']
~~~

Check it on paper, the way you always should with \`key=\`: **compute the keys first, then sort the
keys.** The last letters are banana → \`a\`, kiwi → \`i\`, apple → \`e\`, fig → \`g\`. Sorted
alphabetically: a, e, g, i — so banana, apple, fig, kiwi. Trying to eyeball the final order without
writing the keys down is exactly where people slip.

A function that takes or returns another function is called a **higher-order function**. \`sorted\` is
one. You're about to write your own.

**4. Return it from another function.** A function can build a function and hand it back:

~~~python
def pick_activation(name):
    def relu(x):
        return max(0, x)
    def identity(x):
        return x
    return relu if name == "relu" else identity

act = pick_activation("relu")
print(act(-3), act(5))   # 0 5
~~~

\`relu\` is defined *inside* \`pick_activation\`, and returned — not called. Whoever receives it can call
it later. Hold on to that idea; it's the seed of everything that follows.

## lambda: a function without a name

Sometimes the function you want to pass is tiny and used once. Writing a whole \`def\` for it is
ceremony. \`lambda\` makes a function in a single expression:

~~~python
square = lambda x: x * x      # same as: def square(x): return x * x
print(square(7))              # 49

pairs = [("ana", 31), ("ben", 25), ("cy", 40)]
print(sorted(pairs, key=lambda p: p[1]))
# [('ben', 25), ('ana', 31), ('cy', 40)]    sorted by the age, which is p[1]
~~~

The rules: \`lambda params: expression\`. One expression only — no statements, no \`if\` blocks, no
loops, no \`return\` (the expression's value *is* what's returned).

**When not to use it.** \`square = lambda x: x * x\` is legal but pointless: you've given it a name
anyway, so use \`def\`, which also gives it a proper \`__name__\` for error messages. Use \`lambda\` for
the throwaway one-liner you pass straight into something else (\`key=\`, a dispatch table entry). The
moment it needs a comment to be understood, it wants to be a \`def\`.
`,
    },
    {
      type: 'example',
      title: 'a dispatch table with lambdas, and sorting by two things at once',
      md: md`
A small command interpreter — the kind of thing you'd write for a quick experiment runner:

~~~python
COMMANDS = {
    "upper":   lambda s: s.upper(),
    "reverse": lambda s: s[::-1],
    "count":   lambda s: str(len(s)),
    "shout":   lambda s: s.upper() + "!!!",
}

def run(command, text):
    action = COMMANDS.get(command)
    if action is None:
        return f"unknown command: {command}"
    return action(text)

print(run("upper", "hello"))     # HELLO
print(run("reverse", "hello"))   # olleh
print(run("count", "hello"))     # 5
print(run("dance", "hello"))     # unknown command: dance

COMMANDS["first"] = lambda s: s[0]    # extended at runtime — no code edited
print(run("first", "hello"))     # h
~~~

Now sorting. A \`key\` function can return a **tuple**, and tuples compare element by element — first
by the first item, ties broken by the second:

~~~python
runs = [
    {"name": "exp-a", "loss": 0.31, "epochs": 10},
    {"name": "exp-b", "loss": 0.25, "epochs": 20},
    {"name": "exp-c", "loss": 0.25, "epochs": 5},
    {"name": "exp-d", "loss": 0.40, "epochs": 3},
]

best = sorted(runs, key=lambda r: (r["loss"], r["epochs"]))
print([r["name"] for r in best])
# ['exp-c', 'exp-b', 'exp-a', 'exp-d']
~~~

Trace the keys: a → (0.31, 10), b → (0.25, 20), c → (0.25, 5), d → (0.40, 3). The two 0.25s tie on
loss, so epochs decides: 5 before 20. "Lowest loss, and among equals, the cheapest run" — expressed in
one line, because we could hand \`sorted\` a function.
`,
    },
    {
      type: 'text',
      md: md`
## Closures: functions that remember

Back to returning functions. What if the inner function *uses a variable from the outer one*?

~~~python
def make_multiplier(n):
    def multiply(x):
        return x * n        # n is not a parameter of multiply — it's from outside
    return multiply

triple = make_multiplier(3)
times10 = make_multiplier(10)

print(triple(5))     # 15
print(times10(5))    # 50
~~~

Stop and notice how strange that is. By the time we call \`triple(5)\`, \`make_multiplier(3)\` has
*finished running*. Its local variable \`n\` should be gone. Yet \`triple\` still knows \`n\` is 3, and
\`times10\` knows its \`n\` is 10 — two different \`n\`s, alive at the same time.

What happened: when Python builds \`multiply\`, it sees that the body uses \`n\`, which belongs to the
enclosing function, and it attaches that variable to the new function object. A function bundled with
variables it remembers from where it was created is called a **closure**. You can even peek:

~~~python
print(triple.__closure__[0].cell_contents)   # 3
~~~

Here's the Py.1 connection. Remember the question "does this need to remember something between
calls?" — the answer that meant *use a class*. A closure is the other way to get memory: a tiny,
one-method object. Compare:

~~~python
class Multiplier:
    def __init__(self, n):
        self.n = n
    def __call__(self, x):     # Py.3's dunder: makes instances callable
        return x * self.n

triple_obj = Multiplier(3)
print(triple_obj(5))   # 15 — same behaviour as the closure
~~~

Same idea, two spellings. When the "object" has exactly one behaviour, the closure is shorter.

### Changing remembered state: nonlocal

A closure can *read* the outer variable freely. To *reassign* it, you must say so:

~~~python
def make_counter():
    count = 0
    def counter():
        nonlocal count      # "count means the outer one, not a new local"
        count += 1
        return count
    return counter

c = make_counter()
print(c(), c(), c())   # 1 2 3
d = make_counter()
print(d())             # 1   — d has its OWN count, separate from c's
print(c())             # 4
~~~

Without \`nonlocal\`, the line \`count += 1\` would make Python treat \`count\` as a brand-new local
variable of \`counter\` — and then crash with \`UnboundLocalError\`, because it's being read before
it's been assigned. It's the same rule as Py.1's \`self.count += 1\`: **assignment decides where a
name lives**. \`nonlocal\` overrides that decision.

Each call to \`make_counter()\` runs the outer function again, creating a fresh \`count\`. That's why
\`c\` and \`d\` never interfere — just like two instances of a class each getting their own
\`self.count\` in \`__init__\`.

### The famous trap: closures remember variables, not values

This distinction — a closure remembers the *variable*, not a snapshot of its value — sounds pedantic
until it bites. And it bites everyone once.
`,
    },
    {
      type: 'ponder',
      question: md`You want three functions: one that returns 0, one that returns 1, one that returns 2.
Predict the exact output of each \`print\`:

~~~python
funcs = [lambda: i for i in range(3)]
print(funcs[0]())
print(funcs[1]())
print([f() for f in funcs])
~~~`,
      answer: md`All three functions return **2**:

~~~python
2
2
[2, 2, 2]
~~~

Each \`lambda: i\` is a closure over the *variable* \`i\` — and there is only one \`i\`, which the loop
keeps reassigning: 0, then 1, then 2. The lambdas don't look at \`i\` when they're *created*; they look
when they're *called*. By the time you call any of them, the loop has finished and \`i\` is 2. Three
functions, one shared variable, one final value.

This is called **late binding**: the name is looked up late, at call time. It's the same root idea as
Py.1's shared-list trap — several things you *thought* were independent are all pointing at one
shared thing.

**The fix: freeze the value with a default argument.**

~~~python
funcs = [lambda i=i: i for i in range(3)]
print([f() for f in funcs])   # [0, 1, 2]
~~~

\`i=i\` looks odd but reads simply: "this lambda has a parameter named \`i\` whose default is *the
current value* of the loop's \`i\`." Default values are computed once, when the function is created
(remember that sentence — it comes back at the end of the lesson as a trap of its own). So each lambda
captures its own snapshot: 0, 1, 2.

The other clean fix is a factory function, where each call creates a fresh variable:

~~~python
def make_const(v):
    return lambda: v

funcs = [make_const(i) for i in range(3)]
print([f() for f in funcs])   # [0, 1, 2]
~~~

Each call to \`make_const\` has its own \`v\`, exactly like each \`make_counter()\` had its own
\`count\`. This trap shows up for real when you build lists of callbacks or learning-rate schedules in a
loop.`,
    },
    {
      type: 'text',
      md: md`
## Decorators, derived

Now we have every piece needed to solve the puzzle. Let's build the "timing, written once" tool from
nothing but what's on this page.

We want: give me any function, and I'll give you back a function that *does the same thing, but also
times it*. That's a function that takes a function and returns a function. We know how to write those:

~~~python
import time

def timed(func):
    def wrapper(x):
        start = time.perf_counter()
        result = func(x)                       # call the ORIGINAL function
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} took {elapsed:.2f}s")
        return result                          # hand back its answer unchanged
    return wrapper                             # return the new function, NOT wrapper()
~~~

\`wrapper\` is a closure: it remembers \`func\`. Now apply it by hand:

~~~python
def slow_square(x):
    time.sleep(0.5)
    return x * x

slow_square = timed(slow_square)   # rebind the name to the wrapped version

print(slow_square(4))
# slow_square took 0.50s
# 16
~~~

Trace that rebinding line carefully, because it's the whole trick. On the right, \`timed\` receives the
original function object and returns \`wrapper\`, which remembers the original as \`func\`. On the left,
the *name* \`slow_square\` is pointed at \`wrapper\`. Everyone who calls \`slow_square\` from now on gets
the timed version — and the original is still alive inside the closure, doing the real work.

We never touched \`slow_square\`'s body. The timing code exists exactly once.

**That's a decorator.** A decorator is nothing more than *a function that takes a function and returns
a new function*. And because \`f = timed(f)\` is so common, Python gives it a shorthand:

~~~python
@timed
def slow_square(x):
    time.sleep(0.5)
    return x * x
~~~

The \`@timed\` line means *exactly* "after defining \`slow_square\`, do
\`slow_square = timed(slow_square)\`". Not similar to — exactly. There's no other magic. If you ever get
confused by a decorator, rewrite the \`@\` line as the assignment and the confusion evaporates.

## Making it work on any function: \`*args\` and \`**kwargs\`

Our \`wrapper(x)\` has a hidden flaw. Try it on a function with two arguments:

~~~python
@timed
def add(a, b):
    return a + b

add(2, 3)
# TypeError: timed.<locals>.wrapper() takes 1 positional argument but 2 were given
~~~

The wrapper only accepts one argument, so it can't wrap \`add\`. We need a wrapper that accepts
*whatever* it's given and passes it all through untouched. Python has syntax for exactly that.

**Collecting.** In a function *definition*, \`*args\` gathers any extra positional arguments into a
tuple, and \`**kwargs\` gathers any extra keyword arguments into a dict. (The names are convention;
the stars do the work.)

~~~python
def show(*args, **kwargs):
    print("args:", args)
    print("kwargs:", kwargs)

show(1, 2, 3, lr=0.01, verbose=True)
# args: (1, 2, 3)
# kwargs: {'lr': 0.01, 'verbose': True}

show()
# args: ()
# kwargs: {}
~~~

**Unpacking.** In a function *call*, the same stars do the reverse: \`*\` spreads a list or tuple into
positional arguments, \`**\` spreads a dict into keyword arguments.

~~~python
def describe(name, age, city="?"):
    return f"{name}, {age}, {city}"

values = ["Ada", 36]
options = {"city": "London"}

print(describe(*values))              # Ada, 36, ?          same as describe("Ada", 36)
print(describe(*values, **options))   # Ada, 36, London     same as describe("Ada", 36, city="London")

config = {"name": "Alan", "age": 41, "city": "Wilmslow"}
print(describe(**config))             # Alan, 41, Wilmslow
~~~

That last line is how ML code turns a config file into a function call: load a dict, then
\`train(**config)\`.

Put collecting and unpacking together and you get the universal pass-through:

~~~python
def timed(func):
    def wrapper(*args, **kwargs):          # collect everything...
        start = time.perf_counter()
        result = func(*args, **kwargs)     # ...and pass it all on, unchanged
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} took {elapsed:.2f}s")
        return result
    return wrapper
~~~

Now \`@timed\` works on \`add(a, b)\`, on \`load_data(path)\`, on \`train(model, data, lr=0.1)\` — any
signature at all. This is the shape of almost every decorator you'll ever write.

## Why \`functools.wraps\` matters

One more flaw, and it's sneaky because nothing crashes:

~~~python
@timed
def load_data(path):
    """Read every line of the file at path."""
    return open(path).readlines()

print(load_data.__name__)   # wrapper
print(load_data.__doc__)    # None
~~~

Of course: the name \`load_data\` now points at \`wrapper\`, so it reports wrapper's name and wrapper's
(empty) docstring. Now imagine you've timed all twelve pipeline functions. Every error traceback,
every log line, every \`help()\` call says \`wrapper\`, \`wrapper\`, \`wrapper\`. Debugging tools that look
up functions by name get confused too.

The fix is one line from the standard library — itself a decorator, applied to the wrapper:

~~~python
import functools
import time

def timed(func):
    @functools.wraps(func)                 # copy func's name, docstring, etc. onto wrapper
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} took {elapsed:.2f}s")
        return result
    return wrapper

@timed
def load_data(path):
    """Read every line of the file at path."""
    return open(path).readlines()

print(load_data.__name__)   # load_data
print(load_data.__doc__)    # Read every line of the file at path.
~~~

Rule: **every decorator you write gets \`@functools.wraps(func)\` on its wrapper.** No exceptions — it
costs one line and saves hours.

## Decorators with arguments: one more layer

Now the retry half of the puzzle. We want to write \`@retry(times=3)\` — but some functions might need
\`times=5\`. So the decorator needs a setting.

Look carefully at what \`@retry(times=3)\` means. The thing after \`@\` must be a decorator (a function
that takes a function). So \`retry(times=3)\` must *return* a decorator. That means \`retry\` is a
function that builds decorators — a **decorator factory**. Three layers, each with one job:

~~~python
def retry(times=3):                 # layer 1: takes the SETTINGS, returns a decorator
    def decorator(func):            # layer 2: takes the FUNCTION, returns a wrapper
        @functools.wraps(func)
        def wrapper(*args, **kwargs):   # layer 3: takes the CALL'S ARGUMENTS, does the work
            ...
        return wrapper
    return decorator
~~~

So \`@retry(times=3)\` above \`def fetch\` expands to \`fetch = retry(times=3)(fetch)\`: first call
\`retry(times=3)\` to get a decorator, then call that decorator on \`fetch\`. Every layer is a closure
over the one outside it — \`wrapper\` can see both \`func\` and \`times\`. The next example fills in the
body and runs it.
`,
    },
    {
      type: 'example',
      title: '@retry(times=3), built and traced against a flaky server',
      md: md`
We'll fake a flaky network call with a global counter, so the output is predictable: the first two
calls fail, the third succeeds.

~~~python
import functools

def retry(times=3):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return func(*args, **kwargs)       # success: return immediately
                except ConnectionError as e:
                    print(f"attempt {attempt} failed: {e}")
                    if attempt == times:
                        raise                          # out of attempts: let the error escape
        return wrapper
    return decorator


calls = 0

@retry(times=3)
def fetch(url):
    global calls
    calls += 1
    if calls < 3:
        raise ConnectionError("server busy")
    return f"data from {url}"


print(fetch("example.com"))
print(calls)
~~~

Output:

~~~python
attempt 1 failed: server busy
attempt 2 failed: server busy
data from example.com
3
~~~

Trace it:

| attempt | \`calls\` after | what \`func\` does | what \`wrapper\` does |
|---|---|---|---|
| 1 | 1 | raises \`ConnectionError\` | prints, 1 ≠ 3 so loops again |
| 2 | 2 | raises \`ConnectionError\` | prints, 2 ≠ 3 so loops again |
| 3 | 3 | returns \`"data from example.com"\` | \`return\` exits the loop with it |

If the server had failed three times, the third \`except\` would hit \`if attempt == times: raise\` and
the original \`ConnectionError\` would reach the caller — retries shouldn't *hide* a real outage, only
smooth over blips.

Three things to notice. \`fetch\`'s body contains zero retry code. Changing the policy to five tries is
editing one number at the decoration site. And the retry logic only catches \`ConnectionError\` — a
\`TypeError\` from a genuine bug is *not* retried, it fails immediately, which is exactly what you want.

**The original puzzle, solved:**

~~~python
@timed
def load_data(path): ...

@timed
def tokenize(rows): ...

@timed
@retry(times=3)
def fetch_labels(url): ...
~~~

Seventeen functions, and the timing and retry code each exist exactly once. Switching to milliseconds
is one edit inside \`timed\`. But that last function has *two* decorators stacked — which one runs
first?
`,
    },
    {
      type: 'ponder',
      question: md`Two decorators that announce themselves, stacked on one function. Predict the five lines
this prints, in order — and derive it, don't guess:

~~~python
def a(f):
    def wrapper_a(*args, **kwargs):
        print("a: before")
        result = f(*args, **kwargs)
        print("a: after")
        return result
    return wrapper_a

def b(f):
    def wrapper_b(*args, **kwargs):
        print("b: before")
        result = f(*args, **kwargs)
        print("b: after")
        return result
    return wrapper_b

@a
@b
def h():
    print("h runs")

h()
~~~`,
      answer: md`
~~~python
a: before
b: before
h runs
b: after
a: after
~~~

**Derivation.** Rewrite the \`@\` lines as assignments. Decorators apply from the bottom up — the one
nearest the \`def\` goes first:

~~~python
h = b(h)    # h is now wrapper_b, which remembers the original h
h = a(h)    # h is now wrapper_a, which remembers wrapper_b
~~~

So \`h = a(b(h))\`. The name \`h\` points at \`wrapper_a\` — **a's wrapper is outermost**. Calling \`h()\`
runs \`wrapper_a\`: it prints "a: before", then calls its \`f\`, which is \`wrapper_b\`: "b: before",
then *its* \`f\`, the original: "h runs". Then the calls return in reverse: "b: after", "a: after".

Think of it like layers of wrapping paper. \`b\` is wrapped on first, so it's the inner layer; \`a\` goes
on last, so it's the outside. Opening the parcel (calling) goes through \`a\` first; closing up
(returning) finishes with \`a\` last.

Notice the subtlety: **b is *applied* first, but a's wrapper *runs* first.** Both statements are true,
and mixing them up is where most wrong answers come from.

This matters in practice. In \`@timed @retry(times=3) def fetch_labels\`, \`timed\` is outermost, so it
measures the *total* time including all retries. Swap the order and \`timed\` would sit inside the retry
loop, printing a separate time for each attempt. Neither is wrong — but you should pick on purpose.
(You may also have noticed: without \`functools.wraps\`, \`h.__name__\` is now \`'wrapper_a'\`.)`,
    },
    {
      type: 'text',
      md: md`
## Keyword-only arguments: forcing clarity at the call site

While we're giving functions flexible signatures, one more tool. At a call like \`train(model, data, 0.001, 32, True)\`, nobody reading it can tell which number is the
learning rate and what \`True\` means. And if someone swaps the order of two parameters in the
definition, every such call silently does the wrong thing.

A bare \`*\` in the parameter list says: **everything after this must be passed by name.**

~~~python
def train(model, data, *, lr=0.001, batch_size=32, shuffle=True):
    return f"lr={lr} batch={batch_size} shuffle={shuffle}"

print(train("net", "ds", lr=0.01))           # lr=0.01 batch=32 shuffle=True
print(train("net", "ds", batch_size=64))     # lr=0.001 batch=64 shuffle=True

train("net", "ds", 0.01)
# TypeError: train() takes 2 positional arguments but 3 were given
~~~

The \`*\` here collects nothing — it's a marker. \`model\` and \`data\` may be positional; \`lr\`,
\`batch_size\`, \`shuffle\` must be named, so every call reads like documentation. You'll find this
pattern throughout libraries like scikit-learn and PyTorch, for exactly this reason.

The full order of a parameter list, if you ever need all of it:

~~~python
def f(a, b=2, *args, c, d=4, **kwargs):
    print(a, b, args, c, d, kwargs)

f(1, 20, 300, 301, c=3, e=5)
# 1 20 (300, 301) 3 4 {'e': 5}
~~~

Normal parameters, then \`*args\` (which also acts as the keyword-only marker — \`c\` and \`d\` after it
are keyword-only), then \`**kwargs\` last.

## The mutable default argument trap

Back in the late-binding fix, I asked you to remember one sentence: *default values are computed once,
when the function is created.* That sentence is the key to the most famous bug in Python — the
function-level twin of Py.1's shared-list trap.
`,
    },
    {
      type: 'ponder',
      question: md`A helper that adds an item to a bucket, creating a new bucket if you don't pass one.
Predict all three printed lines:

~~~python
def add(item, bucket=[]):
    bucket.append(item)
    return bucket

print(add("a"))
print(add("b"))
print(add("c"))
~~~`,
      answer: md`
~~~python
['a']
['a', 'b']
['a', 'b', 'c']
~~~

Not \`['a']\`, \`['b']\`, \`['c']\`. The "fresh bucket" is the same bucket every time.

**Why.** The line \`def add(item, bucket=[]):\` runs *once*, when Python creates the function. At that
moment it evaluates \`[]\` — building **one** list — and stores it on the function object as the
default. Every call that omits \`bucket\` gets *that same list*, and \`append\` mutates it. You can
see it sitting there:

~~~python
print(add.__defaults__)   # (['a', 'b', 'c'],)
~~~

**The Py.1 connection — same root cause.** In Py.1, \`history = []\` in the class body created one
list, stored on the class, shared by every instance. Here, \`bucket=[]\` in the \`def\` line creates one
list, stored on the function, shared by every call. Both times: *code that runs once* built a mutable
object, and everyone who came later mutated the one shared copy. And the fix is the same idea both
times — build the mutable thing in code that runs *every time* (\`__init__\` there, the function body
here):

~~~python
def add(item, bucket=None):
    if bucket is None:
        bucket = []           # runs on EVERY call that didn't pass a bucket
    bucket.append(item)
    return bucket

print(add("a"))   # ['a']
print(add("b"))   # ['b']
~~~

\`None\` is a safe default because it's immutable — nobody can \`append\` to it — and it clearly means
"not given." Rule: **never use a list, dict, or set as a default value.** Use \`None\` and create the
real thing inside.

(Now look back at the late-binding fix, \`lambda i=i: i\`. It *relied* on this exact behaviour —
defaults frozen at creation time. Same mechanism: a feature there, a trap here. The difference is
whether the frozen value is immutable, like an int, or mutable, like a list.)`,
    },
    {
      type: 'example',
      title: 'putting it all together: a call-logging decorator with a closure counter',
      md: md`
One realistic decorator that uses every idea in the lesson — a closure that remembers state,
\`*args\`/\`**kwargs\` pass-through, \`functools.wraps\`, a factory with a keyword-only setting, and a
\`None\` default done right:

~~~python
import functools

def logged(*, prefix="LOG", history=None):
    if history is None:
        history = []                        # fresh list per decoration, not shared

    def decorator(func):
        calls = 0                           # closure state, one per decorated function

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            nonlocal calls
            calls += 1
            result = func(*args, **kwargs)
            line = f"{prefix} #{calls} {func.__name__}{args} -> {result}"
            history.append(line)
            print(line)
            return result

        wrapper.history = history           # functions are objects: we can attach attributes!
        return wrapper
    return decorator


@logged(prefix="MATH")
def add(a, b):
    """Add two numbers."""
    return a + b

@logged()
def greet(name, punct="!"):
    return f"hi {name}{punct}"

add(2, 3)
add(10, 20)
greet("Ada")
greet("Alan", punct="?")

print(add.__name__, "|", add.__doc__)
print(len(add.history), len(greet.history))
~~~

Output:

~~~python
MATH #1 add(2, 3) -> 5
MATH #2 add(10, 20) -> 30
LOG #1 greet('Ada',) -> hi Ada!
LOG #2 greet('Alan',) -> hi Alan?
add | Add two numbers.
2 2
~~~

Two details in the fourth line. \`punct="?"\` was a keyword argument, so it landed in \`kwargs\`, not
\`args\` — that's why only \`('Alan',)\` is printed (a one-item tuple, hence the trailing comma). And
the counter says \`#2\`, not \`#3\` or \`#4\`: \`calls = 0\` runs once per *decorated function*, when
\`decorator(greet)\` runs, so \`greet\` has its own counter that both of its calls share.

| call | whose \`calls\` | value printed |
|---|---|---|
| \`add(2, 3)\` | add's | #1 |
| \`add(10, 20)\` | add's | #2 |
| \`greet("Ada")\` | greet's | #1 |
| \`greet("Alan", punct="?")\` | greet's | #2 |

The habit to build: with closures, always **ask "when was this variable created, and how many
times?"** \`calls = 0\` runs once per decorated function, so \`add\` and \`greet\` each get their own
counter, and each counter lives across all calls to that function. \`history\` is created once per
\`logged(...)\` call, so \`add\` and \`greet\` each get their own list too — thanks to the \`None\`
default. Had we written \`history=[]\` in the signature, both functions would have logged into the
*same* list and the last line would print \`4 4\`.

Also notice \`wrapper.history = history\`: since a function is an object, you can hang attributes on it,
just like \`self.x = ...\` on an instance.
`,
    },
    {
      type: 'text',
      md: md`
## The pattern, in one breath

Every idea here grew from one fact: **a function is a value.** Because it's a value, you can store it
(dispatch tables), pass it (\`key=\`), and return it. Because you can return one from inside another, it
can remember the outer variables (closures). Because it can remember a function it was given, it can
wrap that function in extra behaviour (decorators). Because the wrapper must accept any arguments, you
need \`*args\`/\`**kwargs\`. And the two famous traps — late binding and mutable defaults — are both
questions of *when* something is evaluated and *how many copies* exist.

You've now seen decorators from the inside, which demystifies code you already met: \`@property\`,
\`@classmethod\`, and \`@dataclass\` from Py.3–Py.4 are all just functions that take the thing below them
and return something new. (\`@dataclass\` takes a *class* rather than a function — same idea.) And
libraries you'll use soon are full of them. \`@torch.no_grad()\` has the same *call shape* as
\`@retry(times=3)\`: the parentheses run first and produce the decorator, which is then applied to
your function. (Under the hood PyTorch builds it with a class whose instances are callable, not three
nested functions, but from the outside the two work the same way.)

## What you now own

1. **Functions are values.** \`f\` is the function, \`f()\` calls it. Names and function objects are
   separate; you can rebind, store, pass, and return them.
2. **Dispatch tables** — a dict from names to functions replaces a growing \`if\`/\`elif\` chain.
3. **Higher-order functions and \`key=\`** — hand a function to \`sorted\`; compute the keys first,
   then sort the keys; tuples as keys break ties.
4. **\`lambda\`** for tiny throwaway functions passed straight into something — and \`def\` the moment
   it deserves a name.
5. **Closures** — an inner function remembers the outer function's variables; \`nonlocal\` to reassign
   them; each outer call makes fresh ones.
6. **Late binding** — closures remember variables, not values; freeze with \`i=i\` or a factory.
7. **Decorators, derived** — \`@d\` above \`def f\` is exactly \`f = d(f)\`; stacked \`@a @b\` is
   \`f = a(b(f))\`, so a's wrapper runs outermost.
8. **\`*args\`/\`**kwargs\`** to collect and \`*\`/\`**\` to unpack; the universal pass-through wrapper;
   always \`functools.wraps\`; decorator factories as one more layer.
9. **Keyword-only arguments** after a bare \`*\`, and the **mutable default trap** — defaults are
   evaluated once, the same root cause as Py.1's shared list — fixed with \`None\`.

Next: what happens when a function needs to produce a million values but you only have memory for one
at a time — iterators, generators, and \`yield\`.
`,
    },
  ],
  questions: [
    {
      id: 'py-l5-q1',
      kind: 'mcq',
      prompt: md`Which line is *exactly* equivalent to writing \`@timed\` directly above
\`def train(model): ...\`?`,
      options: [
        md`\`train = timed(train)\`, run once right after \`train\` is defined`,
        md`\`train = timed(train())\`, run once right after \`train\` is defined`,
        md`\`timed(train)\` is called automatically every time \`train\` is called`,
        md`\`timed\` is copied into the body of \`train\` at the top`,
      ],
      answer: 0,
      explain: md`The decorator runs **once**, at definition time, and rebinds the name:
\`train = timed(train)\`. Option B is the classic parentheses slip — \`train()\` would *call* train and
hand its return value to \`timed\`, not the function. Option C is tempting because the timing *does*
happen on every call — but that's \`wrapper\` running, not \`timed\`; \`timed\` itself ran only once,
to build the wrapper. Option D describes what you'd do by hand-pasting, which is precisely the chore
decorators replace.`,
    },
    {
      id: 'py-l5-q2',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
def make_counter():
    count = 0
    def counter():
        nonlocal count
        count += 1
        return count
    return counter

c = make_counter()
c()
c()
d = make_counter()
d()
print(c() + d())
~~~`,
      answer: 5,
      tolerance: 0,
      explain: md`\`c\` and \`d\` each come from a separate call to \`make_counter\`, so each has its own
\`count\`. \`c\` is called twice (count 2), \`d\` once (count 1). In the print, \`c()\` returns **3** and
\`d()\` returns **2**: total **5**. If you got 4 or 6, you probably let the two counters share one
\`count\` — they don't, because \`count = 0\` runs fresh on every \`make_counter()\` call.`,
    },
    {
      id: 'py-l5-q3',
      kind: 'mcq',
      prompt: md`You decorate \`def load_data(path)\` with a decorator whose wrapper does *not* use
\`functools.wraps\`. The program runs correctly. What actually goes wrong?`,
      options: [
        md`Nothing — \`functools.wraps\` only affects speed`,
        md`\`load_data(path)\` raises \`TypeError\` because the wrapper hides the \`path\` parameter`,
        md`\`load_data.__name__\` becomes \`'wrapper'\` and its docstring is lost, so tracebacks, logs, and \`help()\` show the wrong function`,
        md`The original \`load_data\` is garbage-collected, so it can only be called once`,
      ],
      answer: 2,
      explain: md`The name \`load_data\` now points at the wrapper function, which carries its own name and
no docstring. \`functools.wraps(func)\` copies the original's metadata onto the wrapper. Option B tempts
because *signatures* do matter — but a \`*args, **kwargs\` wrapper passes \`path\` through fine; wraps
isn't what fixes arguments. Option D misunderstands closures: the wrapper holds a reference to the
original, which keeps it alive forever. Option A is wrong because the damage is to *debuggability*,
which is worse than speed when you have twelve functions all named \`wrapper\`.`,
    },
    {
      id: 'py-l5-q4',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
def add(x, bucket=[]):
    bucket.append(x)
    return bucket

add(1)
add(2)
b = add(3, [])
add(4)
print(len(add(5)))
~~~`,
      answer: 4,
      tolerance: 0,
      explain: md`The default list is created once and shared by every call that omits \`bucket\`. It
receives 1, 2, 4, 5 — **4** items. The call \`add(3, [])\` passed its *own* fresh list, so 3 went there
instead and never touched the default. If you answered 1, you assumed a fresh default per call (the
trap); if you answered 5, you forgot that an explicit argument replaces the default entirely.`,
    },
    {
      id: 'py-l5-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, with no notes: (1) write a decorator \`count_calls\`
that works on a function of *any* signature, keeps the original's name, and lets you read how many
times it has been called via \`f.calls\`; (2) write a decorator *factory* \`repeat(n)\` so that
\`@repeat(3)\` makes the function run three times and return the last result; (3) for \`repeat\`,
rewrite \`@repeat(3)\` above \`def hello(): ...\` as the plain assignment it stands for, and label
which of your three nested functions receives the settings, which receives the function, and which
receives the call's arguments.`,
      rubric: md`**(1) count_calls:**

~~~python
import functools

def count_calls(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return func(*args, **kwargs)
    wrapper.calls = 0
    return wrapper

@count_calls
def add(a, b):
    return a + b

add(1, 2); add(3, 4)
print(add.calls, add.__name__)   # 2 add
~~~

(A \`nonlocal\` counter is also fine for counting, but then \`f.calls\` needs the attribute too —
attaching it to the function is the simplest way to make it readable from outside.)

**(2) repeat(n):**

~~~python
def repeat(n):                         # receives the SETTINGS
    def decorator(func):               # receives the FUNCTION
        @functools.wraps(func)
        def wrapper(*args, **kwargs):  # receives the CALL'S ARGUMENTS
            result = None
            for _ in range(n):
                result = func(*args, **kwargs)
            return result
        return wrapper
    return decorator
~~~

**(3)** \`hello = repeat(3)(hello)\` — call \`repeat(3)\` to get a decorator, then call that on \`hello\`.

**Must have:** \`*args, **kwargs\` in both wrappers and passed through; \`functools.wraps\`; the wrapper
**returns** the result; \`return wrapper\` / \`return decorator\` *without* parentheses; the three layers
correctly labelled. Common partial answers: forgetting to return the result (every decorated function
returns \`None\`), or writing \`return wrapper()\` (calls it at decoration time).`,
    },
    {
      id: 'py-l5-q6',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
def add_one(f):
    def wrapper(*args, **kwargs):
        return f(*args, **kwargs) + 1
    return wrapper

def double(f):
    def wrapper(*args, **kwargs):
        return f(*args, **kwargs) * 2
    return wrapper

@add_one
@double
def g(x):
    return x

print(g(5))
~~~`,
      answer: 11,
      tolerance: 0,
      explain: md`Rewrite the decorators: \`g = add_one(double(g))\`. \`add_one\`'s wrapper is outermost, so
it calls \`double\`'s wrapper, which calls the original: 5, doubled to **10**, then plus one: **11**. The
tempting wrong answer is 12 — reading the decorators top to bottom as "first add one (6), then double
(12)". The decorator nearest the \`def\` is applied first and so its effect happens *closest* to the
original function.`,
    },
    {
      id: 'py-l5-q7',
      kind: 'mcq',
      prompt: md`What does this print?

~~~python
fs = [lambda: i * 10 for i in range(4)]
print([f() for f in fs])
~~~`,
      options: [
        md`\`[0, 10, 20, 30]\``,
        md`\`[30, 30, 30, 30]\``,
        md`\`[0, 0, 0, 0]\``,
        md`\`NameError\`, because \`i\` no longer exists after the loop`,
      ],
      answer: 1,
      explain: md`Each lambda closes over the one variable \`i\` and looks it up only when *called* — late
binding. By then the comprehension has finished with \`i\` at 3, so every lambda returns 30. Option A is
what the code *looks like* it should do (and what \`lambda i=i: i * 10\` would give). Option C assumes
the lambdas froze the first value. Option D is a sharp guess — the comprehension's \`i\` isn't visible
from outside — but the closures still hold a live reference to it, so it doesn't disappear.`,
    },
    {
      id: 'py-l5-q8',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
words = ["banana", "kiwi", "apple", "fig", "cherry"]
result = sorted(words, key=len)
print(result.index("banana"))
~~~`,
      answer: 3,
      tolerance: 0,
      explain: md`Compute the keys first: banana 6, kiwi 4, apple 5, fig 3, cherry 6. Sorted by length:
fig (3), kiwi (4), apple (5), then the two 6s. Python's sort is **stable** — items with equal keys keep
their original order — so banana (which came first in the input) stays ahead of cherry. Result:
\`['fig', 'kiwi', 'apple', 'banana', 'cherry']\`, and banana is at index **3**. If you said 4, you
probably ordered the tie alphabetically or at random; stability is guaranteed and worth relying on.`,
    },
    {
      id: 'py-l5-q9',
      kind: 'mcq',
      prompt: md`Given \`def f(a, *, b=2): return a + b\`, which call raises a \`TypeError\`?`,
      options: [
        md`\`f(1)\``,
        md`\`f(1, b=3)\``,
        md`\`f(1, 3)\``,
        md`\`f(a=1, b=3)\``,
      ],
      answer: 2,
      explain: md`The bare \`*\` makes \`b\` keyword-only, so the 3 in \`f(1, 3)\` has nowhere to go:
"f() takes 1 positional argument but 2 were given." Option A tempts people who think \`*\` makes \`b\`
required — it doesn't, \`b\` still has its default. Option D tempts because \`a\` is before the \`*\` — but
parameters before the \`*\` can be passed *either* way, positionally or by name.`,
    },
    {
      id: 'py-l5-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid who has written a few Python functions asks: "What's a
decorator? Why would I want a function that changes another function?" Explain using an analogy you
invent, then show the smallest code example you can (a decorator that prints "starting!" before a
function runs), and explain what the \`@\` line secretly means. No jargon without a kid-level
explanation first.`,
      rubric: md`Grade the teaching:

1. **An analogy that captures *wrapping without changing the inside*.** E.g. a gift: you don't change
   the toy, you put wrapping paper around it, and whoever opens it gets the paper first, then the toy.
   Or a phone case: the phone works the same, but now it also has a stand. The key idea the kid must
   get: the original function is untouched, and something extra happens around it.
2. **Why bother:** if you want the same extra thing (a timer, a "starting!" message) on twenty
   functions, you write it once and wrap each one, instead of copying the same lines twenty times.
3. **Minimal code:**

~~~python
def announce(func):
    def wrapper():
        print("starting!")
        return func()
    return wrapper

@announce
def jump():
    print("jump!")

jump()
# starting!
# jump!
~~~

4. **The \`@\` line demystified:** \`@announce\` is shorthand for \`jump = announce(jump)\` — "put the
   wrapping paper on \`jump\`, and from now on, the name jump means the wrapped version."
5. **Jargon audit:** "higher-order function," "closure," "callable," "wrapper," "\`*args\`" used without
   a kid-level translation first = partial at best. Saying "a decorator modifies the function" without
   clarifying that the original is *not* edited is also partial — it's the one misconception to avoid.`,
    },
    {
      id: 'py-l5-q11',
      kind: 'written',
      prompt: md`**Connect the traps.** Explain why these two bugs are "the same bug," naming the exact
moment the shared object is created in each. Then fix both.

~~~python
# Bug A (from Py.1)
class Team:
    members = []
    def join(self, name):
        self.members.append(name)

# Bug B (from this lesson)
def join(name, members=[]):
    members.append(name)
    return members
~~~`,
      rubric: md`**The shared root cause:** in both, a mutable list is created by code that runs **once**, and
then every later use mutates that single list.

- **Bug A:** \`members = []\` runs once, when the \`class\` body executes at definition time. The list
  is stored on the class; \`self.members\` finds it through the class (instance lookup falls back to the
  class), and \`.append\` mutates the shared copy. Every team has the same members.
- **Bug B:** \`members=[]\` in the \`def\` line is evaluated once, when the function is created. The list
  is stored in \`join.__defaults__\`; every call that omits \`members\` gets it, and \`.append\` mutates
  the shared copy. Every "new" list accumulates everything ever added.

**Fixes — move the creation into code that runs every time:**

~~~python
class Team:
    def __init__(self):
        self.members = []          # runs once per team

    def join(self, name):
        self.members.append(name)


def join(name, members=None):
    if members is None:
        members = []               # runs once per call
    members.append(name)
    return members
~~~

**Full credit:** names *definition time* as the moment in both; explains that mutation (\`append\`)
touches the shared object rather than creating a new one; both fixes correct, with \`is None\`
(not \`if not members\`, which would also wrongly replace a caller's *empty* list they passed on
purpose). Bonus insight: \`lambda i=i: i\` relies on the very same "evaluated once" rule — harmless there
because an int can't be mutated.`,
    },
    {
      id: 'py-l5-q12',
      kind: 'written',
      prompt: md`**Find the bugs.** This timing decorator has four separate bugs. For each, say what
actually goes wrong when the code runs (be specific — which error, or what wrong behaviour), then write
the corrected decorator.

~~~python
import time

def timed(func):
    def wrapper():
        start = time.perf_counter()
        func()
        print(f"{func.__name__} took {time.perf_counter() - start:.2f}s")
    return wrapper()

@timed
def add(a, b):
    return a + b

print(add(2, 3))
~~~`,
      rubric: md`**Bug 1 — \`return wrapper()\` calls the wrapper at decoration time.** The decorator should
return the function object, \`return wrapper\`. As written, the \`@timed\` line immediately runs
\`wrapper()\`, which calls \`func()\` = \`add()\` with no arguments — crashing with
\`TypeError: add() missing 2 required positional arguments: 'a' and 'b'\` before \`print\` is ever
reached. (Even if it didn't crash, \`add\` would be bound to \`wrapper()\`'s return value, \`None\`,
and \`add(2, 3)\` would raise "'NoneType' object is not callable".)

**Bug 2 — the wrapper takes no arguments.** \`add(2, 3)\` would call \`wrapper(2, 3)\`, which accepts
none: \`TypeError: wrapper() takes 0 positional arguments but 2 were given\`. *Fix:*
\`def wrapper(*args, **kwargs)\` and \`func(*args, **kwargs)\`.

**Bug 3 — the result is thrown away.** \`func()\` is called but its value is never returned, so every
decorated function returns \`None\` — \`print(add(2, 3))\` would print \`None\`, not 5. *Fix:*
\`result = func(...)\` and \`return result\`.

**Bug 4 — no \`functools.wraps\`.** \`add.__name__\` becomes \`'wrapper'\` and the docstring is lost.
Silent, but it corrupts tracebacks and logs across every decorated function.

**Corrected:**

~~~python
import functools
import time

def timed(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        print(f"{func.__name__} took {time.perf_counter() - start:.2f}s")
        return result
    return wrapper

@timed
def add(a, b):
    return a + b

print(add(2, 3))
# add took 0.00s
# 5
~~~

Full credit = all four bugs, each with its *actual* consequence, and working code. Noticing that Bug 1
crashes at *decoration* time (before any call) shows you understand that a decorator runs once, when
the \`def\` executes — the central idea of the lesson.`,
    },
  ],
}
