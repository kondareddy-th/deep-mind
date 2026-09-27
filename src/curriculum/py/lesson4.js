// Python Foundations, Lesson 4 — Properties, class methods & encapsulation
//
// Content uses the `md` tag from ../md.js: it behaves like String.raw, and an escaped
// backtick \` becomes a real backtick. Code blocks use ~~~python fences (no escaping).
// NEVER write the sequence dollar-brace inside content (JS interpolation).

import { md } from '../md.js'

export default {
  id: 'py-l4',
  title: 'Py.4 Properties, class methods & encapsulation — guarding the rules',
  subtitle:
    'Py.1 left a hole: nothing stops acct.balance = -500. This lesson closes it without changing a single line of the code that already uses the attribute, and then gives your classes a second kind of constructor, a place for helper functions, and an honest account of what "private" means in Python.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Here is the \`Account\` class from Py.1, the one you've been using all week:

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount


acct = Account("Alice", 100)
acct.balance = -500          # nothing stops this
print(acct.balance)          # -500
~~~

Py.1 admitted this openly: \`withdraw\` guards the rule, but only for people who *choose* to call
\`withdraw\`. Anyone can write straight to \`acct.balance\`.

The obvious repair is the one many languages teach — hide the attribute and make everyone go
through methods:

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.set_balance(balance)

    def get_balance(self):
        return self._b

    def set_balance(self, value):
        if value < 0:
            raise ValueError("balance cannot be negative")
        self._b = value


acct = Account("Alice", 100)
acct.set_balance(acct.get_balance() + 50)
print(acct.get_balance())    # 150
~~~

It works. But look at what it cost:

1. **Every existing caller is now broken.** Suppose three thousand lines across your project already
   say \`acct.balance\`, \`acct.balance += 10\`, \`print(acct.balance)\`. Every single one now
   crashes with \`AttributeError\`, and every single one has to be rewritten.
2. **The code got uglier.** \`acct.balance += 50\` became
   \`acct.set_balance(acct.get_balance() + 50)\`. Multiply that by every attribute of every class.

So here is the real puzzle: **can you add a rule to an attribute *without changing how anyone uses
the attribute*?** Keep \`acct.balance = x\` and \`print(acct.balance)\` working exactly as they do
today, but have a check run every time someone assigns?

In Python the answer is yes, and the tool is called a **property**.

## Deriving the property: an attribute that runs code

Think about what we actually want. From the *outside*, \`acct.balance\` should look like plain data.
On the *inside*, reading or writing it should run a function. So we want "an attribute that runs code
when it's touched."

Start with just the reading half. Put \`@property\` on the line above a method — the \`@\` line is
called a **decorator**; for now read it as a label that changes how the method is used — and the
method becomes readable *without parentheses*:

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self._balance = balance        # the real storage, note the underscore

    @property
    def balance(self):
        print("(reading balance)")     # proof that code is running
        return self._balance


acct = Account("Alice", 100)
print(acct.balance)
# (reading balance)
# 100
~~~

Read that last line carefully: \`acct.balance\` — no \`()\` — *called a function*. That is the whole
trick. The caller writes what looks like attribute access; Python quietly runs \`balance(acct)\` and
hands back whatever it returns.

Two names are now in play, and keeping them apart is the key to everything that follows:

- \`_balance\` is where the number is **stored**. A normal instance attribute.
- \`balance\` is the **public face** — a property that decides what happens when someone reads it.

They *must* be different names. (If the property returned \`self.balance\`, it would call itself,
which calls itself, forever — you'll see that bug in the final question.)

What happens if someone tries to *assign* to it now?

~~~python
acct.balance = 5
# AttributeError: property 'balance' of 'Account' object has no setter
~~~

Python refuses, because we haven't said what assignment should do. That's the second half.

## The setter: closing Py.1's break

To say what happens on assignment, write a second method with **the same name**, decorated with
\`@balance.setter\`. It receives the value being assigned:

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance          # goes THROUGH the setter, so it's checked too

    @property
    def balance(self):
        return self._balance

    @balance.setter
    def balance(self, value):
        if value < 0:
            raise ValueError(f"balance cannot be negative: {value}")
        self._balance = value


acct = Account("Alice", 100)
acct.balance += 50             # reads (150), then assigns through the setter
print(acct.balance)            # 150

acct.balance = -500
# ValueError: balance cannot be negative: -500
~~~

Now compare with the puzzle. Every line that already said \`acct.balance\` still works, character for
character. Nobody had to change anything. But \`acct.balance = -500\` is now impossible — Py.1's break 1
is closed.

Notice the quiet detail in \`__init__\`: it says \`self.balance = balance\`, *not*
\`self._balance = balance\`. That assignment goes through the setter, so even the starting balance is
checked:

~~~python
Account("Bob", -1)
# ValueError: balance cannot be negative: -1
~~~

If \`__init__\` had written to \`self._balance\` directly, it would have been the one back door left
open. The rule of thumb: **inside the class, go through the property unless you have a reason not to.**
`,
    },
    {
      type: 'ponder',
      question: md`Using the \`Account\` with the validating setter above, predict *both* printed lines
before revealing. The interesting question is the second one: when the setter raises, does the old
balance survive, or is it lost?

~~~python
acct = Account("Alice", 100)
try:
    acct.balance = -5
except ValueError as e:
    print("refused:", e)
print(acct.balance)
~~~`,
      answer: md`
~~~python
# refused: balance cannot be negative: -5
# 100
~~~

The old value **survives**, and it's worth seeing exactly why. \`acct.balance = -5\` calls the setter
with \`value = -5\`. The very first thing the setter does is check \`value < 0\` — true — and
\`raise\`. A \`raise\` leaves the function *immediately*, so the line \`self._balance = value\` never
runs. \`_balance\` still holds 100.

That ordering is a design principle, not an accident: **check first, change second.** If you wrote the
setter the other way round —

~~~python
@balance.setter
def balance(self, value):
    self._balance = value               # changed first...
    if value < 0:
        raise ValueError("negative")    # ...complained second
~~~

— then the error would still be raised, but the damage would already be done: \`acct.balance\` would
be -5, with an exception flying past to announce it. A validator that validates *after* storing is
just a very loud way of accepting bad data. Put every check before the assignment and a refused
update leaves the object exactly as it was.`,
    },
    {
      type: 'text',
      md: md`
## Read-only properties

Sometimes the right answer to "what should assignment do?" is *nothing — it shouldn't be allowed*.
An account number, once issued, should never change. Give it a getter and simply don't write a setter:

~~~python
class Account:
    _next_number = 1001                 # class attribute: shared counter (Py.1)

    def __init__(self, owner):
        self.owner = owner
        self._number = Account._next_number
        Account._next_number += 1

    @property
    def number(self):
        return self._number


a = Account("Alice")
b = Account("Bob")
print(a.number, b.number)    # 1001 1002

a.number = 9999
# AttributeError: property 'number' of 'Account' object has no setter
~~~

"No setter" is a statement of intent that Python enforces. Anyone reading the class sees at a glance:
this can be read, never reassigned.

## Computed properties: values that can't go stale

A property doesn't have to return a stored value at all. It can *compute* its answer fresh every time.
To see why that matters, first watch the broken version — a rectangle that stores its area:

~~~python
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.area = width * height      # computed ONCE, at creation


r = Rectangle(3, 4)
print(r.area)      # 12
r.width = 10
print(r.area)      # 12   <- wrong! it should be 40
~~~

The area was calculated once and then **drifted** away from the truth the moment \`width\` changed.
This is the same disease as Py.1's break 2 — two pieces of data that are supposed to agree, with
nothing keeping them in agreement. You could try to remember to update \`area\` whenever \`width\` or
\`height\` changes, but "remember to" is exactly the kind of rule that gets forgotten.

The cure is to not store it at all:

~~~python
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):
        return self.width * self.height   # recomputed on every read


r = Rectangle(3, 4)
print(r.area)      # 12
r.width = 10
print(r.area)      # 40   <- always right
~~~

There is nothing to keep in sync, because there's only one copy of the truth (\`width\` and
\`height\`), and \`area\` is derived from it on demand. And because \`area\` has no setter, nobody can
write \`r.area = 999\` and create a rectangle whose area disagrees with its sides.

When is a computed property the right call, instead of a method like \`r.area()\`? A good rule: use a
property when the thing *feels like data* (area, full name, age, is_empty) and is cheap to compute.
Use a method when it *does work* (save to disk, send an email) or takes a noticeable amount of time —
people assume that reading an attribute is instant.
`,
    },
    {
      type: 'example',
      title: 'a Rectangle with guarded sides and computed area',
      md: md`
Everything so far in one class: validated setters on the stored values, computed read-only
properties for the derived ones.

~~~python
class Rectangle:
    def __init__(self, width, height):
        self.width = width             # through the setter: checked
        self.height = height           # through the setter: checked

    @property
    def width(self):
        return self._width

    @width.setter
    def width(self, value):
        if value <= 0:
            raise ValueError(f"width must be positive, got {value}")
        self._width = value

    @property
    def height(self):
        return self._height

    @height.setter
    def height(self, value):
        if value <= 0:
            raise ValueError(f"height must be positive, got {value}")
        self._height = value

    @property
    def area(self):                    # computed, no setter
        return self._width * self._height

    @property
    def perimeter(self):               # computed, no setter
        return 2 * (self._width + self._height)

    def __repr__(self):
        return f"Rectangle({self._width}, {self._height})"


r = Rectangle(3, 4)
print(r, r.area, r.perimeter)   # Rectangle(3, 4) 12 14

r.width = 5
print(r, r.area, r.perimeter)   # Rectangle(5, 4) 20 18

try:
    r.height = 0
except ValueError as e:
    print(e)                    # height must be positive, got 0
print(r.height)                 # 4   (the refused update changed nothing)

try:
    r.area = 100
except AttributeError as e:
    print(e)                    # property 'area' of 'Rectangle' object has no setter
~~~

Trace the state on paper:

| after line | \`_width\` | \`_height\` | \`area\` (computed) | \`perimeter\` (computed) |
|---|---|---|---|---|
| \`r = Rectangle(3, 4)\` | 3 | 4 | 12 | 14 |
| \`r.width = 5\` | 5 | 4 | 20 | 18 |
| \`r.height = 0\` (refused) | 5 | 4 | 20 | 18 |
| \`r.area = 100\` (refused) | 5 | 4 | 20 | 18 |

Only two numbers are ever stored. Everything else is derived from them, so it cannot disagree with
them. That's the design idea worth stealing: **store the minimum, compute the rest.**

(Yes, the two setters look repetitive. Python has a tool, called a *descriptor*, for writing that
validation once and reusing it — properties are actually built from descriptors. It's beyond this
lesson; two setters is fine.)
`,
    },
    {
      type: 'text',
      md: md`
## The underscore: "internal, please don't touch"

You've been writing \`self._balance\` with a leading underscore. What does Python do with that
underscore?

**Nothing.** It's purely a message to other programmers:

~~~python
acct = Account("Alice", 100)
print(acct._balance)     # 100 -- works fine
acct._balance = -500     # also works. The setter is bypassed.
print(acct.balance)      # -500
~~~

So is the property useless? No — and this is the honest heart of encapsulation in Python. The
underscore says *"this is an internal detail; I might rename it or change how it works next month;
if you touch it and something breaks, that's on you."* Every Python programmer knows this convention.
Writing \`acct._balance = -500\` in real code is not an accident anyone makes; it's a deliberate choice
to break the rules, and it stands out in code review like a sore thumb.

That's the design Python chose: **guard against accidents, not against determined people.** The
property stops the honest mistake (\`acct.balance = -500\` from someone who didn't know about the
rule). The underscore marks the door that says *staff only*. Python sometimes describes this with the
phrase "we're all consenting adults here."

Here is the vocabulary, since you'll meet it everywhere:

- **Encapsulation** — keeping an object's internal details behind a small public interface, so the
  inside can change without breaking the outside. The property is encapsulation: we swapped plain
  storage for a validated \`_balance\` and no caller noticed.
- **Public interface** — the names outsiders are meant to use: \`balance\`, \`owner\`, \`withdraw\`.
- **Internal (or "private") name** — anything starting with \`_\`.

## Two underscores: name mangling

There's a second, stronger-looking form: two leading underscores, like \`self.__secret\`. This one
Python *does* do something with. Watch:

~~~python
class Account:
    def __init__(self, owner):
        self.owner = owner
        self.__pin = 1234

    def check_pin(self, guess):
        return guess == self.__pin


acct = Account("Alice")
print(acct.check_pin(1234))   # True
print(acct.__pin)
# AttributeError: 'Account' object has no attribute '__pin'
~~~

Aha, it's hidden! ...Is it? Look at what's actually stored on the object:

~~~python
print(vars(acct))
# {'owner': 'Alice', '_Account__pin': 1234}
~~~

(\`vars(obj)\` shows an object's instance attributes as a dict — a handy debugging tool.) Python
silently **renamed** \`__pin\` to \`_Account__pin\`: an underscore, the class name, then the original
name. This renaming is called **name mangling**. Inside the class body, every \`self.__pin\` is rewritten
to \`self._Account__pin\` before the code even runs, so the class's own methods still find it. Outside
the class nothing gets rewritten, so \`acct.__pin\` looks for a name that doesn't exist.

So what is mangling *for*, if not secrecy? It solves a specific Py.2 problem: **a subclass accidentally
reusing a parent's internal name.**

~~~python
class Base:
    def __init__(self):
        self.__id = 1              # stored as _Base__id

    def base_id(self):
        return self.__id           # reads _Base__id


class Child(Base):
    def __init__(self):
        super().__init__()
        self.__id = 2              # stored as _Child__id -- a DIFFERENT name

    def child_id(self):
        return self.__id           # reads _Child__id


c = Child()
print(c.base_id(), c.child_id())   # 1 2
print(vars(c))                     # {'_Base__id': 1, '_Child__id': 2}
~~~

The author of \`Child\` had never read \`Base\`'s source and happened to pick the same name. With a single
underscore, \`Child\` would have overwritten \`Base\`'s value and broken \`base_id\` in a way that's
miserable to debug. With two underscores, each class's name is stamped with its own class name, so they
can't collide.

**In practice:** use a single underscore for internal names. It's the everyday convention. Reach for
double underscores only when you're writing a class that *other people will subclass* and you
specifically want to protect a name from clashing. And never think of either as a lock.
`,
    },
    {
      type: 'ponder',
      question: md`Given the class below, does the last line work? If yes, what does it print; if no,
what error? Commit to an answer.

~~~python
class Vault:
    def __init__(self):
        self.__secret = "hunter2"

v = Vault()
print(v._Vault__secret)
~~~`,
      answer: md`It **works** and prints \`hunter2\`.

\`self.__secret\` inside the class body was rewritten to \`self._Vault__secret\`, so that's the real
name the value is stored under. Writing the mangled name yourself, from outside, is perfectly legal —
it's just an ordinary attribute with an odd-looking name. \`v.__secret\` fails only because *that*
spelling is not the stored name.

This is the whole truth about privacy in Python: **there is no truly private attribute.** Single
underscores are a polite sign; double underscores are a rename that prevents *accidental* clashes
in subclasses. Neither is security. If you ever need real secrecy — a password, an API key — the
answer is to not put it in an object that untrusted code can touch at all, not to pick a cleverer
attribute name.

If that feels unsettling, compare it with Py.1: the property on \`balance\` didn't make bad balances
*impossible* either (\`acct._balance = -500\` still works). It made them *impossible by accident*. That
is the level of protection Python aims for, and in practice it's the level that prevents real bugs.`,
    },
    {
      type: 'text',
      md: md`
## A second way in: \`@classmethod\` as alternative constructors

New problem. Your \`Account\` is created with \`Account(owner, balance)\`. But accounts arrive in your
program in other shapes too:

- as a dict, loaded from a JSON file: \`{"owner": "Alice", "balance": 100}\`
- as a line of a CSV file: \`"Alice,100"\`

A class has only one \`__init__\`, so there's only one "official" way to build it. The first thing
people try is a plain function next to the class:

~~~python
def account_from_dict(d):
    return Account(d["owner"], d["balance"])

def account_from_csv(line):
    owner, balance = line.split(",")
    return Account(owner, int(balance))
~~~

This works, but it's scattered: the knowledge "how to build an Account" now lives in three places, and
someone looking at the \`Account\` class has no idea these functions exist. It would be much nicer to
write \`Account.from_dict(d)\` — asking the class itself for a new account, built from a different
starting shape.

That's exactly what \`@classmethod\` gives you. A classmethod receives **the class** as its first
argument, instead of an instance. By convention the parameter is named \`cls\` (since \`class\` is a
reserved word):

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    @classmethod
    def from_dict(cls, d):
        return cls(d["owner"], d["balance"])

    @classmethod
    def from_csv(cls, line):
        owner, balance = line.split(",")
        return cls(owner, int(balance))

    def __repr__(self):
        return f"Account({self.owner!r}, {self.balance})"


a = Account("Alice", 100)                              # the main constructor
b = Account.from_dict({"owner": "Bob", "balance": 50})  # alternative constructor
c = Account.from_csv("Cara,75")                        # another one
print(a, b, c)
# Account('Alice', 100) Account('Bob', 50) Account('Cara', 75)
~~~

Just as \`self\` was derived in Py.1 (\`acct.deposit(5)\` means \`Account.deposit(acct, 5)\`), \`cls\`
is equally simple: \`Account.from_dict(d)\` calls \`from_dict\` with \`cls = Account\` slipped in first.
So \`cls(d["owner"], d["balance"])\` means \`Account(d["owner"], d["balance"])\` — the classmethod
does its parsing, then hands off to the real constructor. That funnel matters: **every alternative
constructor ends at \`__init__\`**, so every validation rule in \`__init__\` (and in any property
setters it uses) still applies. There is no way to sneak a bad account in through a side door.

These names — \`from_dict\`, \`from_string\`, \`from_csv\`, \`fromtimestamp\` — are a convention you'll see
all over Python's standard library and in every ML library you'll use later. A classmethod whose name
starts with \`from_\` almost always means "build one of these from that."

But why write \`cls(...)\` at all? Inside \`from_dict\`, we *know* the class is \`Account\`. Why not just
write \`Account(...)\` and skip the extra parameter?
`,
    },
    {
      type: 'ponder',
      question: md`Here are two ways to write the same alternative constructor, and a subclass from Py.2.
Predict the four printed lines (the last may be an error).

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    @classmethod
    def from_dict(cls, d):
        return cls(d["owner"], d["balance"])

    @classmethod
    def from_dict_hardcoded(cls, d):
        return Account(d["owner"], d["balance"])


class SavingsAccount(Account):
    rate = 0.03

    def add_interest(self):
        self.balance += self.balance * self.rate


data = {"owner": "Priya", "balance": 1000}
s = SavingsAccount.from_dict(data)
print(type(s).__name__)
s.add_interest()
print(s.balance)

h = SavingsAccount.from_dict_hardcoded(data)
print(type(h).__name__)
h.add_interest()
~~~`,
      answer: md`
~~~python
# SavingsAccount
# 1030.0
# Account
# AttributeError: 'Account' object has no attribute 'add_interest'
~~~

Derive it the same way we derived \`self\`. \`SavingsAccount.from_dict(data)\` — \`from_dict\` isn't
defined on \`SavingsAccount\`, so Python finds it on the parent (Py.2's lookup), but it passes **the
class you called it on** as \`cls\`. So \`cls\` is \`SavingsAccount\`, and \`cls(...)\` builds a
\`SavingsAccount\`. Interest works: 1000 + 1000 × 0.03 = 1030.0.

The hard-coded version ignores \`cls\` and always builds a plain \`Account\`. You *asked* the savings class
for a savings account and silently got a regular one — which has no \`add_interest\`, so the last line
crashes. Worse, in a bigger program it might not crash at all; it might just quietly skip the interest.

That's why \`cls\` exists: **writing \`cls(...)\` instead of the class name means every subclass inherits
a constructor that builds the right type, for free.** The author of \`SavingsAccount\` didn't write a
single line of constructor code and still got \`SavingsAccount.from_dict\`, \`SavingsAccount.from_csv\`,
and so on. That's inheritance (Py.2) and classmethods working together as designed.`,
    },
    {
      type: 'text',
      md: md`
## Class-level state: counting with \`cls\`

A classmethod is also the natural home for anything that's about the class as a whole rather than one
object — like the shared counter from Py.1:

~~~python
class Account:
    created = 0

    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        Account.created += 1

    @classmethod
    def from_dict(cls, d):
        return cls(d["owner"], d["balance"])

    @classmethod
    def how_many(cls):
        return cls.created


Account("Alice", 10)
Account.from_dict({"owner": "Bob", "balance": 5})
print(Account.how_many())    # 2
~~~

The \`from_dict\` account was counted too. Of course it was — it went through \`__init__\`, like every
alternative constructor must. Also notice \`how_many\` needs no instance at all: you call it on the class.

## \`@staticmethod\`: a function that just lives in the class

The last decorator is the simplest. Sometimes a helper function is *about* a class's topic but needs
neither an instance (\`self\`) nor the class (\`cls\`). Checking whether a year is a leap year, for a
date class, is a perfect case:

~~~python
class Date:
    def __init__(self, year, month, day):
        self.year = year
        self.month = month
        self.day = day

    @staticmethod
    def is_leap_year(year):
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


print(Date.is_leap_year(2024))   # True
print(Date.is_leap_year(1900))   # False  (divisible by 100 but not by 400)
print(Date.is_leap_year(2000))   # True
~~~

A \`@staticmethod\` receives no automatic first argument. It's an ordinary function that happens to be
stored inside the class, so it's found as \`Date.is_leap_year\` — grouped with the thing it's about.
That's all it does. It's **for organisation only**.

And an honest note: a plain function at the top level of the module would work just as well.

~~~python
def is_leap_year(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
~~~

Many experienced Python programmers prefer this — it's simpler, and anyone can use it without thinking
about \`Date\`. Choose \`@staticmethod\` when the function is so tied to the class that nobody would
look for it anywhere else; otherwise a module-level function is perfectly good Python.
`,
    },
    {
      type: 'example',
      title: 'a Date class that uses every tool in the lesson',
      md: md`
Read-only properties (a date never changes), a computed property, an alternative constructor, static
helpers, and an internal helper method marked with an underscore:

~~~python
class Date:
    DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    def __init__(self, year, month, day):
        self._year = year
        self._month = month
        self._day = day
        self._check()                       # internal helper: note the underscore

    def _check(self):
        if not 1 <= self._month <= 12:
            raise ValueError(f"bad month: {self._month}")
        if not 1 <= self._day <= Date.days_in_month(self._year, self._month):
            raise ValueError(f"bad day: {self._day}")

    # --- read-only properties: no setters, so a Date can't be changed ---
    @property
    def year(self):
        return self._year

    @property
    def month(self):
        return self._month

    @property
    def day(self):
        return self._day

    # --- computed property: derived, never stale ---
    @property
    def day_of_year(self):
        before = sum(Date.days_in_month(self._year, m) for m in range(1, self._month))
        return before + self._day

    # --- alternative constructor ---
    @classmethod
    def from_string(cls, text):
        year, month, day = text.split("-")
        return cls(int(year), int(month), int(day))

    # --- helpers that need neither self nor cls ---
    @staticmethod
    def is_leap_year(year):
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)

    @staticmethod
    def days_in_month(year, month):
        if month == 2 and Date.is_leap_year(year):
            return 29
        return Date.DAYS_IN_MONTH[month - 1]

    def __repr__(self):
        return f"Date({self._year}, {self._month}, {self._day})"


d = Date.from_string("2026-09-26")
print(d)                  # Date(2026, 9, 26)
print(d.day_of_year)      # 269

leap = Date.from_string("2024-03-01")
print(leap.day_of_year)   # 61   (31 in Jan + 29 in Feb + 1)

try:
    Date.from_string("2026-02-30")
except ValueError as e:
    print(e)              # bad day: 30

try:
    d.month = 10
except AttributeError as e:
    print(e)              # property 'month' of 'Date' object has no setter
~~~

Walk through \`Date.from_string("2026-02-30")\` on paper: \`from_string\` runs with \`cls = Date\`, splits
the text into \`"2026"\`, \`"02"\`, \`"30"\`, converts each to an int, and calls \`Date(2026, 2, 30)\`.
\`__init__\` stores the three numbers and calls \`_check\`, which asks \`days_in_month(2026, 2)\` — 2026 is
not a leap year, so 28 — and 30 > 28, so it raises. The bad date never escapes into the program. The
alternative constructor got the validation for free because it funnels into \`__init__\`.

And the 269: January through August is 31 + 28 + 31 + 30 + 31 + 30 + 31 + 31 = 243 days, plus 26.
`,
    },
    {
      type: 'text',
      md: md`
## Choosing the right tool

You now have five places a piece of behaviour can live. The question that decides it is always the
same: **what does this code need access to?**

| tool | first parameter | called as | use it when… | example |
|---|---|---|---|---|
| instance method | \`self\` | \`acct.withdraw(30)\` | it reads or changes *one object's* data | \`withdraw\`, \`deposit\` |
| \`@property\` | \`self\` | \`acct.balance\` (no parentheses) | it *feels like data* — a guarded or computed value, cheap to get | \`balance\`, \`area\`, \`day_of_year\` |
| \`@classmethod\` | \`cls\` | \`Account.from_dict(d)\` | it builds new objects, or works on class-wide state; must respect subclasses | \`from_dict\`, \`how_many\` |
| \`@staticmethod\` | none | \`Date.is_leap_year(2024)\` | it needs neither the object nor the class, but belongs with the class's topic | \`is_leap_year\` |
| plain function | none | \`is_leap_year(2024)\` | it's useful on its own, outside any one class | \`c_to_f\`, most utilities |

A quick way to run the table in your head: *Does it need \`self\`?* Then an instance method — or a
property, if it's data-like. *Does it need the class, especially to build one?* Classmethod. *Needs
neither?* Static method or plain function, and a plain function is rarely wrong.

## What you now own

1. **\`@property\`, derived:** an attribute that runs code when it's read. \`acct.balance\` looks like
   data but calls a method — so you can add rules without changing a single caller.
2. **Setters with validation:** \`@balance.setter\` runs on every assignment, including the one in
   \`__init__\`. Check first, change second, and a refused update leaves the object untouched.
   Py.1's break 1 is closed.
3. **Read-only properties** (no setter → \`AttributeError\` on assignment) and **computed properties**
   (store the minimum, compute the rest, never stale).
4. **The honest truth about privacy:** \`_name\` is a convention meaning "internal"; \`__name\` is
   renamed to \`_Class__name\` to prevent subclass clashes. Python has no truly private attributes —
   it guards against accidents, not against determined people.
5. **\`@classmethod\` alternative constructors:** \`from_dict\`, \`from_string\`. They receive \`cls\`,
   and \`cls(...)\` means subclasses automatically get objects of their own type back.
6. **\`@staticmethod\`** for organisation only — and the judgment that a plain function is often just
   as good.
7. **The decision table:** what does this code need access to? That question picks the tool.

Next: you've been writing \`@property\` and \`@classmethod\` without asking what that \`@\` actually does. Py.5 answers it — functions are objects you can pass around, wrap, and return, and a decorator is nothing more than a function that takes a function and hands back a new one.
`,
    },
  ],
  questions: [
    {
      id: 'py-l4-q1',
      kind: 'mcq',
      prompt: md`Your class has a plain attribute \`temperature\` used in hundreds of places as
\`sensor.temperature\`. You need to reject values below -273.15. What is the main advantage of turning
it into a \`@property\` with a setter, rather than adding \`get_temperature()\` and
\`set_temperature()\` methods?`,
      options: [
        md`Properties run faster than methods`,
        md`Properties make the stored value truly private, so nobody can bypass the check`,
        md`Every existing \`sensor.temperature\` read and \`sensor.temperature = x\` write keeps working unchanged, but now runs your check`,
        md`Properties let you skip writing \`self\` in the method definition`,
      ],
      answer: 2,
      explain: md`The whole point is **keeping the interface**: callers still write plain attribute
access, and the rule runs behind it. Option B is the tempting one because it's what people *want*
properties to do — but the underlying \`_temperature\` is still reachable by anyone who types the
underscore; Python has no true privacy. Option A is false (a property is a method call in disguise,
so it's slightly *slower* than a plain attribute), and option D is false: property methods still take
\`self\`.`,
    },
    {
      id: 'py-l4-q2',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
class Account:
    def __init__(self, balance):
        self.balance = balance

    @property
    def balance(self):
        return self._balance

    @balance.setter
    def balance(self, value):
        if value < 0:
            raise ValueError("negative")
        self._balance = value

a = Account(50)
for change in [30, -100, 20, -90]:
    try:
        a.balance = a.balance + change
    except ValueError:
        pass
print(a.balance)
~~~`,
      answer: 10,
      tolerance: 0,
      explain: md`Trace it: 50 + 30 = **80** (accepted). 80 − 100 = −20, the setter raises *before*
storing, so the balance stays **80**. 80 + 20 = **100**. 100 − 90 = **10** (accepted). If you got −10 or
−20 you let a refused update change the value — but the check runs first and \`raise\` exits before
\`self._balance = value\`. If you got 0, you probably treated the refused −100 as "clamp to zero";
the setter doesn't clamp, it refuses.`,
    },
    {
      id: 'py-l4-q3',
      kind: 'mcq',
      prompt: md`A class defines \`@property def area(self): return self.width * self.height\` and no
setter. What happens when you run \`r.area = 50\`?`,
      options: [
        md`It raises \`AttributeError\`, because the property has no setter`,
        md`It creates a new instance attribute \`area\` equal to 50 that hides the property`,
        md`It silently does nothing; \`r.area\` is still width × height`,
        md`It sets \`width\` and \`height\` so that their product is 50`,
      ],
      answer: 0,
      explain: md`A property without a setter is **read-only**, and Python enforces it: the error is
\`property 'area' of 'Rectangle' object has no setter\`. Option B is tempting because that's exactly
what assignment does for *ordinary* names (Py.1: assigning through \`self\` creates an instance
attribute) — but a property on the class takes priority over the instance, so assignment goes to the
property and is refused. Option C sounds safe but Python prefers loud failures over silent ones, and
option D would require the class to guess which side to change.`,
    },
    {
      id: 'py-l4-q4',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):
        return self.width * self.height

    @property
    def perimeter(self):
        return 2 * (self.width + self.height)

r = Rectangle(3, 4)
before = r.area
r.width = 5
print(before + r.area + r.perimeter)
~~~`,
      answer: 50,
      tolerance: 0,
      explain: md`\`before\` saves the *number* 12 (3 × 4) — it's a plain int, so it doesn't change
later. After \`r.width = 5\`, the computed properties are recalculated from the current sides: area
= 5 × 4 = 20, perimeter = 2 × (5 + 4) = 18. Total 12 + 20 + 18 = **50**. If you got 38 (12 + 12 + 14),
you treated the properties as stored values fixed at creation — the stale-area bug this lesson is
built to prevent. If you got 58, you assumed \`before\` also updates; it doesn't, because it holds a
number, not a property.`,
    },
    {
      id: 'py-l4-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, write a \`Temperature\` class such that:

1. \`Temperature(25)\` stores 25 degrees Celsius.
2. \`t.celsius\` reads it and \`t.celsius = x\` sets it, but any value below -273.15 (absolute zero)
   raises \`ValueError\` — including in the constructor — and leaves the old value untouched.
3. \`t.fahrenheit\` is a computed property (F = C × 9 / 5 + 32) that is never stale.
4. \`t.fahrenheit = 212\` is also allowed: it converts to Celsius and goes through the same check.
5. \`Temperature.from_fahrenheit(98.6)\` is an alternative constructor that still works correctly on a
   subclass.

Then write what \`t = Temperature(100)\`, \`t.fahrenheit = -1000\`, \`print(t.celsius)\` prints, and why.`,
      rubric: md`Model answer:

~~~python
class Temperature:
    def __init__(self, celsius):
        self.celsius = celsius                    # through the setter: checked

    @property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError(f"below absolute zero: {value}")
        self._celsius = value                     # only after the check

    @property
    def fahrenheit(self):
        return self._celsius * 9 / 5 + 32         # computed from the one stored value

    @fahrenheit.setter
    def fahrenheit(self, value):
        self.celsius = (value - 32) * 5 / 9       # reuse the celsius setter's check

    @classmethod
    def from_fahrenheit(cls, f):
        t = cls(0)
        t.fahrenheit = f
        return t


t = Temperature(100)
print(t.fahrenheit)      # 212.0
t.fahrenheit = 50
print(t.celsius)         # 10.0
~~~

(\`from_fahrenheit\` may equally be written \`return cls((f - 32) * 5 / 9)\`.)

**The trace:** \`t.fahrenheit = -1000\` converts to (−1000 − 32) × 5 / 9 ≈ −573.3, which the
celsius setter rejects with \`ValueError\` *before* storing. So if the error is caught, \`t.celsius\`
still prints **100** — the refused update changed nothing. (If it isn't caught, the program stops with
the \`ValueError\` and the print never runs; either reading is fine if stated.)

**Must have for full credit:**
- Only **one** stored value (\`_celsius\`); Fahrenheit is computed, not stored. Storing both is the
  stale-data bug.
- \`__init__\` assigns through the property (\`self.celsius = ...\`), not straight to \`_celsius\`.
- Check-before-store ordering in the setter.
- The Fahrenheit setter routes through the Celsius setter rather than duplicating (or skipping) the
  check.
- \`from_fahrenheit\` uses \`cls\`, not \`Temperature\` — the subclass requirement.
- A private name different from the property name (\`_celsius\`, not \`celsius\`, inside the getter —
  otherwise infinite recursion).`,
    },
    {
      id: 'py-l4-q6',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
class Date:
    def __init__(self, year, month, day):
        self.year = year
        self.month = month
        self.day = day

    @classmethod
    def from_string(cls, s):
        year, month, day = s.split("-")
        return cls(int(year), int(month), int(day))

    @classmethod
    def from_dict(cls, d):
        return cls(d["y"], d["m"], d["d"])

d = Date.from_string("2026-09-26")
e = Date.from_dict({"y": 2025, "m": 1, "d": 5})
print(d.day + d.month + e.day)
~~~`,
      answer: 40,
      tolerance: 0,
      explain: md`\`from_string\` splits \`"2026-09-26"\` into \`"2026"\`, \`"09"\`, \`"26"\` and converts
each with \`int\` — \`int("09")\` is 9. So \`d.day\` is 26 and \`d.month\` is 9. \`from_dict\` gives
\`e.day\` = 5. Total 26 + 9 + 5 = **40**. The trap: forgetting the \`int\` conversion and imagining
string concatenation (\`"26" + "09"\`) — but the code does convert, so this is ordinary integer
addition. Both constructors end at \`__init__\` with \`cls = Date\`.`,
    },
    {
      id: 'py-l4-q7',
      kind: 'mcq',
      prompt: md`Inside \`class Account:\`, a method runs \`self.__pin = 1234\`. Which statement is true?`,
      options: [
        md`The value is now private: no code outside the class can read it`,
        md`The value is stored under the name \`_Account__pin\`, which outside code can still read`,
        md`The value is stored under \`__pin\` but \`vars()\` hides it`,
        md`Python raises a \`SyntaxError\` because attribute names can't start with two underscores`,
      ],
      answer: 1,
      explain: md`**Name mangling** rewrites \`__pin\` to \`_Account__pin\` inside the class body.
\`acct.__pin\` fails from outside only because it's the wrong spelling; \`acct._Account__pin\` works
fine. Option A is the tempting one — especially if you've seen \`private\` in Java or C++ — but Python
has no true private attributes. The purpose of mangling is to stop a *subclass* from accidentally
clashing with the parent's internal names, not to keep secrets. Option C is wrong because \`vars()\`
shows the mangled name plainly.`,
    },
    {
      id: 'py-l4-q8',
      kind: 'numeric',
      prompt: md`What does this print?

~~~python
class Account:
    created = 0

    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        Account.created += 1

    @classmethod
    def from_dict(cls, d):
        return cls(d["owner"], d["balance"])

    @classmethod
    def empty(cls, owner):
        return cls(owner)

    @classmethod
    def how_many(cls):
        return cls.created

a = Account("A", 10)
b = Account.from_dict({"owner": "B", "balance": 5})
c = Account.empty("C")
d = [Account.empty(name) for name in "XYZ"]
print(Account.how_many())
~~~`,
      answer: 6,
      tolerance: 0,
      explain: md`Every alternative constructor calls \`cls(...)\`, which runs \`__init__\`, which
increments the counter. So count the objects: \`a\` (1), \`b\` (1), \`c\` (1), and the list builds one
per character of \`"XYZ"\` (3). Total **6**. If you answered 3, you assumed only direct
\`Account(...)\` calls reach \`__init__\` — but alternative constructors are funnels *into* \`__init__\`,
never around it. If you answered 4, you counted the list as one object rather than looping over the
three letters.`,
    },
    {
      id: 'py-l4-q9',
      kind: 'mcq',
      prompt: md`You're adding \`Temperature.from_fahrenheit(f)\` to a class that other people will
subclass (e.g. \`OvenTemperature\`). Which should it be?`,
      options: [
        md`An instance method, \`def from_fahrenheit(self, f)\``,
        md`A \`@staticmethod\` that returns \`Temperature(...)\`, since it doesn't need \`self\``,
        md`A \`@classmethod\` that returns \`cls(...)\``,
        md`A \`@property\``,
      ],
      answer: 2,
      explain: md`It builds a new object, and it must respect subclasses — that's precisely a classmethod
returning \`cls(...)\`: \`OvenTemperature.from_fahrenheit(400)\` then gives back an
\`OvenTemperature\`. Option B is the tempting one: the reasoning "it doesn't need \`self\`, so it's
static" is half right, but a static method has no \`cls\`, so it must hard-code \`Temperature\` — and
the subclass gets the wrong type back. Option A would force you to already *have* a temperature before
you could make one, and a property can't take an argument at all.`,
    },
    {
      id: 'py-l4-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid who knows a little Python asks: "What's a property,
and why not just let people change the number directly?" Explain, with an analogy you invent, what a
property does and why it's useful — including what happens when someone tries to set a bad value,
and why it matters that everyone can keep writing \`thing.value = 5\` exactly as before. No jargon
without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **An analogy that captures "looks like direct access, but a check runs"** — e.g. a school
   noticeboard where pupils used to pin up notes themselves; now there's a helper standing at the board.
   Pupils still walk up and "pin a note" exactly the same way, but the helper quietly checks each one
   and refuses anything rude. Nobody had to learn a new way of posting.
2. **What happens with a bad value** — it gets refused, and the old value stays exactly as it was (the
   helper doesn't tear down the old note before checking the new one).
3. **Why not changing the interface matters** — lots of people (lots of code) already do it the old
   way; if you forced everyone to fill in a form instead, all of them would have to change their habits,
   and some would get it wrong. The property adds the rule without anyone having to change.
4. **Bonus — honesty:** there's still a back door (the \`_underscore\` name) that a determined person
   could use; the property stops accidents, not someone breaking rules on purpose.
5. **Jargon audit:** "decorator," "getter/setter," "encapsulation," "attribute," "validation,"
   "interface" used without a kid-level translation = partial credit at best. An answer that just
   restates the definition ("a property is a managed attribute") earns little, however correct.`,
    },
    {
      id: 'py-l4-q11',
      kind: 'written',
      prompt: md`**Design on paper.** A course system stores students. Each student has a \`name\` that
must never change after creation, and a \`score\` that must stay between 0 and 100. You also need:
the letter \`grade\` ("A" for 90+, "B" for 80+, "C" for 70+, otherwise "F") that is always consistent
with the score; a way to build a student from a CSV line like \`"Ravi,87"\`; and a helper that checks
whether a number is a valid score. Write the \`Student\` class, and for each piece say which tool from
the decision table you chose and why.`,
      rubric: md`A strong answer, give or take naming:

~~~python
class Student:
    def __init__(self, name, score):
        self._name = name
        self.score = score                        # through the setter: checked

    @property
    def name(self):                               # read-only: no setter
        return self._name

    @property
    def score(self):
        return self._score

    @score.setter
    def score(self, value):
        if not Student.is_valid_score(value):
            raise ValueError(f"score must be 0-100, got {value}")
        self._score = value

    @property
    def grade(self):                              # computed, never stale
        if self._score >= 90:
            return "A"
        if self._score >= 80:
            return "B"
        if self._score >= 70:
            return "C"
        return "F"

    @classmethod
    def from_csv(cls, line):                      # alternative constructor
        name, score = line.split(",")
        return cls(name, int(score))

    @staticmethod
    def is_valid_score(value):                    # needs neither self nor cls
        return 0 <= value <= 100


s = Student.from_csv("Ravi,87")
print(s.name, s.score, s.grade)    # Ravi 87 B
s.score = 93
print(s.grade)                     # A
~~~

**Justifications expected:**
- \`name\` — read-only property (no setter), because it must never change.
- \`score\` — property with a validating setter; \`__init__\` goes through it.
- \`grade\` — computed property: storing it would let it drift from the score.
- \`from_csv\` — classmethod returning \`cls(...)\`, so subclasses get their own type.
- \`is_valid_score\` — staticmethod *or* a module-level function; either is fine if justified.

Full credit needs the computed (not stored) grade, the setter used in \`__init__\`, and \`cls\` in the
constructor. Storing \`grade\` in \`__init__\` is the most common partial answer — it goes stale the
first time the score changes.`,
    },
    {
      id: 'py-l4-q12',
      kind: 'written',
      prompt: md`**Find the bugs.** This class has three separate bugs. For each, say exactly what goes
wrong when the code runs (which error, and when), and write the fix.

~~~python
class Account:
    def __init__(self, owner, balance):
        self.owner = owner
        self.balance = balance

    @property
    def balance(self):
        return self.balance

    @balance.setter
    def set_balance(self, value):
        if value < 0:
            raise ValueError("negative")
        self._balance = value

    @staticmethod
    def from_dict(d):
        return cls(d["owner"], d["balance"])
~~~`,
      rubric: md`**Bug 1 — the getter calls itself.** \`return self.balance\` reads the \`balance\`
property, which runs the getter, which reads \`self.balance\`, which runs the getter... forever, until
Python gives up with \`RecursionError: maximum recursion depth exceeded\`. *Fix:* return the stored
name, \`return self._balance\`.

**Bug 2 — the setter has the wrong name.** \`@balance.setter\` must decorate a method *also called*
\`balance\`. Named \`set_balance\`, it creates a separate property called \`set_balance\` and leaves
\`balance\` with no setter. So the very first object creation fails: \`self.balance = balance\` in
\`__init__\` raises \`AttributeError: property 'balance' of 'Account' object has no setter\`. *Fix:*
\`def balance(self, value):\`.

**Bug 3 — a static method using \`cls\`.** A \`@staticmethod\` gets no automatic first argument, so
\`cls\` doesn't exist inside it: \`Account.from_dict(...)\` raises \`NameError: name 'cls' is not
defined\`. *Fix:* make it \`@classmethod\` with \`def from_dict(cls, d):\` — and *not* "fix" it by
writing \`Account(...)\`, which would work but hand subclasses the wrong type.

**Corrected:**

~~~python
class Account:
    def __init__(self, owner, balance):
        self.owner = owner
        self.balance = balance

    @property
    def balance(self):
        return self._balance

    @balance.setter
    def balance(self, value):
        if value < 0:
            raise ValueError("negative")
        self._balance = value

    @classmethod
    def from_dict(cls, d):
        return cls(d["owner"], d["balance"])
~~~

Full credit = all three bugs, each with the *actual* error and *when* it happens (note bug 2 fires
first, in \`__init__\`, before bug 1 is ever reached), plus working fixes. Fixing bug 3 by hard-coding
\`Account\` earns partial credit: it runs, but it breaks the subclass guarantee the lesson built.`,
    },
  ],
}
