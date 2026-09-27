// Python Foundations, Lesson 1 — Classes (anchor lesson for the code modules)
//
// Content uses the `md` tag from ../md.js: it behaves like String.raw, and an escaped
// backtick \` becomes a real backtick. Code blocks use ~~~python fences (no escaping).
// NEVER write the sequence dollar-brace inside content (JS interpolation).

import { md } from '../md.js'

export default {
  id: 'py-l1',
  title: 'Py.1 Classes — bundling data with the rules that protect it',
  subtitle:
    'You already know variables, lists, dicts, and functions. This lesson starts from code you could write today, watches it break in three specific ways, and invents classes as the repair — so that by the end, "self" is obvious rather than magic.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Suppose you're writing a tiny banking app with what you already know: a dict for each account, and
some functions that work on it.

~~~python
def make_account(owner, balance=0):
    return {"owner": owner, "balance": balance, "history": []}

def deposit(account, amount):
    account["balance"] += amount
    account["history"].append(("deposit", amount))

def withdraw(account, amount):
    if amount > account["balance"]:
        raise ValueError("insufficient funds")
    account["balance"] -= amount
    account["history"].append(("withdraw", amount))

alice = make_account("Alice", 100)
deposit(alice, 50)
withdraw(alice, 30)
print(alice["balance"])   # 120
~~~

This works. Honestly, it's fine for fifty lines. Now watch it break as the program grows — three ways,
each of which happens in real codebases constantly:

**Break 1 — anyone can bypass the rules.** Six months later a colleague writes
\`alice["balance"] = -500\`. Nothing stops them. \`withdraw\` carefully refused to overdraw, but that
check only protects people who *choose* to go through \`withdraw\`. The data and the rules about the
data live in different places, so the rules are optional.

**Break 2 — the data drifts from the functions.** Someone adds \`transfer()\` and forgets to append to
\`history\`. Now the history is silently wrong. There is no single place that says "these are all the
operations allowed on an account, and every one of them keeps history consistent."

**Break 3 — typos become silent bugs.** \`alice["balence"] = 200\` doesn't raise an error. It quietly
creates a *new key*, and the real balance never changes.

Notice what all three have in common. The account is a *thing* with *data* (owner, balance, history)
and *rules* (you can't go negative; every change is recorded). But our code stores the data in one
place and the rules in another, with nothing tying them together.

**A class is exactly that tie.** It bundles the data with the only functions allowed to touch it.
Let's build one and see each break get fixed.

## Your first class

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.history = []

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self.balance += amount
        self.history.append(("deposit", amount))

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount
        self.history.append(("withdraw", amount))


alice = Account("Alice", 100)
alice.deposit(50)
alice.withdraw(30)
print(alice.balance)   # 120
~~~

Line by line, because every piece has a reason:

- \`class Account:\` — defines a *blueprint*. Nothing exists yet; you've described what an account
  *is*.
- \`__init__\` — runs automatically when you create an account. Its job is to set up the starting
  data. (The double underscores mark it as a name Python calls for you; you never call it directly.)
- \`self.owner = owner\` — stores data *on this particular account*. These are called **attributes**.
- \`def deposit(self, amount):\` — a function that lives inside the class. Functions defined in a class
  are called **methods**.
- \`alice = Account("Alice", 100)\` — builds one actual account from the blueprint. That account is an
  **object** (or **instance**). You can build as many as you like; each has its own data.

The one thing that confuses everybody is \`self\`. So let's not explain it — let's *derive* it.
`,
    },
    {
      type: 'ponder',
      question: md`Here's a line you already wrote: \`alice.deposit(50)\`. The method was defined as
\`def deposit(self, amount)\` — **two** parameters. You passed **one** argument. Where did the other
one come from? Before revealing, predict what this line does:

~~~python
Account.deposit(alice, 50)
~~~`,
      answer: md`It does **exactly the same thing** as \`alice.deposit(50)\`. Those two lines are
identical; the first is shorthand for the second.

When you write \`alice.deposit(50)\`, Python looks up \`deposit\` on alice's class and calls it with
\`alice\` slipped in as the first argument. So inside the method, \`self\` *is* \`alice\` — the
object you called the method on. Nothing more mysterious than that.

That's why the method can say \`self.balance += amount\` and change alice's balance, not bob's:

~~~python
alice = Account("Alice", 100)
bob = Account("Bob", 10)

alice.deposit(50)   # inside deposit, self is alice
bob.deposit(5)      # inside deposit, self is bob

print(alice.balance, bob.balance)   # 150 15
~~~

One function, many objects — and \`self\` is how the function knows which object it's working on
this time. The name "self" is just a convention (Python would accept any name), but every Python
programmer uses it, so you should too.`,
    },
    {
      type: 'text',
      md: md`
## Now check the three breaks

**Break 1 (bypassing the rules)** — mostly fixed, by *convention*. Everyone now calls
\`alice.withdraw(30)\` because that's the obvious interface, and the rule lives right there inside it.
Python doesn't physically prevent \`alice.balance = -500\` — it trusts programmers more than some
languages do — but lesson Py.4 shows how \`@property\` lets you enforce the rule even on direct
assignment when you need it.

**Break 2 (rules drifting from data)** — fixed. If someone adds a \`transfer\` method, they write it
*inside the class*, right next to \`deposit\` and \`withdraw\`, where the pattern of "always append to
history" is staring at them. The class is the one place that lists every operation an account supports.

**Break 3 (typos)** — improved. \`alice.balence\` (reading a misspelled attribute) now raises
\`AttributeError\` instead of silently returning nothing. Assigning to a typo still creates a new
attribute, which Py.3's \`@dataclass(slots=True)\` can catch too.

## Class vs instance: the cookie cutter

The blueprint and the things built from it are different objects, and it pays to keep them apart in
your head:

- **The class** \`Account\` is the cookie cutter. There's exactly one.
- **The instances** \`alice\` and \`bob\` are cookies. Each has its own dough — its own \`balance\`,
  its own \`history\`.

Data can live in either place. Data that lives on the *instance* (set with \`self.x = ...\` inside
methods) belongs to one object. Data that lives on the *class* (written directly in the class body)
is **shared by every instance**. That second kind is useful — and it contains the most famous bug in
beginner Python.
`,
    },
    {
      type: 'example',
      title: 'class attributes, used correctly',
      md: md`
A shared value that genuinely belongs to *all* accounts — like an interest rate, or a counter of how
many accounts exist:

~~~python
class Account:
    interest_rate = 0.02      # class attribute: shared by every account
    count = 0                 # class attribute: how many accounts exist

    def __init__(self, owner, balance=0):
        self.owner = owner    # instance attribute: this account only
        self.balance = balance
        Account.count += 1    # update the SHARED counter

    def add_interest(self):
        self.balance += self.balance * self.interest_rate


a = Account("Alice", 1000)
b = Account("Bob", 500)
print(Account.count)     # 2
a.add_interest()
print(a.balance)         # 1020.0
~~~

Two details worth noticing:

1. Inside \`add_interest\`, \`self.interest_rate\` finds the class attribute. Python looks on the
   instance first, doesn't find it, then looks on the class. That lookup order is the whole mechanism.
2. The counter is updated as \`Account.count += 1\`, **not** \`self.count += 1\`. The second version
   would read the shared value, add one, and then store the result as a *new instance attribute* on
   that one object — leaving the shared counter untouched. Assignment through \`self\` always writes
   to the instance.
`,
    },
    {
      type: 'ponder',
      question: md`Here is the famous bug. Someone "simplifies" the class by moving \`history\` out of
\`__init__\`, into the class body. Predict the last line's output before revealing:

~~~python
class Account:
    history = []                        # moved here to "save a line"

    def __init__(self, owner):
        self.owner = owner

    def deposit(self, amount):
        self.history.append(("deposit", amount))

alice = Account("Alice")
bob = Account("Bob")
alice.deposit(100)
bob.deposit(5)
print(len(alice.history))
~~~`,
      answer: md`It prints **2** — and alice's history contains *bob's* deposit.

\`history = []\` in the class body creates **one** list, owned by the class and shared by every
account. \`self.history.append(...)\` doesn't assign anything; it *reads* \`self.history\` (not on the
instance, so Python finds the class's list) and then mutates that one shared list. Every account is
writing into the same notebook.

Compare with the counter from the example, which *didn't* have this problem. The difference is
\`append\` versus \`=\`: \`self.count += 1\` rebinds a name (which creates a per-instance attribute),
while \`self.history.append(x)\` mutates an existing object in place (which touches the shared one).

**The rule that prevents this forever:** anything that should be separate per object — and
especially anything *mutable* like a list or dict — gets created inside \`__init__\` with
\`self.x = ...\`. The class body is only for values that are genuinely shared and that you don't
mutate. This bug has shipped to production in real systems; now you'll recognise it on sight.`,
    },
    {
      type: 'text',
      md: md`
## Making objects print nicely

Try \`print(alice)\` on the class above and you'll see something like
\`<__main__.Account object at 0x10a3f2d90>\` — useless when debugging. Add one method:

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.history = []

    def __repr__(self):
        return f"Account(owner={self.owner!r}, balance={self.balance})"


print(Account("Alice", 120))   # Account(owner='Alice', balance=120)
~~~

\`__repr__\` is another "double-underscore" method that Python calls for you — this one whenever it
needs to show the object as text. The convention is to make it look like the code that would
recreate the object. Lesson Py.3 covers this family properly; for now, add a \`__repr__\` to every
class you write and your debugging life gets noticeably easier.

`,
    },
    {
      type: 'example',
      title: 'a complete small class, traced line by line',
      md: md`
Everything from this lesson in one class — a shopping cart — and then the state of every object after
each line, which is exactly how you should trace classes on paper:

~~~python
class Cart:
    def __init__(self, owner):
        self.owner = owner
        self.items = {}              # name -> quantity, created per cart

    def add(self, name, qty=1):
        if qty <= 0:
            raise ValueError("quantity must be positive")
        self.items[name] = self.items.get(name, 0) + qty

    def remove(self, name):
        self.items.pop(name, None)   # removing something absent is not an error

    def count(self):
        return sum(self.items.values())

    def __repr__(self):
        return f"Cart({self.owner!r}, {self.count()} items)"


a = Cart("Ana")
b = Cart("Ben")
a.add("apple", 3)
a.add("apple")
b.add("milk", 2)
a.remove("banana")
print(a, b)
~~~

Trace it:

| after line | \`a.items\` | \`b.items\` |
|---|---|---|
| \`a = Cart("Ana")\` | \`{}\` | — |
| \`b = Cart("Ben")\` | \`{}\` | \`{}\` |
| \`a.add("apple", 3)\` | \`{'apple': 3}\` | \`{}\` |
| \`a.add("apple")\` | \`{'apple': 4}\` | \`{}\` |
| \`b.add("milk", 2)\` | \`{'apple': 4}\` | \`{'milk': 2}\` |
| \`a.remove("banana")\` | \`{'apple': 4}\` (unchanged) | \`{'milk': 2}\` |

Output: \`Cart('Ana', 4 items) Cart('Ben', 2 items)\`

Three things to notice. The two carts never touch each other's items, because \`self.items = {}\`
runs separately for each (the right way — contrast with the shared-list trap above). \`__repr__\` calls
another method, \`self.count()\`, which is completely normal: methods can use each other through
\`self\`. And the design decisions — "adding zero is an error", "removing something absent is fine" —
live in *one place*, which is the whole reason the class exists.
`,
    },
    {
      type: 'ponder',
      question: md`Two pieces of code need writing. **(A)** Convert a temperature from Celsius to
Fahrenheit. **(B)** A thermostat that remembers its target temperature, tracks the current room
temperature as readings come in, and decides whether the heating should be on. One of these should be
a class and one should be a plain function. Which is which — and what is the *specific* property that
decides it?`,
      answer: md`**(A) is a function; (B) is a class.**

~~~python
def c_to_f(celsius):
    return celsius * 9 / 5 + 32


class Thermostat:
    def __init__(self, target):
        self.target = target
        self.current = None

    def reading(self, temp):
        self.current = temp

    def heating_on(self):
        return self.current is not None and self.current < self.target - 0.5
~~~

The deciding property is **state that persists and changes over time**. The converter has no memory:
the same input always gives the same output, and nothing is remembered between calls. The thermostat
*remembers* — its answer to "should the heating be on?" depends on readings that arrived earlier. That
memory needs somewhere to live, and the rules for updating it need to live beside it. That's the
bundle a class provides.

A useful test: *"Does this thing need to remember something between one call and the next?"* If not,
write a function.`,
    },
    {
      type: 'text',
      md: md`
## When NOT to use a class

A class is the right tool when you have **data plus rules that must stay consistent together**, or
**many objects of the same kind**. It's the wrong tool more often than beginners expect:

~~~python
# A class wearing a costume. This is just a function.
class TaxCalculator:
    def __init__(self, rate):
        self.rate = rate

    def calculate(self, amount):
        return amount * self.rate


# Say what you mean:
def calculate_tax(amount, rate):
    return amount * rate
~~~

The tell: a class whose only methods are \`__init__\` and *one* other method, with no state that
changes over time. That's a function that someone made harder to read. Plain functions are not a
lower form of code — reach for a class when the bundling actually buys you something.

## What you now own

1. **Why classes exist:** data and the rules about that data belong together; keeping them apart
   makes the rules optional and lets them drift.
2. **The anatomy:** \`class\` defines a blueprint; \`__init__\` sets up each new object's data;
   methods are functions that live in the class; instances are the objects you build.
3. **\`self\`, derived:** \`obj.method(x)\` is literally \`Class.method(obj, x)\` — \`self\` is just
   the object you called the method on.
4. **Class vs instance attributes** and the lookup order (instance first, then class).
5. **The shared-mutable trap:** a list or dict in the class body is shared by every instance.
   Mutable per-object data goes in \`__init__\`.
6. **\`__repr__\`** for readable objects — and the judgment to *not* use a class when a function will do.

Next: what happens when you have two kinds of account that are *mostly* the same — inheritance, and
the reason experienced programmers often prefer something else.
`,
    },
  ],
  questions: [
    {
      id: 'py-l1-q1',
      kind: 'mcq',
      prompt: md`In \`def deposit(self, amount):\`, what does \`self\` refer to when you call
\`alice.deposit(50)\`?`,
      options: [
        md`The \`Account\` class itself`,
        md`The object \`alice\` — the instance the method was called on`,
        md`A fresh copy of \`alice\` that is discarded after the method returns`,
        md`Nothing; \`self\` is a keyword Python ignores`,
      ],
      answer: 1,
      explain: md`\`alice.deposit(50)\` is shorthand for \`Account.deposit(alice, 50)\`, so \`self\` is
\`alice\`. Option C is the tempting one if you've met languages that copy arguments — but Python passes
the actual object, which is exactly why \`self.balance += amount\` changes alice's real balance. And
\`self\` isn't a keyword at all; it's an ordinary parameter name that everyone agrees to use.`,
    },
    {
      id: 'py-l1-q2',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
class Account:
    def __init__(self, balance):
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount

    def withdraw(self, amount):
        if amount <= self.balance:
            self.balance -= amount

a = Account(100)
a.deposit(40)
a.withdraw(200)
a.withdraw(90)
print(a.balance)
~~~`,
      answer: 50,
      tolerance: 0,
      explain: md`100 → deposit 40 → **140**. Withdraw 200 is refused (200 > 140) — note it doesn't
raise here, it silently does nothing, which is its own design smell. Withdraw 90 → **50**. Tracing
state step by step like this, on paper, is the core debugging skill for classes.`,
    },
    {
      id: 'py-l1-q3',
      kind: 'mcq',
      prompt: md`What is the job of \`__init__\`?`,
      options: [
        md`To create the object and return it to the caller`,
        md`To set up the new object's starting data — Python has already created the object and passes it in as \`self\``,
        md`To define which methods the class has`,
        md`To run once when the class is defined, before any objects exist`,
      ],
      answer: 1,
      explain: md`By the time \`__init__\` runs, the object already exists — that's why it receives
\`self\`. Its job is initialisation, not creation, and it returns nothing (it must return \`None\`).
Option A is the classic misconception, carried over from "constructors" in other languages; option D
confuses the *class body*, which runs once at definition time, with \`__init__\`, which runs once per
new object.`,
    },
    {
      id: 'py-l1-q4',
      kind: 'numeric',
      prompt: md`Predict the output — carefully:

~~~python
class Cart:
    items = []

    def add(self, item):
        self.items.append(item)

a = Cart()
b = Cart()
a.add("apple")
a.add("bread")
b.add("milk")
print(len(b.items))
~~~`,
      answer: 3,
      tolerance: 0,
      explain: md`**3** — the shared-mutable trap. \`items = []\` in the class body is one list shared
by every cart, so all three \`append\` calls land in it. If you answered 1, you've reasoned about how
the code *should* behave; the fix is to create \`self.items = []\` inside \`__init__\`. This bug is
worth getting wrong once on paper so you never get it wrong in production.`,
    },
    {
      id: 'py-l1-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Take the dict-and-functions banking code from the start of this
lesson. On paper: (1) rewrite it as an \`Account\` class with \`deposit\`, \`withdraw\`, and
\`__repr__\`; (2) for each of the three breaks (bypassing rules, rules drifting from data, typos),
write one sentence on what your class version changes and one sentence on what it still does *not*
prevent; (3) explain in your own words why \`alice.withdraw(30)\` and \`Account.withdraw(alice, 30)\`
do the same thing.`,
      rubric: md`**(1) The class:**

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.history = []          # per-object, inside __init__

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self.balance += amount
        self.history.append(("deposit", amount))

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount
        self.history.append(("withdraw", amount))

    def __repr__(self):
        return f"Account(owner={self.owner!r}, balance={self.balance})"
~~~

**(2) Honest accounting of each break:**
- *Bypassing rules:* the natural interface now enforces the rule — but \`acct.balance = -500\` is still
  physically possible (fixed properly with \`@property\` in Py.4).
- *Drift:* every operation lives in one place, so a new method sits beside the pattern it must follow —
  but nothing *forces* a new method to append history; it's discoverable, not guaranteed.
- *Typos:* reading \`acct.balence\` now raises \`AttributeError\` — but *assigning* to a typo still
  silently creates a new attribute (catchable with slots, Py.3).

**(3)** Calling a method on an object is shorthand: Python finds the function on the object's class and
passes the object in as the first argument, which the method receives as \`self\`.

Full credit needs working code with \`history\` created in \`__init__\`, *both* halves of each break
(what's fixed and what isn't), and the \`self\` explanation in your own words. Claiming the class
fixes all three breaks completely is the most common partial answer.`,
    },
    {
      id: 'py-l1-q6',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
class Robot:
    count = 0

    def __init__(self, name):
        self.name = name
        Robot.count += 1

r1 = Robot("R2")
r2 = Robot("C3")
r3 = Robot("BB")
print(Robot.count)
~~~`,
      answer: 3,
      tolerance: 0,
      explain: md`**3.** Each \`__init__\` increments the *shared* class attribute via \`Robot.count\`.
The contrast with the cart trap is instructive: here, sharing is exactly what we want. If the line
had been \`self.count += 1\`, each robot would get its own \`count\` of 1 and \`Robot.count\` would
stay 0 — try predicting that variant too.`,
    },
    {
      id: 'py-l1-q7',
      kind: 'mcq',
      prompt: md`Which of these is the strongest sign that a class should have been a plain function?`,
      options: [
        md`The class has more than five methods`,
        md`The class has only \`__init__\` plus one other method, and none of its data changes after creation`,
        md`The class stores a list as an attribute`,
        md`The class is used in more than one file`,
      ],
      answer: 1,
      explain: md`A class earns its keep by bundling data with rules that must stay consistent *over
time*. If nothing changes after creation and there's only one real operation, you've written a
function with extra ceremony. The others describe perfectly healthy classes — option A is tempting
because big classes *can* be a smell, but that's a different smell (a class doing too much), not this
one.`,
    },
    {
      id: 'py-l1-q8',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
class Counter:
    def __init__(self):
        self.value = 0

    def click(self):
        self.value += 1
        return self

c = Counter()
c.click().click().click()
d = Counter()
d.click()
print(c.value + d.value)
~~~`,
      answer: 4,
      tolerance: 0,
      explain: md`\`click\` returns \`self\`, so \`c.click().click().click()\` calls it three times on
the *same* object — \`c.value\` is 3. \`d\` is a separate object with its own \`value\`, which is 1.
Total **4**. Returning \`self\` to allow chaining is a real pattern you'll see in libraries; the key
insight is that every call in the chain is still operating on \`c\`.`,
    },
    {
      id: 'py-l1-q9',
      kind: 'mcq',
      prompt: md`You write \`self.count += 1\` inside a method, where \`count\` is a class attribute
starting at 0. After calling that method once on object \`x\`, what is true?`,
      options: [
        md`The class attribute becomes 1, shared by all objects`,
        md`\`x\` now has its own instance attribute \`count\` equal to 1; the class attribute is still 0`,
        md`Python raises an error because you can't modify a class attribute through \`self\``,
        md`Both the class attribute and \`x.count\` become 1`,
      ],
      answer: 1,
      explain: md`\`self.count += 1\` means \`self.count = self.count + 1\`. The right side *reads*
\`self.count\` — not found on \`x\`, so Python finds the class's 0. The left side *assigns* through
\`self\`, which always writes to the instance. Result: a new \`x.count\` of 1, class untouched. This is
the mirror image of the list trap: assignment creates a private copy, mutation (\`.append\`) touches the
shared one. Option A is what most people expect, which is precisely why the bug is so common.`,
    },
    {
      id: 'py-l1-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid who has written a few Python scripts asks: "What's the
point of classes? I can just use variables." Explain, using an analogy you invent (a cookie cutter,
a form, a video-game character — or something better): what a class is versus an object, why bundling
the data with the rules helps, and what \`self\` means. No jargon without a kid-level explanation
first.`,
      rubric: md`Grade the teaching:

1. **Class vs object, made concrete** — e.g. a video game has one *design* for "goblin" (how much
   health goblins start with, what they can do) but fifty actual goblins running around, each with its
   own health bar. The design is the class; each goblin is an object. The kid should be able to point
   at a new example and say which is which.
2. **Why bundle data with rules** — if health is just a number anyone can change, a bug can set it to
   minus a thousand. If the goblin has a rule built in — "you can only lose health by getting hit, and
   never below zero" — the number can't go wrong, because the only way to change it is through the rule.
3. **\`self\`** — when you tell *this* goblin to take damage, the damage function needs to know
   *which* goblin; \`self\` is simply "the one you're talking to right now."
4. **Jargon audit:** "instance," "attribute," "method," "encapsulation," "constructor" used without a
   kid-level translation = partial at best.`,
    },
    {
      id: 'py-l1-q11',
      kind: 'written',
      prompt: md`**Design on paper.** A small library lends books. Each book has a title and author and is
either on the shelf or borrowed by one member; a book can't be borrowed twice at once; the library
wants to see a book's full lending history. Write a \`Book\` class with \`__init__\`, \`borrow(member)\`,
\`give_back()\`, and \`__repr__\`. Then state one rule your class enforces and one mistake a caller could
still make.`,
      rubric: md`A strong answer, give or take naming:

~~~python
class Book:
    def __init__(self, title, author):
        self.title = title
        self.author = author
        self.borrowed_by = None      # None means "on the shelf"
        self.history = []            # per-book, created in __init__

    def borrow(self, member):
        if self.borrowed_by is not None:
            raise ValueError(f"{self.title!r} is already borrowed by {self.borrowed_by}")
        self.borrowed_by = member
        self.history.append(("borrowed", member))

    def give_back(self):
        if self.borrowed_by is None:
            raise ValueError(f"{self.title!r} is not borrowed")
        self.history.append(("returned", self.borrowed_by))
        self.borrowed_by = None

    def __repr__(self):
        status = "on shelf" if self.borrowed_by is None else f"borrowed by {self.borrowed_by}"
        return f"Book({self.title!r}, {status})"
~~~

**Must have:** \`history\` created in \`__init__\` (not the class body — the Py.1 trap); \`borrow\`
refusing a double-borrow; \`give_back\` handling the not-borrowed case; a readable \`__repr__\`.

**Rule enforced** (any): no double borrowing; every change is recorded in history.
**Mistake still possible** (any): a caller can set \`book.borrowed_by = "someone"\` directly and skip the
history; nothing checks that \`member\` is a real member.

Full credit requires the history-in-\`__init__\` detail *and* an honest "still possible" item.`,
    },
    {
      id: 'py-l1-q12',
      kind: 'written',
      prompt: md`**Find the bugs.** This class has three separate bugs. Find each, say what would go wrong
when the code runs, and write the fix.

~~~python
class Playlist:
    songs = []

    def __init__(self, name):
        name = name

    def add(song):
        self.songs.append(song)

    def __repr__(self):
        return f"Playlist({self.name}, {len(self.songs)} songs)"
~~~`,
      rubric: md`**Bug 1 — shared list.** \`songs = []\` in the class body is shared by every playlist, so
adding to one adds to all. *Fix:* \`self.songs = []\` inside \`__init__\`.

**Bug 2 — the name is never stored.** \`name = name\` just reassigns the local parameter to itself; no
attribute is created. \`__repr__\` then crashes with \`AttributeError: 'Playlist' object has no
attribute 'name'\`. *Fix:* \`self.name = name\`.

**Bug 3 — missing \`self\`.** \`def add(song):\` has no \`self\`. Calling \`p.add("x")\` passes \`p\` as
\`song\` and the real song as a surplus argument, raising \`TypeError: add() takes 1 positional argument
but 2 were given\` — and \`self\` inside the body wouldn't exist anyway. *Fix:* \`def add(self, song):\`.

**Corrected:**

~~~python
class Playlist:
    def __init__(self, name):
        self.name = name
        self.songs = []

    def add(self, song):
        self.songs.append(song)

    def __repr__(self):
        return f"Playlist({self.name!r}, {len(self.songs)} songs)"
~~~

Full credit = all three bugs, each with the *actual* failure it causes (not just "it's wrong"), and a
working fix. Spotting bug 3 by predicting the exact \`TypeError\` shows you understand how \`self\` gets
passed — the core idea of the lesson.`,
    },
  ],
}
