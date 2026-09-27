// Python Foundations, Lesson 3 — The data model (dunder methods and dataclasses)
//
// Content uses the `md` tag from ../md.js: it behaves like String.raw, and an escaped
// backtick \` becomes a real backtick. Code blocks use ~~~python fences (no escaping).
// NEVER write the sequence dollar-brace inside content (JS interpolation).

import { md } from '../md.js'

export default {
  id: 'py-l3',
  title: 'Py.3 The data model — making your objects behave like built-ins',
  subtitle:
    'Your classes work, but they feel second-class: == says two identical objects differ, + crashes, len() and for-loops refuse them, and sorting blows up. This lesson discovers the hooks Python uses for its own types, plugs your classes into them, and then lets @dataclass write most of that code for you.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

After Py.1 and Py.2 you can write a perfectly respectable class. Here's one for a 2D vector — the kind
of thing you'd use for a position in a game, or a direction in a physics simulation:

~~~python
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

a = Vector(1, 2)
b = Vector(1, 2)
print(a == b)      # False   <- what? same x, same y!
print(a + b)       # TypeError: unsupported operand type(s) for +: 'Vector' and 'Vector'
~~~

And here's a playlist, which is obviously "a bunch of songs":

~~~python
class Playlist:
    def __init__(self, name):
        self.name = name
        self.songs = []

    def add(self, song):
        self.songs.append(song)

p = Playlist("Road trip")
p.add("Hey Jude")
p.add("Africa")

len(p)             # TypeError: object of type 'Playlist' has no len()
for song in p:     # TypeError: 'Playlist' object is not iterable
    print(song)
"Africa" in p      # TypeError: argument of type 'Playlist' is not iterable
~~~

And a price class, where you'd like to sort a list of prices:

~~~python
class Money:
    def __init__(self, cents):
        self.cents = cents

prices = [Money(500), Money(199), Money(1250)]
sorted(prices)     # TypeError: '<' not supported between instances of 'Money' and 'Money'
~~~

Five failures. Now look at what the **built-in** types do with exactly the same operations:

~~~python
print([1, 2] == [1, 2])        # True
print(3 + 4)                   # 7
print("ab" + "cd")             # abcd
print(len("hello"))            # 5
for ch in "hi":
    print(ch)                  # h, then i
print(2 in [1, 2, 3])          # True
print(sorted([5.0, 1.99, 12.5]))  # [1.99, 5.0, 12.5]
~~~

Lists, strings and numbers are *also* just classes (\`type(3)\` is \`<class 'int'>\`). So they must be
doing something your classes aren't. What?

## Deriving the answer: \`+\` is a method call

Try this in a Python shell — it looks strange, but it's completely legal:

~~~python
print((3).__add__(4))          # 7
print("ab".__add__("cd"))      # abcd
print([1, 2].__eq__([1, 2]))   # True
print("hello".__len__())       # 5
~~~

The \`int\` class has a method called \`__add__\`, and it does addition. The \`str\` class has its own
\`__add__\`, and it does joining. So when you write \`3 + 4\`, Python doesn't have a special "plus"
built into the language for every type. It **translates** the operator into a method call:

~~~python
a + b         # Python rewrites this as:  type(a).__add__(a, b)
a == b        # ...                        type(a).__eq__(a, b)
len(a)        # ...                        type(a).__len__(a)
~~~

This is the *same move* as Py.1's \`self\` derivation. There, \`alice.deposit(50)\` turned out to be
\`Account.deposit(alice, 50)\`. Here, \`a + b\` turns out to be \`Vector.__add__(a, b)\` — which means
\`a\` arrives as \`self\` and \`b\` arrives as the other argument. There's no magic, just a lookup table
of "when you see this syntax, call that method."

Methods with names like \`__add__\` are called **dunder methods** ("dunder" = **d**ouble
**under**score, so \`__add__\` is read aloud as "dunder add"). You never call them yourself in normal
code; you define them, and Python calls them *for you* when someone uses \`+\`, \`==\`, \`len()\`, a
\`for\` loop, and so on. Think of them as **hooks**: sockets that Python's syntax plugs into. The full
list of hooks is called Python's **data model**, which is where this lesson gets its name.

So the fix for the puzzle is: define the right hooks. Let's add them one at a time, each motivated by
one of the five failures.

## \`__repr__\` and \`__str__\`: who is the text for?

You met \`__repr__\` in Py.1. There's a sibling, \`__str__\`, and the difference is about *audience*:

- \`__repr__\` is for **programmers**. It should be unambiguous — ideally it looks like the code that
  would rebuild the object. It's what you see in the shell, in error messages, and inside lists.
- \`__str__\` is for **end users**. It should be pleasant to read. It's what \`print()\` and \`str()\`
  use.

~~~python
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __repr__(self):
        return f"Money({self.cents})"

    def __str__(self):
        return f"EUR {self.cents // 100}.{self.cents % 100:02d}"


m = Money(1250)
print(m)            # EUR 12.50      <- print uses __str__
print(repr(m))      # Money(1250)    <- repr() uses __repr__
print([m, Money(5)])  # [Money(1250), Money(5)]   <- lists show their items' __repr__
print(f"Total: {m}")  # Total: EUR 12.50
~~~

Notice the third line: a list printing its contents uses each item's \`__repr__\`, not \`__str__\`. A
list is showing you *data*, so it asks for the programmer's view.

The rule of thumb: **always write \`__repr__\`; write \`__str__\` only when users need a different,
friendlier view.** If you define only \`__repr__\`, Python uses it for \`print()\` too — so one method
covers both. (The reverse is not true: define only \`__str__\` and lists will still show the ugly
\`<__main__.Money object at 0x...>\`.)

## \`__eq__\`: what does "equal" even mean?

Back to the first failure: \`Vector(1, 2) == Vector(1, 2)\` was \`False\`. Without an \`__eq__\` of your
own, Python falls back to the only sensible default it has: two objects are equal **only if they are
the same object**. It has no idea that *your* notion of "equal" is "same x and same y" — you have to
tell it:

~~~python
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __eq__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        return self.x == other.x and self.y == other.y

    def __repr__(self):
        return f"Vector({self.x}, {self.y})"


print(Vector(1, 2) == Vector(1, 2))   # True
print(Vector(1, 2) == Vector(2, 1))   # False
print(Vector(1, 2) != Vector(2, 1))   # True   <- != comes free: Python flips __eq__
print(Vector(1, 2) == "hello")        # False
~~~

Two details you'll see in every good \`__eq__\`:

1. \`isinstance(other, Vector)\` checks that the other thing is a vector at all. Without it,
   \`Vector(1, 2) == "hello"\` would try to read \`"hello".x\` and crash with \`AttributeError\`.
2. \`NotImplemented\` (a special built-in value — not an error) means "I don't know how to compare with
   that; ask the other side." If neither side knows, Python falls back to "same object?" and gives
   \`False\`. That's why the last line prints \`False\` rather than crashing.

Now "equal" means *same value*. But the old meaning — *same object* — didn't go away. It has its own
operator: \`is\`. \`a == b\` asks "do these have the same value?" (it calls \`__eq__\`); \`a is b\` asks
"are these literally one object in memory?" (you can't override it). Two photocopies of a page are
\`==\`; only the page itself \`is\` the page.

Defining \`__eq__\` has a surprising side effect, though. Predict it before reading on.
`,
    },
    {
      type: 'ponder',
      question: md`Here's the \`Money\` class with a sensible \`__eq__\` and nothing else special. You
want the set of *distinct* prices in a shop. Predict what happens on the last line:

~~~python
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __eq__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return self.cents == other.cents

prices = [Money(500), Money(199), Money(500)]
distinct = set(prices)
~~~

Hint: before you added \`__eq__\`, \`set(prices)\` worked fine (it gave three items, since no two
objects were "equal").`,
      answer: md`It crashes:

~~~python
TypeError: cannot use 'Money' as a set element (unhashable type: 'Money')
~~~

(Older Pythons say just \`TypeError: unhashable type: 'Money'\`.) Defining \`__eq__\` **switched off**
the ability to put \`Money\` in a set or use it as a dict key. To see why, you need to know how sets
work.

A set doesn't compare your new item against every item already inside — that would be slow for a
million items. Instead it computes a **hash**: a whole number calculated from the object (via its
\`__hash__\` method), used like a locker number. Items only get compared with \`==\` if they land in the
same locker. So a set relies on one promise:

> **If \`a == b\`, then \`hash(a) == hash(b)\`.** Equal objects must get the same locker number.

The default \`__hash__\` is based on the object's identity (roughly, its address in memory). That was
consistent with the default \`__eq__\` ("equal only if same object"). But the moment you redefine
\`==\` to mean "same cents", two different objects \`Money(500)\` and \`Money(500)\` become equal — while
the identity-based hash would still put them in **different** lockers. The set would never compare
them, and you'd get "duplicates" in a set, which is precisely the one thing a set exists to prevent.

Rather than let that bug happen silently, Python plays safe: **a class that defines \`__eq__\` without
\`__hash__\` gets \`__hash__ = None\`**, meaning "not hashable." The crash is Python refusing to break the
promise on your behalf. The fix is to supply a hash computed from the *same fields* \`__eq__\` compares
— next section.`,
    },
    {
      type: 'text',
      md: md`
## \`__hash__\`: keeping the promise

The easy, correct recipe: put the fields that \`__eq__\` compares into a tuple, and hash the tuple.
Tuples of hashable things are hashable, and equal tuples always have equal hashes — so the promise
comes for free.

~~~python
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __eq__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return self.cents == other.cents

    def __hash__(self):
        return hash((self.cents,))      # same field(s) as __eq__

    def __repr__(self):
        return f"Money({self.cents})"


prices = [Money(500), Money(199), Money(500)]
print(set(prices))          # {Money(500), Money(199)}   (order may vary)
print(len(set(prices)))     # 2
stock = {Money(500): "mug"}
print(stock[Money(500)])    # mug   <- a *different* but equal object finds the key
~~~

One serious warning. A hash is a locker number, and a set stores your object in that locker *once*,
when it's added. If you later change \`cents\`, the object is now sitting in the wrong locker and the
set can't find it any more. So **only make objects hashable if the fields you hash never change after
creation.** Money that never changes is a fine thing to hash; a shopping cart that fills up over time
is not. Hold that thought — \`@dataclass(frozen=True)\` at the end of this lesson is built for exactly
this.

## \`__lt__\` and \`functools.total_ordering\`: making things sortable

\`sorted()\` only ever asks one question of your items: "is this one less than that one?" — which is the
\`<\` operator, which is the hook \`__lt__\` ("less than"). Define it and sorting works:

~~~python
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __lt__(self, other):
        return self.cents < other.cents

    def __repr__(self):
        return f"Money({self.cents})"


prices = [Money(500), Money(199), Money(1250)]
print(sorted(prices))               # [Money(199), Money(500), Money(1250)]
print(max(prices))                  # Money(1250)
print(Money(199) < Money(500))      # True
print(Money(199) > Money(500))      # False  <- Python flips it: Money(500) < Money(199)
print(Money(199) <= Money(500))     # TypeError: '<=' not supported ...
~~~

\`>\` worked because Python is clever enough to turn \`a > b\` into \`b < a\`. But \`<=\` needs both "less
than" *and* "equal", which is a different hook (\`__le__\`), and we didn't write it. Writing all four
(\`__lt__\`, \`__le__\`, \`__gt__\`, \`__ge__\`) by hand is tedious and error-prone. The standard library has
a helper: give it \`__eq__\` plus **one** ordering method, and it writes the other three.

~~~python
from functools import total_ordering

@total_ordering
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __eq__(self, other):
        return self.cents == other.cents

    def __lt__(self, other):
        return self.cents < other.cents

    def __hash__(self):
        return hash((self.cents,))


print(Money(199) <= Money(500))    # True
print(Money(500) >= Money(500))    # True
~~~

The \`@total_ordering\` line above the class is a **decorator** — a function that takes your class,
adds things to it, and hands it back. You'll build your own decorators in a later lesson; for now, read
it as "please fill in the missing comparison methods." It derives, for example, \`a <= b\` as
\`a < b or a == b\` — exactly what you'd write yourself.
`,
    },
    {
      type: 'example',
      title: 'a Money class that behaves like a number',
      md: md`
Everything so far in one class, plus addition. Watch the design decision in \`__add__\`: it builds and
returns a **new** \`Money\`. It never changes \`self\` or \`other\`.

~~~python
from functools import total_ordering

@total_ordering
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __repr__(self):
        return f"Money({self.cents})"

    def __str__(self):
        return f"EUR {self.cents // 100}.{self.cents % 100:02d}"

    def __eq__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return self.cents == other.cents

    def __hash__(self):
        return hash((self.cents,))

    def __lt__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return self.cents < other.cents

    def __add__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return Money(self.cents + other.cents)     # a NEW object


coffee = Money(350)
cake = Money(425)
bill = coffee + cake

print(bill)                         # EUR 7.75
print(coffee)                       # EUR 3.50   <- unchanged by the +
print(sorted([cake, bill, coffee])) # [Money(350), Money(425), Money(775)]
print(len({coffee, Money(350), cake}))  # 2
print(coffee + cake == Money(775))  # True
print(coffee <= cake)               # True
~~~

Why must \`__add__\` return a new object? Because that's what \`+\` means everywhere else in Python.
After \`x = 3; y = x + 4\`, nobody expects \`x\` to have become 7. If your \`__add__\` did
\`self.cents += other.cents; return self\`, then \`bill = coffee + cake\` would silently change the price
of *coffee* to 7.75 — and since \`bill\` and \`coffee\` would be the same object, every later change to
one would show up in the other. Worse, a changing \`Money\` inside a set sits in the wrong hash locker.
**Operators produce new values; they don't mutate their inputs.** (Python has a separate hook,
\`__iadd__\`, for \`+=\` on genuinely mutable things like lists — but you rarely need it.)

A real-world gotcha: \`sum([coffee, cake])\` **fails** with
\`TypeError: unsupported operand type(s) for +: 'int' and 'Money'\`. \`sum\` starts from \`0\` and does
\`0 + coffee\`, and neither \`int\` nor \`Money\` knows how to add those. The fix is to give \`sum\` a
starting value of the right type: \`sum([coffee, cake], Money(0))\` gives \`Money(775)\`.
`,
    },
    {
      type: 'text',
      md: md`
## Containers: \`__len__\`, \`__getitem__\`, \`__iter__\`, \`__contains__\`

Now the playlist. We want it to behave like a list of songs, so we plug in the container hooks, one
per failure:

| you write | Python calls | hook name meaning |
|---|---|---|
| \`len(p)\` | \`p.__len__()\` | "how many items?" — must return a whole number |
| \`p[0]\`, \`p[1:3]\` | \`p.__getitem__(0)\`, \`p.__getitem__(slice(1, 3))\` | "give me the item at this position" |
| \`for s in p\` | \`p.__iter__()\` | "give me something that hands out items one by one" |
| \`"Africa" in p\` | \`p.__contains__("Africa")\` | "is this inside you?" — return True/False |

Start with the two most useful:

~~~python
class Playlist:
    def __init__(self, name):
        self.name = name
        self.songs = []

    def add(self, song):
        self.songs.append(song)

    def __len__(self):
        return len(self.songs)

    def __getitem__(self, index):
        return self.songs[index]         # just pass the request on to the list


p = Playlist("Road trip")
for title in ["Hey Jude", "Africa", "Dancing Queen", "Wonderwall"]:
    p.add(title)

print(len(p))       # 4
print(p[0])         # Hey Jude
print(p[-1])        # Wonderwall
print(p[1:3])       # ['Africa', 'Dancing Queen']
~~~

Slicing came for free. When you write \`p[1:3]\`, Python packages the \`1:3\` into a \`slice\` object and
passes *that* as \`index\`. Our method hands it straight to the real list, which already knows what a
slice means. This trick — storing a real list inside and forwarding requests to it — is called
**delegation**, and it's composition from Py.2 at work: the playlist *has* a list rather than *being*
one.

\`__len__\` has one bonus effect: an object with a length is treated as "falsy" when the length is 0.
So \`if p:\` now means "if the playlist has any songs" — just like \`if some_list:\`.

We didn't define \`__iter__\` or \`__contains__\`. Does \`for\` work anyway?
`,
    },
    {
      type: 'ponder',
      question: md`The \`Playlist\` above defines \`__len__\` and \`__getitem__\` — but **no** \`__iter__\`.
Predict the output of each line (or the error):

~~~python
for song in p:
    print(song)

print("Africa" in p)
print(list(p))
~~~`,
      answer: md`**All three work:**

~~~python
Hey Jude
Africa
Dancing Queen
Wonderwall
True
['Hey Jude', 'Africa', 'Dancing Queen', 'Wonderwall']
~~~

When a \`for\` loop meets an object with no \`__iter__\`, Python has an old fallback: if the object has
\`__getitem__\`, it calls \`p[0]\`, then \`p[1]\`, then \`p[2]\`, … and hands each result to the loop,
stopping the moment \`__getitem__\` raises \`IndexError\`. Our \`__getitem__\` forwards to a real list,
and \`self.songs[4]\` raises exactly \`IndexError: list index out of range\` — so the loop ends cleanly.
Written out by hand, the fallback is:

~~~python
i = 0
while True:
    try:
        song = p[i]          # p.__getitem__(i)
    except IndexError:
        break
    print(song)
    i += 1
~~~

\`in\` then falls back to *looping*: with no \`__contains__\`, Python runs through the items and checks
each with \`==\`. And \`list(p)\` just loops and collects.

Notice that \`__len__\` played **no part** in any of this — the loop never asks for the length, it only
waits for \`IndexError\`. One consequence: if your \`__getitem__\` never raises \`IndexError\` (say it
returns \`None\` for positions that don't exist), \`for song in p\` becomes an **infinite loop**.`,
    },
    {
      type: 'text',
      md: md`
## \`__iter__\` and \`__contains__\`: doing it on purpose

The \`__getitem__\` fallback is handy, but it only makes sense when your object has positions 0, 1, 2…
Many collections don't: a bag of unique tags, a graph's nodes, the lines of a file. For those you write
\`__iter__\` directly. The easiest version returns an iterator you already have — the one from the
inner list:

~~~python
class Tags:
    def __init__(self, *names):
        self._names = set(names)          # a set: no positions, no p[0]

    def __len__(self):
        return len(self._names)

    def __iter__(self):
        return iter(sorted(self._names))  # hand out tags in alphabetical order

    def __contains__(self, name):
        return name.lower() in self._names


t = Tags("python", "ml", "data")
print(len(t))            # 3
for tag in t:
    print(tag)           # data, ml, python  (one per line)
print("ML" in t)         # True   <- our __contains__ ignores case
print(list(t))           # ['data', 'ml', 'python']
~~~

\`iter(something)\` is the built-in that asks "give me a thing that hands out your items one at a
time" — for a list or a sorted list, Python already has one. (Writing iterators from scratch, and the
\`yield\` keyword that makes it easy, is its own later lesson.)

And \`__contains__\` did two jobs. It made \`in\` **fast** — a set can answer "is it in?" instantly,
without looping over everything — and it let us **change the meaning**: case-insensitive membership.
Without it, \`in\` would fall back to looping via \`__iter__\` and comparing with \`==\`, so \`"ML" in t\`
would be \`False\`.

Here's the complete lookup order Python uses for \`x in obj\`: \`__contains__\` if defined; otherwise
loop via \`__iter__\`; otherwise loop via \`__getitem__\` from index 0; otherwise \`TypeError\`.
`,
    },
    {
      type: 'example',
      title: 'Vector: arithmetic, equality, length and unpacking in one class',
      md: md`
Back to the vector from the puzzle, now fully plugged in. Every one of the original failures is gone.

~~~python
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):
        return f"Vector({self.x}, {self.y})"

    def __eq__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __sub__(self, other):
        return Vector(self.x - other.x, self.y - other.y)

    def __mul__(self, k):                  # vector * number
        return Vector(self.x * k, self.y * k)

    def __len__(self):
        return 2                           # a 2D vector has two components

    def __getitem__(self, i):
        return (self.x, self.y)[i]


a = Vector(1, 2)
b = Vector(3, 4)
print(a + b)              # Vector(4, 6)
print(b - a)              # Vector(2, 2)
print(a * 3)              # Vector(3, 6)
print(a + b == Vector(4, 6))  # True
print(len(a))             # 2
x, y = b                  # unpacking loops via __getitem__!
print(x, y)               # 3 4
print(list(a + b * 2))    # [7, 10]
print(len({a, Vector(1, 2), b}))  # 2
~~~

Trace the trickiest line, \`a + b * 2\`. Python's normal precedence still applies (multiplication
first), so it becomes \`a.__add__(b.__mul__(2))\` = \`a.__add__(Vector(6, 8))\` = \`Vector(1 + 6, 2 + 8)\`
= \`Vector(7, 10)\`. Then \`list(...)\` loops through it with \`__getitem__\`, giving \`[7, 10]\`.

And \`x, y = b\` — **unpacking** — is just another loop in disguise: Python iterates over \`b\` and
expects exactly two items. Because we defined \`__getitem__\` for a tuple of two, that works too.

Notice what \`2 * a\` (number first) would do: \`int.__mul__(2, a)\` returns \`NotImplemented\`, and
since we didn't define the "reflected" hook \`__rmul__\` ("multiply from the right"), it's a
\`TypeError\`. Adding \`__rmul__ = __mul__\` inside the class fixes it. Every operator has one of these
right-hand twins (\`__radd__\`, \`__rsub__\`, …) for exactly this situation.
`,
    },
    {
      type: 'text',
      md: md`
## The relief: \`@dataclass\`

Look back at how much of that \`Vector\` class was pure ceremony. The \`__init__\` copies arguments into
attributes. The \`__repr__\` lists the attributes. The \`__eq__\` compares the attributes. You'll write
those three for almost every class that mainly holds data, and every time you add a field you must
remember to update all three. That's Py.1's "rules drift from data" problem, in a new costume.

The standard library's \`dataclasses\` module writes them for you. Here is a product record, by hand:

~~~python
class Product:
    def __init__(self, name, price_cents, stock=0):
        self.name = name
        self.price_cents = price_cents
        self.stock = stock

    def __repr__(self):
        return (f"Product(name={self.name!r}, "
                f"price_cents={self.price_cents!r}, stock={self.stock!r})")

    def __eq__(self, other):
        if not isinstance(other, Product):
            return NotImplemented
        return ((self.name, self.price_cents, self.stock) ==
                (other.name, other.price_cents, other.stock))
~~~

Fifteen lines. The same class with a dataclass:

~~~python
from dataclasses import dataclass

@dataclass
class Product:
    name: str
    price_cents: int
    stock: int = 0


p = Product("mug", 899)
print(p)                             # Product(name='mug', price_cents=899, stock=0)
print(p == Product("mug", 899, 0))   # True
p.stock += 5
print(p.stock)                       # 5
~~~

Five lines, and it behaves identically. How does \`@dataclass\` know what the fields are? From the
lines like \`name: str\`. The part after the colon is a **type annotation** — a label saying what kind
of value belongs there. Python itself doesn't check it (\`Product(42, "oops")\` would run), but
\`@dataclass\` reads the *list* of annotated names, in order, and generates:

- \`__init__(self, name, price_cents, stock=0)\` — parameters in the order you wrote the fields,
- \`__repr__\` — showing every field, like the output above,
- \`__eq__\` — comparing all fields, in order, as a tuple.

A dataclass is still a normal class. You can add your own methods beside the fields exactly as before
— \`def total_value(self): return self.price_cents * self.stock\` — and they work as in Py.1.
`,
    },
    {
      type: 'ponder',
      question: md`Using the \`Product\` dataclass above, predict all three lines:

~~~python
a = Product("mug", 899)
b = Product("mug", 899)
c = a

print(a == b)
print(a is b)
print(a is c)
~~~`,
      answer: md`**True, False, True.**

- \`a == b\` is \`True\`: \`@dataclass\` wrote an \`__eq__\` that compares the fields as a tuple,
  \`("mug", 899, 0) == ("mug", 899, 0)\`. Same *value*.
- \`a is b\` is \`False\`: \`Product(...)\` was called twice, so two separate objects were built. Same
  value, different *identity*. \`is\` can't be overridden by any dunder method — it always asks "one
  object or two?"
- \`a is c\` is \`True\`: \`c = a\` didn't copy anything, it just attached a second name to the same
  object.

The difference matters the moment something is mutable. Try it:

~~~python
c.stock = 10
print(a.stock)    # 10  <- a and c are one object
print(b.stock)    # 0   <- b is a separate object
print(a == b)     # False now: their fields differ
~~~

Equality is a *question about values*, which can change over time; identity is a *fact about objects*,
which never changes. Rule of thumb: use \`==\` to compare values, and keep \`is\` for checking against
unique singletons like \`None\` (\`if x is None:\`).`,
    },
    {
      type: 'text',
      md: md`
## Dataclass options: the settings that fix real bugs

The plain \`@dataclass\` is only the start. Its options each close a specific hole.

**Default values** work like default arguments, with one rule: fields with defaults must come after
fields without (just as in \`def f(a, b=0)\`).

**Mutable defaults — the Py.1 trap, caught automatically.** Remember the shared-list bug: a list in the
class body was shared by every instance. A dataclass field with a default *looks* like it's in the class
body, so this would recreate exactly that bug:

~~~python
from dataclasses import dataclass, field

@dataclass
class Cart:
    owner: str
    items: list = []
# ValueError: mutable default <class 'list'> for field items is not allowed: use default_factory
~~~

Python **refuses to create the class**. The dataclass authors knew about the Py.1 trap and made the
buggy version impossible to write. The fix is \`field(default_factory=list)\`: instead of one list
shared forever, give it a *factory* — a function to call once per new object to make a fresh default.
\`list\` itself is such a function (\`list()\` returns \`[]\`).

~~~python
@dataclass
class Cart:
    owner: str
    items: list = field(default_factory=list)   # a NEW list for every cart

a = Cart("Ana")
b = Cart("Ben")
a.items.append("apple")
print(a.items, b.items)     # ['apple'] []   <- separate lists, bug gone
~~~

The same goes for dicts (\`field(default_factory=dict)\`) and sets.

**\`frozen=True\` — values that never change, and can therefore be hashed.** A plain dataclass defines
\`__eq__\`, so by the rule from the ponder it is **unhashable**: \`{Product("mug", 899)}\` raises
\`TypeError\`. Adding \`__hash__\` by hand would be dangerous because the fields can change. \`frozen=True\`
solves both problems at once: it makes assignment to fields an error, and *because* the fields can no
longer change, it safely generates \`__hash__\` too.

~~~python
@dataclass(frozen=True)
class Point:
    x: int
    y: int

p = Point(1, 2)
p.x = 5          # dataclasses.FrozenInstanceError: cannot assign to field 'x'

visited = {Point(0, 0), Point(1, 2), Point(0, 0)}
print(len(visited))      # 2
dist = {Point(0, 0): 0}  # usable as a dict key
~~~

To "change" a frozen object you build a new one — the same philosophy as \`__add__\` returning a new
value. (\`dataclasses.replace(p, x=5)\` builds a copy with one field changed.)

**\`order=True\` — sorting for free.** It generates \`__lt__\`, \`__le__\`, \`__gt__\`, \`__ge__\`, comparing
fields **as a tuple, in the order you declared them**. Field order is now meaningful: the first field
decides, and later fields only break ties.

**\`slots=True\` — typos become errors.** Py.1's break 3 was \`alice.balence = 200\` silently creating a
new attribute. Normally every object keeps its attributes in a flexible dictionary that accepts any new
name. \`slots=True\` replaces that with a fixed list of allowed names (the fields), so a misspelling has
nowhere to go:

~~~python
@dataclass(slots=True)
class Account:
    owner: str
    balance: int = 0

acct = Account("Alice", 100)
acct.balance = 120       # fine
acct.balence = 200       # AttributeError: 'Account' object has no attribute 'balence'
                         #   and no __dict__ for setting new attributes
~~~

As a bonus, slotted objects use less memory — noticeable when you have millions of them. (Needs Python
3.10 or newer.)

You can combine options: \`@dataclass(frozen=True, order=True, slots=True)\`.
`,
    },
    {
      type: 'example',
      title: 'a leaderboard built from dataclasses, traced',
      md: md`
Here's a realistic little program using every option, with each design choice explained.

~~~python
from dataclasses import dataclass, field

@dataclass(frozen=True, order=True)
class Score:
    points: int          # declared FIRST, so it decides the ordering
    player: str          # only breaks ties


@dataclass(slots=True)
class Leaderboard:
    game: str
    scores: list = field(default_factory=list)

    def record(self, player, points):
        self.scores.append(Score(points, player))

    def __len__(self):
        return len(self.scores)

    def top(self, n):
        return sorted(self.scores, reverse=True)[:n]

    def players(self):
        return {s.player for s in self.scores}


board = Leaderboard("Tetris")
board.record("ana", 900)
board.record("ben", 1200)
board.record("cy", 900)
board.record("ana", 900)

print(len(board))              # 4
print(board.top(2))            # [Score(points=1200, player='ben'), Score(points=900, player='cy')]
print(len(set(board.scores)))  # 3
print(sorted(board.players())) # ['ana', 'ben', 'cy']
print(Score(900, "ana") < Score(900, "cy"))  # True
~~~

Walk through the choices:

| choice | why |
|---|---|
| \`Score\` is \`frozen=True\` | a score, once achieved, never changes — and frozen makes it hashable, so \`set(board.scores)\` works |
| \`Score\` has \`order=True\` with \`points\` first | sorting compares \`(points, player)\` tuples, so higher points win and names only break ties |
| \`Leaderboard\` is *not* frozen | it grows over time; a mutable, unhashable container is correct here |
| \`field(default_factory=list)\` | each leaderboard gets its own list (Py.1's trap, prevented) |
| \`slots=True\` | \`board.gmae = "Chess"\` would raise instead of silently creating junk |

Trace \`top(2)\`: sorted *descending*, the tuples are \`(1200, 'ben')\`, \`(900, 'cy')\`, \`(900, 'ana')\`,
\`(900, 'ana')\` — among the 900s, \`'cy'\` beats \`'ana'\` alphabetically when reversed. The first two are
ben and cy. And the set has 3 items because ana's two 900-point scores are **equal** frozen
dataclasses, with equal hashes, so the set keeps one.
`,
    },
    {
      type: 'text',
      md: md`
## When to reach for which

- A class that is **mostly data** (a record, a config, a point, a row from a file): \`@dataclass\`. Add
  \`frozen=True\` if it's a value that shouldn't change, \`order=True\` if it needs sorting,
  \`slots=True\` to catch typos.
- A class whose **behaviour** is the point (an account enforcing rules, a network connection): a normal
  class, adding only the dunders that make sense. An \`Account\` that supports \`+\` is probably a bad
  idea; a \`Money\` that supports \`+\` is a good one.
- The test for any dunder: **would a reader guess what the operator does without looking it up?**
  \`vector_a + vector_b\` — yes. \`user + group\` — who knows? Use a named method instead.

## What you now own

1. **The data model idea:** syntax is translated into method calls. \`a + b\` is \`type(a).__add__(a, b)\`,
   the same move as \`alice.deposit(50)\` being \`Account.deposit(alice, 50)\`.
2. **\`__repr__\` vs \`__str__\`:** repr is for programmers (and lists, and the shell); str is for users
   (\`print\`). Always write repr.
3. **\`__eq__\` and \`is\`:** equality compares values and is yours to define; identity asks "same
   object?" and can't be changed. Return \`NotImplemented\` for types you don't understand.
4. **The hash promise:** equal objects must hash equal, so defining \`__eq__\` alone makes a class
   unhashable. Hash the same fields you compare — and only if they never change.
5. **Ordering:** \`__lt__\` is enough for \`sorted\`; \`@total_ordering\` fills in the rest.
6. **Containers:** \`__len__\`, \`__getitem__\` (which also gives slicing, looping and \`in\` via the
   fallback), \`__iter__\`, \`__contains__\`.
7. **Operators return new objects** instead of mutating their inputs.
8. **\`@dataclass\`** writes \`__init__\`, \`__repr__\`, \`__eq__\`; \`field(default_factory=...)\`
   prevents the shared-mutable trap; \`frozen\`, \`order\` and \`slots\` add hashing, sorting, and
   typo-proofing.

Next: your objects now *look* right from the outside — Py.4 makes them *stay* right on the inside, with
\`@property\` guarding attributes so that even \`acct.balance = -500\` can be refused.
`,
    },
  ],
  questions: [
    {
      id: 'py-l3-q1',
      kind: 'mcq',
      prompt: md`This class defines **only** \`__str__\`. What does the last line print?

~~~python
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __str__(self):
        return f"EUR {self.cents / 100:.2f}"

print([Money(250), Money(99)])
~~~`,
      options: [
        md`\`[EUR 2.50, EUR 0.99]\``,
        md`\`['EUR 2.50', 'EUR 0.99']\``,
        md`Something like \`[<__main__.Money object at 0x10f...>, <__main__.Money object at 0x10f...>]\``,
        md`A \`TypeError\`, because \`__repr__\` is missing`,
      ],
      answer: 2,
      explain: md`A list shows its items with their **\`__repr__\`**, and we didn't define one, so each item
falls back to the default \`<__main__.Money object at ...>\`. Option A is tempting because \`print\`
uses \`__str__\` — but \`print\` calls \`str()\` on the *list*, and the list then asks each item for its
repr. Option B imagines the strings being quoted, which would only happen if the items *were* strings.
Nothing crashes (D): missing dunders fall back to defaults. This is exactly why "always write
\`__repr__\`" is the rule — define only \`__repr__\` and both views work.`,
    },
    {
      id: 'py-l3-q2',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
class Queue:
    def __init__(self):
        self.people = []

    def join(self, name):
        if name not in self.people:
            self.people.append(name)

    def serve(self):
        return self.people.pop(0)

    def __len__(self):
        return len(self.people)

q = Queue()
for name in ["ana", "ben", "ana", "cy", "dee", "ben"]:
    q.join(name)
q.serve()
print(len(q) * 10 + len(q.people[0]))
~~~`,
      answer: 33,
      tolerance: 0,
      explain: md`\`join\` skips anyone already queued, so the second "ana" and second "ben" are ignored:
the queue is \`['ana', 'ben', 'cy', 'dee']\`. \`serve()\` removes "ana", leaving 3 people. \`len(q)\`
calls \`__len__\`, giving **3**, so \`3 * 10 = 30\`. The front of the queue is now "ben", which has 3
letters. Total **33**. If you got 50-something, you counted the duplicates; if you got 43, you forgot
the \`serve()\`.`,
    },
    {
      id: 'py-l3-q3',
      kind: 'mcq',
      prompt: md`You add an \`__eq__\` method (comparing \`name\` and \`email\`) to your \`User\` class, and
suddenly \`{user1, user2}\` raises \`TypeError: unhashable type: 'User'\`. Why did Python do this?`,
      options: [
        md`Because objects with custom methods can never be stored in sets`,
        md`Because sets require every item to also define \`__lt__\`, so the set can keep items sorted`,
        md`Because equal objects must have equal hashes; the default identity-based hash would break that promise for your new \`__eq__\`, so Python sets \`__hash__\` to \`None\` rather than let sets silently hold duplicates`,
        md`Because \`__eq__\` has a bug — a correct \`__eq__\` never affects hashing`,
      ],
      answer: 2,
      explain: md`Sets find items by hash first, then confirm with \`==\`. Two "equal" users with different
identity-based hashes would land in different buckets, and the set would keep both. Python disables
hashing to stop that silent bug. Option A overreaches: classes with plenty of methods are hashable, as
long as \`__eq__\` isn't redefined without \`__hash__\`. Option B confuses sets with sorted lists —
sets are unordered and never call \`<\`. Option D is the tempting one ("I must have done it wrong"),
but even a perfect \`__eq__\` triggers this; the fix is to add \`__hash__\` over the same fields (or use
\`@dataclass(frozen=True)\`).`,
    },
    {
      id: 'py-l3-q4',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __mul__(self, k):
        return Vector(self.x * k, self.y * k)

a = Vector(1, 2)
b = Vector(3, -4)
c = Vector(-2, 5)
v = a + b * 2 + c
print(v.x + v.y)
~~~`,
      answer: 4,
      tolerance: 0,
      explain: md`Precedence is unchanged by dunders: \`*\` before \`+\`. So \`b * 2\` = \`Vector(6, -8)\`, then
\`a + Vector(6, -8)\` = \`Vector(7, -6)\`, then \`+ c\` = \`Vector(5, -1)\`. Sum of components: \`5 + (-1)\` =
**4**. If you got 7, you did \`(a + b) * 2 + c\` — left to right, ignoring precedence. Python rewrites
the expression into \`a.__add__(b.__mul__(2)).__add__(c)\` using the *normal* operator rules.`,
    },
    {
      id: 'py-l3-q5',
      kind: 'mcq',
      prompt: md`What happens when Python reaches this code?

~~~python
from dataclasses import dataclass

@dataclass
class Team:
    name: str
    members: list = []
~~~`,
      options: [
        md`It works, but every \`Team\` shares one \`members\` list — the Py.1 trap`,
        md`It works, and \`@dataclass\` quietly gives each \`Team\` its own fresh list`,
        md`\`ValueError\` as soon as the class is defined, telling you to use \`default_factory\``,
        md`\`TypeError\` the first time you create a \`Team\` without passing \`members\``,
      ],
      answer: 2,
      explain: md`The dataclass machinery detects a mutable default (list, dict, set) and **refuses to build
the class**: \`ValueError: mutable default <class 'list'> for field members is not allowed: use
default_factory\`. Option A is what a *normal* class body would do — which is precisely the bug the
error exists to prevent. Option B is what you'd *wish* it did, but Python never silently changes the
meaning of your code; it makes you write \`field(default_factory=list)\` so the per-object list is
explicit. Option D gets the timing wrong: the check happens at class definition, before any \`Team\`
exists.`,
    },
    {
      id: 'py-l3-q6',
      kind: 'numeric',
      prompt: md`How many items are in \`seen\`?

~~~python
from dataclasses import dataclass

@dataclass(frozen=True)
class Move:
    row: int
    col: int
    player: str

seen = {
    Move(0, 0, "X"),
    Move(1, 1, "O"),
    Move(0, 0, "X"),
    Move(0, 0, "O"),
    Move(1, 1, "O"),
    Move(1, 0, "X"),
    Move(0, 1, "X"),
}
print(len(seen))
~~~`,
      answer: 5,
      tolerance: 0,
      explain: md`A frozen dataclass hashes and compares **all** fields as a tuple. The distinct tuples are
\`(0,0,X)\`, \`(1,1,O)\`, \`(0,0,O)\`, \`(1,0,X)\`, \`(0,1,X)\` — **5**. The repeats of \`(0,0,X)\` and
\`(1,1,O)\` collapse. The trap is \`Move(0, 0, "O")\`: same square as the first move, but a different
player, so a different value. And \`(1,0)\` vs \`(0,1)\` are different because tuple comparison is
position by position.`,
    },
    {
      id: 'py-l3-q7',
      kind: 'mcq',
      prompt: md`Given

~~~python
@dataclass(order=True)
class Task:
    title: str
    priority: int
~~~

what does \`sorted(tasks)\` sort by?`,
      options: [
        md`\`priority\`, because it's the only number, and sorting needs numbers`,
        md`\`title\` first (alphabetically), using \`priority\` only to break ties between equal titles`,
        md`Nothing — \`order=True\` needs you to also write \`__lt__\``,
        md`The order in which the tasks were created`,
      ],
      answer: 1,
      explain: md`\`order=True\` compares the fields **as a tuple in declaration order**: \`(title, priority)\`.
Strings sort alphabetically, so title wins. Option A is the natural guess — and a real bug people ship:
to sort by priority, declare \`priority\` first. Option C confuses \`order=True\` with
\`@total_ordering\` (which needs \`__eq__\` plus one method from you); \`order=True\` writes all four
itself. Option D describes Python's default for *nothing*: without comparison methods, \`sorted\`
raises \`TypeError\`.`,
    },
    {
      id: 'py-l3-q8',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
from dataclasses import dataclass

@dataclass(order=True)
class Player:
    name: str
    score: int

players = [
    Player("Mia", 50),
    Player("Zoe", 5),
    Player("Ann", 99),
    Player("Bob", 70),
]
ranked = sorted(players)
print(ranked.index(Player("Zoe", 5)))
~~~`,
      answer: 3,
      tolerance: 0,
      explain: md`\`order=True\` compares \`(name, score)\` tuples, so the sort is **alphabetical by name**:
Ann, Bob, Mia, Zoe. Zoe is at index **3**. If you answered 0, you sorted by score (Zoe's 5 is the
lowest) — the exact "first field decides" trap. And \`.index(Player("Zoe", 5))\` finds her even though
it's a brand-new object, because \`index\` uses \`==\`, which the dataclass defines by value.`,
    },
    {
      id: 'py-l3-q9',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, without \`@dataclass\` or \`@total_ordering\`:

(1) Write a \`Fraction\`-like class \`Ratio\` holding integers \`num\` and \`den\` (assume \`den > 0\`)
with \`__repr__\`, \`__eq__\` (so that \`Ratio(1, 2) == Ratio(2, 4)\` is \`True\`), a matching
\`__hash__\`, \`__add__\` returning a new \`Ratio\`, and \`__lt__\`.

(2) Using **only** \`__lt__\` and \`__eq__\`, write \`__le__\`, \`__gt__\` and \`__ge__\` yourself — i.e.
derive what \`@total_ordering\` generates.

(3) Explain why \`__hash__\` must not be \`hash((self.num, self.den))\` for this particular class.`,
      rubric: md`**Model answer:**

~~~python
from math import gcd

class Ratio:
    def __init__(self, num, den):
        self.num = num
        self.den = den

    def __repr__(self):
        return f"Ratio({self.num}, {self.den})"

    def _key(self):
        g = gcd(self.num, self.den)            # reduce: 2/4 -> 1/2
        return (self.num // g, self.den // g)

    def __eq__(self, other):
        if not isinstance(other, Ratio):
            return NotImplemented
        return self.num * other.den == other.num * self.den   # cross-multiply

    def __hash__(self):
        return hash(self._key())

    def __add__(self, other):
        return Ratio(self.num * other.den + other.num * self.den, self.den * other.den)

    def __lt__(self, other):
        return self.num * other.den < other.num * self.den    # safe since dens > 0

    def __le__(self, other):
        return self < other or self == other

    def __gt__(self, other):
        return other < self

    def __ge__(self, other):
        return not (self < other)


print(Ratio(1, 2) == Ratio(2, 4))          # True
print(len({Ratio(1, 2), Ratio(2, 4)}))     # 1
print(Ratio(1, 2) + Ratio(1, 3))           # Ratio(5, 6)
print(Ratio(2, 3) >= Ratio(4, 6))          # True
~~~

**(3)** \`Ratio(1, 2)\` and \`Ratio(2, 4)\` are *equal* but \`(1, 2)\` and \`(2, 4)\` hash differently —
breaking the promise "equal objects hash equal". The hash must use a form that is identical for all
equal values: the **reduced** fraction.

**Grading:** \`__add__\` must return a new object (no mutation of \`self\`); \`__eq__\` must treat
2/4 as 1/2; \`__gt__\` via \`other < self\` and \`__ge__\` via \`not (self < other)\` (or
\`self > other or self == other\`) are both fine. Full credit requires part (3) to name the hash
promise *and* the reduced-form fix. Hashing the raw \`(num, den)\` is the most common partial answer —
it looks natural and is subtly wrong.`,
    },
    {
      id: 'py-l3-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid who knows a little Python writes a \`Card\` class for a
card game, makes two "7 of hearts" cards, and asks: "Why does Python say they're not equal? And why
does \`3 + 4\` work but \`card1 + card2\` doesn't?" Explain what's going on and how "double underscore"
methods fix it. Use an analogy you invent.`,
      rubric: md`Grade the teaching:

1. **Why not equal** — Python doesn't know what *you* mean by "the same card". Unless told, it only
   calls two things the same if they're literally one object — like two printed copies of the same
   photo: identical-looking, but two pieces of paper. You can teach Python your own rule: "same number
   and same suit counts as equal."
2. **How \`+\` works** — a good analogy: every kind of thing carries its own instruction card (or
   recipe) for each symbol. When Python sees \`3 + 4\`, it looks at \`3\`'s instruction card for "+"
   and follows it. Numbers came with that card; your \`Card\` class didn't, so Python has nothing to
   follow and gives up.
3. **Double-underscore methods** — the instruction cards have special names with two underscores on
   each side, like \`__eq__\` for "is equal" and \`__add__\` for "+". You write them once in your class,
   and Python reads them automatically whenever someone uses \`==\` or \`+\`. You never call them
   yourself.
4. **Bonus:** points out that \`+\` for cards might not *mean* anything sensible — you only write the
   instructions if the symbol makes sense.

**Jargon audit:** "dunder", "hook", "operator overloading", "instance", "identity", "hash", or "data
model" used without a kid-level explanation first = partial credit at most. The kid should be able to
predict that adding an \`__eq__\` makes the two sevens equal.`,
    },
    {
      id: 'py-l3-q11',
      kind: 'written',
      prompt: md`**Find the bugs.** This class has **four** separate bugs. For each, say what goes wrong when
the code runs (be specific) and write the fix.

~~~python
class Inventory:
    def __init__(self):
        self.items = {}              # name -> quantity

    def __len__(self):
        return f"{len(self.items)} items"

    def __getitem__(self, name):
        return self.items.get(name)

    def __add__(self, other):
        for name, qty in other.items.items():
            self.items[name] = self.items.get(name, 0) + qty
        return self

    def __eq__(self, other):
        return self.items == other.items

    def __repr__(self):
        print(f"Inventory({self.items})")


a = Inventory()
b = Inventory()
b.items["apple"] = 3
total = a + b
print(len(total))
for item in a:
    print(item)
shelves = {a, b}
~~~`,
      rubric: md`**Bug 1 — \`__len__\` returns a string.** \`len(total)\` raises \`TypeError: 'str' object cannot
be interpreted as an integer\`. \`__len__\` must return a non-negative whole number. *Fix:*
\`return len(self.items)\`.

**Bug 2 — \`__add__\` mutates \`self\`.** \`total = a + b\` changes \`a\` and returns it, so \`total is a\`
and \`a\` now contains apples. Operators must build a **new** object. *Fix:*

~~~python
    def __add__(self, other):
        result = Inventory()
        for source in (self, other):
            for name, qty in source.items.items():
                result.items[name] = result.items.get(name, 0) + qty
        return result
~~~

**Bug 3 — \`__getitem__\` never raises \`IndexError\`.** With no \`__iter__\`, \`for item in a\` falls back to
\`a[0]\`, \`a[1]\`, … and \`.get\` returns \`None\` forever instead of raising — an **infinite loop**
printing \`None\`. (The keys are names, not positions, so the fallback is wrong anyway.) *Fix:* add
\`def __iter__(self): return iter(self.items)\`, and ideally \`return self.items[name]\` so a missing
name raises \`KeyError\`.

**Bug 4 — \`__repr__\` prints instead of returning.** It returns \`None\`, so \`repr(a)\` raises
\`TypeError: __repr__ returned non-string (type NoneType)\`. *Fix:* \`return f"Inventory({self.items!r})"\`.

**Also acceptable as a 4th/5th finding:** \`{a, b}\` raises \`TypeError\` (unhashable) because
\`__eq__\` was defined without \`__hash__\` — and adding \`__hash__\` would be *wrong* here since an
inventory changes, so the fix is "use a list, not a set". \`__eq__\` lacks the \`isinstance\` /
\`NotImplemented\` check, so \`a == 5\` crashes with \`AttributeError\`.

Full credit = four genuine bugs, each with its *actual* runtime failure (not just "it's wrong") and a
working fix. Spotting the infinite loop in bug 3 shows real understanding of the \`__getitem__\`
fallback.`,
    },
    {
      id: 'py-l3-q12',
      kind: 'written',
      prompt: md`**Design on paper.** A course-registration system needs:

- \`Student\`: a student ID (string) and a name. Two records with the same ID and name are the same
  student; you want to keep students in sets and use them as dict keys; they never change.
- \`Course\`: a code like "CS101", a capacity, and an enrolled list of students, which grows. Typos like
  \`course.capcity = 50\` must raise an error. \`len(course)\` should give the number enrolled, and
  \`student in course\` should work.
- A list of \`Course\` objects must be sortable by code.

Write both as dataclasses with the right options, plus an \`enroll(student)\` method that refuses when
full or already enrolled. For each option you chose, give a one-line justification.`,
      rubric: md`**Model answer:**

~~~python
from dataclasses import dataclass, field

@dataclass(frozen=True)
class Student:
    student_id: str
    name: str


@dataclass(order=True, slots=True)
class Course:
    code: str                                   # FIRST field: decides the sort
    capacity: int = field(compare=False)
    enrolled: list = field(default_factory=list, compare=False)

    def enroll(self, student):
        if student in self.enrolled:
            raise ValueError(f"{student.name} is already in {self.code}")
        if len(self.enrolled) >= self.capacity:
            raise ValueError(f"{self.code} is full")
        self.enrolled.append(student)

    def __len__(self):
        return len(self.enrolled)

    def __contains__(self, student):
        return student in self.enrolled


s = Student("s1", "Ana")
cs = Course("CS101", 2)
cs.enroll(s)
print(len(cs), s in cs)                # 1 True
print(s == Student("s1", "Ana"))       # True
print(len({s, Student("s1", "Ana")}))  # 1
~~~

**Justifications expected:**
- \`Student\` \`frozen=True\` — it never changes, and frozen gives the hash needed for sets/dict keys.
- \`Course\` **not** frozen — enrolment grows over time.
- \`field(default_factory=list)\` — each course gets its own list (a bare \`= []\` raises \`ValueError\`).
- \`order=True\` with \`code\` first — sorting compares fields in declaration order.
- \`slots=True\` — \`course.capcity = 50\` raises \`AttributeError\`.
- \`__len__\` and \`__contains__\` written by hand — dataclasses don't generate container hooks.

**Grading:** \`field(compare=False)\` on \`capacity\`/\`enrolled\` is a strong bonus (it makes sorting
depend *only* on the code) but not required, since codes are unique. Full credit requires frozen
Student, a non-frozen Course, \`default_factory\`, \`code\` declared first with \`order=True\`,
\`slots=True\`, and a correct \`enroll\`. Making \`Course\` frozen (so \`enroll\` can't work) or putting
\`capacity\` before \`code\` are the most common partial answers.`,
    },
  ],
}
