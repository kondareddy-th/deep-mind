// Python Foundations, Lesson 2 — Inheritance, composition & polymorphism
//
// Content uses the `md` tag from ../md.js: it behaves like String.raw, and an escaped
// backtick \` becomes a real backtick. Code blocks use ~~~python fences (no escaping).
// NEVER write the sequence dollar-brace inside content (JS interpolation).

import { md } from '../md.js'

export default {
  id: 'py-l2',
  title: 'Py.2 Inheritance, composition & polymorphism — reuse without regret',
  subtitle:
    'Your Account class from Py.1 now needs two cousins: a savings account and a checking account. Copy-paste works until the first bug fix. This lesson invents inheritance as the cure, shows exactly where it goes wrong, and gives you composition and duck typing as the tools experienced programmers reach for instead.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Here is the \`Account\` class you built in Py.1, with one small addition — a \`__repr__\` that prints
the class's own name (\`type(self)\` gives you the class of an object, and \`.__name__\` is its name as
a string):

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

    def __repr__(self):
        return f"{type(self).__name__}(owner={self.owner!r}, balance={self.balance})"
~~~

Your bank now wants two new products:

- a **SavingsAccount**, which earns interest every month and allows at most **3 withdrawals per month**;
- a **CheckingAccount**, which may go **below zero**, down to an overdraft limit (say 100).

With what you know today, the obvious move is to copy the class twice and edit each copy:

~~~python
class SavingsAccount:
    def __init__(self, owner, balance=0, rate=0.02):
        self.owner = owner
        self.balance = balance
        self.history = []
        self.rate = rate
        self.withdrawals_this_month = 0

    def deposit(self, amount):                 # copied, word for word
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self.balance += amount
        self.history.append(("deposit", amount))

    def withdraw(self, amount):                # copied, then edited
        if self.withdrawals_this_month >= 3:
            raise ValueError("only 3 withdrawals per month")
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount
        self.history.append(("withdraw", amount))
        self.withdrawals_this_month += 1

# ...and CheckingAccount: another full copy, with its own edited withdraw
~~~

It runs. Every test passes. Now, three weeks later, compliance says: *"every deposit must also record
the date."* How many places do you have to change?

**Three.** \`Account.deposit\`, \`SavingsAccount.deposit\`, \`CheckingAccount.deposit\` — three copies of
the same four lines. Miss one and your savings accounts quietly keep dateless history, and nothing
anywhere tells you. Add a fourth account type next year and it's four places. Every copy is a promise
to remember forever that the copies exist.

Notice what the copies actually *are*. A savings account isn't a different kind of thing from an
account — it **is** an account, with a couple of extra rules. The code should say that, once, and
let the shared parts live in exactly one place. That's what inheritance does.

## Inheritance: "is-a", written in code

~~~python
class SavingsAccount(Account):
    pass


s = SavingsAccount("Sam", 100)
s.deposit(50)
s.withdraw(30)
print(s)            # SavingsAccount(owner='Sam', balance=120)
print(s.history)    # [('deposit', 50), ('withdraw', 30)]
~~~

The brackets in \`class SavingsAccount(Account):\` say "a SavingsAccount *is an* Account." Some
vocabulary, all of which means the same relationship:

- \`Account\` is the **parent** class (also called the **base class** or **superclass**).
- \`SavingsAccount\` is the **child** class (also called the **subclass**, or **derived class**).
- The child **inherits** everything the parent defines: \`__init__\`, \`deposit\`, \`withdraw\`,
  \`__repr__\`. \`pass\` means "add nothing new" — and yet \`s\` already works completely.

How does \`s.deposit(50)\` find \`deposit\`? The same lookup you learned in Py.1, extended by one step:
Python looks **on the instance**, then **on its class** (\`SavingsAccount\` — not there), then **on the
parent class** (\`Account\` — found it). And because \`s.deposit(50)\` still means "call the function
with \`s\` as \`self\`", every \`self.balance\` inside that inherited code is *Sam's* balance.

Now the compliance change touches one method in one class, and every kind of account gets it. That's
the whole pitch for inheritance.

## Adding and overriding

A child can do two things beyond inheriting: **add** new methods the parent doesn't have, and
**override** a method the parent does have, by defining one with the same name. When Python looks up
the name, it finds the child's version first and stops looking.

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def describe(self):
        return "a plain account"


class SavingsAccount(Account):
    def describe(self):                      # override: same name as the parent's
        return "a savings account"

    def add_interest(self, rate):            # addition: parent has nothing like it
        self.balance += round(self.balance * rate)


a = Account("Ann", 100)
s = SavingsAccount("Sam", 1000)
s.add_interest(0.02)
print(a.describe())    # a plain account
print(s.describe())    # a savings account
print(s.balance)       # 1020
~~~

(\`round\` rounds to the nearest whole number — it keeps our balances as tidy integers.)

\`a.add_interest(0.02)\` would raise \`AttributeError\`: lookup goes *up* the family tree, from child to
parent, never down. A parent knows nothing about its children.

Overriding raises a subtle question, and it's the key to everything that follows.
`,
    },
    {
      type: 'ponder',
      question: md`The parent's \`month_end\` calls \`self.fee()\`. The child overrides \`fee\` but
**not** \`month_end\`. What does the last line print?

~~~python
class Account:
    def __init__(self, balance):
        self.balance = balance

    def fee(self):
        return 2

    def month_end(self):
        self.balance -= self.fee()
        return self.balance


class StudentAccount(Account):
    def fee(self):
        return 0


a = Account(100)
st = StudentAccount(100)
print(a.month_end(), st.month_end())
~~~`,
      answer: md`It prints **98 100**.

The tempting wrong answer is \`98 98\`, from reasoning like: "\`month_end\` is written in \`Account\`,
so it calls \`Account\`'s \`fee\`." But you already know from Py.1 how to decide this — ask *what is
\`self\`?*

\`st.month_end()\` means \`Account.month_end(st)\` (the function is found on the parent, but it's called
with \`st\`). Inside it, \`self\` **is** \`st\`, a \`StudentAccount\`. So \`self.fee()\` starts a fresh
lookup on \`st\`: instance, then \`StudentAccount\` — found, returns 0. The lookup always starts from the
actual object, no matter which class the *calling* code was written in.

This is enormously useful. The parent can write the general procedure (\`month_end\`) once and leave
"hooks" (\`fee\`) that each child fills in its own way. You'll use exactly this trick in a moment to
build the checking account's overdraft without copying \`withdraw\`.`,
    },
    {
      type: 'text',
      md: md`
## Overriding without copying: \`super()\`

Now the savings account's real rule: at most 3 withdrawals a month. We need to override \`withdraw\`.
Here is the version almost everyone writes first:

~~~python
class SavingsAccount(Account):
    def withdraw(self, amount):              # BROKEN: a copy wearing a disguise
        if self.withdrawals_this_month >= 3:
            raise ValueError("only 3 withdrawals per month")
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount
        self.withdrawals_this_month += 1
~~~

Spot what's missing? It forgot \`self.history.append(...)\`. Savings withdrawals now vanish from the
history — exactly the "rules drifting from data" break from Py.1, reborn. And even if you'd copied it
perfectly, you're back to the puzzle: the balance-checking logic now lives in two places.

Let's *derive* the fix rather than recall it. What does the savings rule actually add? One check
**before** an ordinary withdrawal, and one count **after** it. The middle part — "an ordinary
withdrawal" — already exists, correctly, in \`Account.withdraw\`. So the ideal code would say:

1. check the monthly limit;
2. *do whatever a normal account does to withdraw;*
3. bump the counter.

Step 2 is "call the parent's version of this method." But we can't write \`self.withdraw(amount)\` —
that finds *our own* \`withdraw\` (the child's, by the lookup rule from the ponder) and calls itself
forever. We need a way to say "start the lookup one level **above** me." That's \`super()\`:

~~~python
class SavingsAccount(Account):
    def withdraw(self, amount):
        if self.withdrawals_this_month >= 3:
            raise ValueError("only 3 withdrawals per month")
        super().withdraw(amount)             # the parent's withdraw, run on self
        self.withdrawals_this_month += 1
~~~

\`super().withdraw(amount)\` finds \`withdraw\` starting from the parent class, and runs it with the same
\`self\`. The balance check, the subtraction, the history — all of it happens in the one place it's
written. When compliance changes how withdrawals are recorded, this class gets the change for free.

One detail is doing quiet work: the counter goes up **after** \`super().withdraw\`. If the parent raises
"insufficient funds", Python leaves the method at that line, the counter never increments, and a
refused withdrawal doesn't use up one of your three. Order matters when you wrap a parent's method.

## \`super().__init__\`: the child's setup must include the parent's

The savings account needs two extra attributes: \`rate\` and \`withdrawals_this_month\`. They must be
created in \`__init__\`. But the moment the child defines its own \`__init__\`, it **overrides** the
parent's — and the parent's \`__init__\` is where \`owner\`, \`balance\`, and \`history\` get created. The
same derivation applies: "do what a normal account does to set up, then add my extras."

~~~python
class SavingsAccount(Account):
    def __init__(self, owner, balance=0, rate=0.02):
        super().__init__(owner, balance)     # parent sets owner, balance, history
        self.rate = rate                     # then the child adds its own
        self.withdrawals_this_month = 0
~~~

Convention: call \`super().__init__(...)\` **first**, so the object is a complete, valid \`Account\`
before the child starts adding to it. What happens if you forget it entirely? Predict before you look.
`,
    },
    {
      type: 'ponder',
      question: md`Someone writes a child class and forgets one line. Predict exactly what happens on
the last line — does it print something, or crash? If it crashes, with which error, and naming which
attribute?

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.history = []

    def deposit(self, amount):
        self.balance += amount
        self.history.append(("deposit", amount))


class CheckingAccount(Account):
    def __init__(self, owner, balance=0, overdraft_limit=100):
        self.overdraft_limit = overdraft_limit     # forgot super().__init__


c = CheckingAccount("Cara", 50)
print(c.overdraft_limit)
c.deposit(10)
~~~`,
      answer: md`\`print(c.overdraft_limit)\` works fine and prints **100**. Then \`c.deposit(10)\` crashes:

~~~python
AttributeError: 'CheckingAccount' object has no attribute 'balance'
~~~

Trace it. Creating \`c\` runs \`CheckingAccount.__init__\` — the child's, because it overrides the
parent's. That method sets exactly one attribute, \`overdraft_limit\`. \`Account.__init__\` **never runs**:
Python does not call the parent's \`__init__\` for you. So \`c\` has no \`owner\`, no \`balance\`, no
\`history\`. Notice also that \`"Cara"\` and \`50\` were passed in and silently thrown away.

The crash comes later, far from the actual mistake: \`deposit\` (inherited, working perfectly) runs
\`self.balance += amount\`, which must first *read* \`self.balance\`. Why \`balance\` and not \`history\`?
Because \`balance\` is the first missing attribute the method touches.

That distance between cause and symptom is what makes this bug nasty. The lesson: **whenever a child
defines \`__init__\`, its first line is almost always \`super().__init__(...)\`.** When you see an
\`AttributeError\` about an attribute you're *sure* the class sets, check for this first.`,
    },
    {
      type: 'example',
      title: 'both account types, finished — with no copied code',
      md: md`
Here is the real design. The parent gains one small "hook" method, \`can_withdraw\` — the same trick as
\`fee\` in the first ponder — so the checking account can change *the rule* without touching the
*procedure*. We also add \`apply_monthly\`, which a plain account does nothing with.

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

    def can_withdraw(self, amount):           # the hook: children may override
        return amount <= self.balance

    def withdraw(self, amount):
        if not self.can_withdraw(amount):     # self.can_withdraw -> the child's, if any
            raise ValueError("insufficient funds")
        self.balance -= amount
        self.history.append(("withdraw", amount))

    def apply_monthly(self):
        pass                                  # plain accounts: nothing happens

    def __repr__(self):
        return f"{type(self).__name__}(owner={self.owner!r}, balance={self.balance})"


class SavingsAccount(Account):
    def __init__(self, owner, balance=0, rate=0.02):
        super().__init__(owner, balance)
        self.rate = rate
        self.withdrawals_this_month = 0

    def withdraw(self, amount):
        if self.withdrawals_this_month >= 3:
            raise ValueError("only 3 withdrawals per month")
        super().withdraw(amount)
        self.withdrawals_this_month += 1

    def apply_monthly(self):
        interest = round(self.balance * self.rate)
        if interest > 0:
            self.deposit(interest)            # reuse deposit: history stays correct
        self.withdrawals_this_month = 0       # new month, fresh allowance


class CheckingAccount(Account):
    def __init__(self, owner, balance=0, overdraft_limit=100):
        super().__init__(owner, balance)
        self.overdraft_limit = overdraft_limit

    def can_withdraw(self, amount):           # override only the rule
        return amount <= self.balance + self.overdraft_limit

    def apply_monthly(self):
        if self.balance < 0:
            self.balance -= 5                 # overdrawn at month end: fee of 5
            self.history.append(("fee", 5))
~~~

Now drive it:

~~~python
s = SavingsAccount("Sam", 1000)
s.withdraw(100)
s.withdraw(100)
s.withdraw(100)
print(s.balance)                    # 700
# s.withdraw(100) here would raise: ValueError: only 3 withdrawals per month
s.apply_monthly()
print(s.balance)                    # 714   (2% of 700 is 14)
print(s.withdrawals_this_month)     # 0
print(s.history[-1])                # ('deposit', 14)

c = CheckingAccount("Cara", 50)
c.withdraw(120)
print(c.balance)                    # -70   (allowed: 120 <= 50 + 100)
# c.withdraw(40) here would raise: ValueError: insufficient funds  (40 > -70 + 100)
c.apply_monthly()
print(c)                            # CheckingAccount(owner='Cara', balance=-75)
~~~

Count what each child actually wrote. \`CheckingAccount\` has **no** \`withdraw\` of its own: the parent's
\`withdraw\` runs, calls \`self.can_withdraw\`, and — because \`self\` is Cara's checking account — gets the
overdraft rule. \`SavingsAccount\` wraps the parent's \`withdraw\` with \`super()\` instead of copying it.
The balance check, the subtraction, and the history are each written **exactly once**, in \`Account\`.
That's the puzzle solved: the compliance change is a one-place edit again.

And look at \`print(c)\`: \`__repr__\` was only written in \`Account\`, but \`type(self).__name__\` asks
the *actual object* for its class, so it prints \`CheckingAccount\`. Same \`self\` rule, one more time.
`,
    },
    {
      type: 'text',
      md: md`
## Asking about family: \`isinstance\`, \`issubclass\`, and the lookup order

Two built-in functions let you ask about the family tree:

~~~python
s = SavingsAccount("Sam", 1000)

print(isinstance(s, SavingsAccount))   # True
print(isinstance(s, Account))          # True  — a savings account IS an account
print(isinstance(s, CheckingAccount))  # False — siblings aren't related that way

print(issubclass(SavingsAccount, Account))   # True
print(issubclass(Account, SavingsAccount))   # False — the parent isn't a kind of child
print(issubclass(Account, Account))          # True  — every class counts as its own subclass
~~~

\`isinstance(obj, C)\` asks "is this object a C, or a C's descendant?" \`issubclass(A, B)\` asks the same
about two classes. The second line is the one to internalise: code that expects an \`Account\` will
happily accept a \`SavingsAccount\`, because it *is* one.

Every class also has an ordered list of where Python will look for a name. It's called the **method
resolution order**, or **MRO**, and you can print it:

~~~python
print(SavingsAccount.__mro__)
# (<class '__main__.SavingsAccount'>, <class '__main__.Account'>, <class 'object'>)
~~~

Read it left to right: that's the lookup path. First the class itself, then its parent, then
\`object\` — the ultimate ancestor of every Python class, which is where default behaviours like the
ugly \`<... object at 0x...>\` printing come from. Chains can be longer (\`class Youth(SavingsAccount)\`
would put \`Youth\` at the front), and \`super()\` simply means "continue along this list from the step
after mine." Python also allows a class to have *several* parents, which makes the MRO more
interesting; you won't need that for a long time, but now you know the word when you meet it.

## Polymorphism: one loop, many kinds of object

At the end of each month the bank must run every account's monthly routine. Without the design above,
you'd write this:

~~~python
def month_end(accounts):                     # the version we're avoiding
    for a in accounts:
        if isinstance(a, SavingsAccount):
            ...interest code...
        elif isinstance(a, CheckingAccount):
            ...fee code...
~~~

Every new account type means editing this function — and every other function shaped like it. The
rules for savings accounts would live partly in the class and partly out here. That's Py.1's "rules
drifting from data" problem yet again.

Instead, each class already knows how to do its own month end. So:

~~~python
def month_end(accounts):
    for a in accounts:
        a.apply_monthly()


accounts = [
    SavingsAccount("Sam", 1000),
    CheckingAccount("Cara", -40),
    Account("Al", 10),
]
month_end(accounts)
print(accounts)
# [SavingsAccount(owner='Sam', balance=1020), CheckingAccount(owner='Cara', balance=-45),
#  Account(owner='Al', balance=10)]
~~~

One line, \`a.apply_monthly()\`, does three different things depending on what \`a\` is. That's
**polymorphism** (Greek for "many shapes"): *the same call works on different types, and each type
responds in its own way.* \`month_end\` never needs to change when you invent a fourth account type — you
just give the new class its own \`apply_monthly\`.
`,
    },
    {
      type: 'example',
      title: 'duck typing — month_end works on things that are not accounts at all',
      md: md`
Here's the surprising part. \`month_end\` never checks that its items are accounts. It just calls
\`a.apply_monthly()\`. So what happens if we hand it something that *isn't* an \`Account\`, but *does*
have that method?

~~~python
class Subscription:                     # NOT a child of Account
    def __init__(self, name, fee):
        self.name = name
        self.fee = fee
        self.months_paid = 0

    def apply_monthly(self):
        self.months_paid += 1

    def __repr__(self):
        return f"Subscription({self.name!r}, paid {self.months_paid} months)"


things = [SavingsAccount("Sam", 1000), Subscription("gym", 30)]
month_end(things)
month_end(things)
print(things)
# [SavingsAccount(owner='Sam', balance=1040), Subscription('gym', paid 2 months)]
print(isinstance(things[1], Account))    # False — and nobody minded
~~~

It just works. Python doesn't ask "are you an Account?" when you call a method; it asks "do you *have*
a method called \`apply_monthly\`?" at the moment of the call. This is called **duck typing**, after
the saying: *if it walks like a duck and quacks like a duck, it's a duck.* Python cares about what an
object can **do**, not what it's officially **called**.

(Check the arithmetic: 1000 becomes 1020 in the first month, then 2% of 1020 is 20.4, which rounds
to 20, giving 1040.)

The flip side: hand it something *without* the method and you find out only when the loop reaches it.

~~~python
month_end([Subscription("music", 10), "not an account"])
# AttributeError: 'str' object has no attribute 'apply_monthly'
~~~

You've been relying on duck typing since your first week of Python without knowing it. \`for x in
something\` works on lists, strings, dicts, files, and \`range\` — not because they share a parent class,
but because each of them knows how to hand out items one at a time. \`len(x)\` works on anything that
knows its own length. Duck typing is the reason one function can be so broadly useful.

So inheritance is **one** way to get polymorphism — but in Python, not the only way, and often not
the lightest.
`,
    },
    {
      type: 'text',
      md: md`
## Composition: "has-a"

Inheritance models **is-a**: a savings account *is an* account. Plenty of relationships aren't like
that. A car **has an** engine. It isn't one — you wouldn't say "a car is a kind of engine." When one
object *contains* another and uses it to do part of its job, that's **composition**: you store the
other object as an attribute.

~~~python
class Engine:
    def __init__(self, horsepower):
        self.horsepower = horsepower
        self.running = False

    def start(self):
        self.running = True


class Car:
    def __init__(self, model, horsepower):
        self.model = model
        self.engine = Engine(horsepower)     # the car HAS an engine

    def start(self):
        self.engine.start()                  # the car delegates to its part
        return f"{self.model} started ({self.engine.horsepower} hp)"


car = Car("Roadster", 180)
print(car.start())           # Roadster started (180 hp)
print(car.engine.running)    # True
~~~

The \`Car\` exposes the operations that make sense for a car (\`start\`) and uses the engine
internally — it **delegates** the work. And because the engine is just an attribute, you can swap it
for a different object that has a \`start\` method — an electric motor, say — without touching the
\`Car\` class at all. (Duck typing again: the car only needs its part to be able to \`start()\`.)

Composition sounds modest. Its real value shows up when you use inheritance where "is-a" *isn't* true.

## When inheritance goes wrong: a stack that isn't

A **stack** is a pile with strict rules: you may only add to the top (\`push\`), take from the top
(\`pop\`), or look at the top (\`peek\`). Think of a stack of plates. Stacks are everywhere — your
browser's back button, undo in an editor, Python's own function calls.

A list already has \`append\` and \`pop\` at the end. So a tempting shortcut:

~~~python
class Stack(list):
    def push(self, item):
        self.append(item)

    def peek(self):
        return self[-1]


s = Stack()
s.push(1)
s.push(2)
print(s.peek())    # 2
print(s.pop())     # 2   (inherited from list)
~~~

Three lines of code and it all works. What's wrong with it?
`,
    },
    {
      type: 'ponder',
      question: md`A colleague uses your \`Stack(list)\` class. Predict both printed lines — and then
say which of these calls a real stack should never have allowed:

~~~python
s = Stack()
s.push(1)
s.push(2)
s.push(3)
s.insert(0, 99)
s[1] = 42
print(s)
print(s.pop(), s.peek())
~~~`,
      answer: md`It prints:

~~~python
[99, 42, 2, 3]
3 2
~~~

\`insert(0, 99)\` slipped an item in at the **bottom**, and \`s[1] = 42\` **overwrote** an item in the
middle, replacing the 1. Neither is a stack operation — the whole point of a stack is that only the top
is reachable. No error, no warning: your "stack" silently stopped being one.

The cause is that inheritance gives the child **everything** the parent has. By writing
\`class Stack(list)\`, you promised "a Stack *is a* list, usable anywhere a list is." So it has every list
method: \`insert\`, \`sort\`, \`reverse\`, \`remove\`, indexing, slicing, \`+\` (which, for bonus confusion,
returns a plain \`list\`, not a \`Stack\`). You wanted to *reuse* a few of list's behaviours, but you
*advertised* all of them.

This is the **leaky base class** problem: the parent's whole interface leaks through into the child,
including the parts that break the child's rules. Its twin is the **fragile base class** problem: the
child depends on how the parent works inside, so a change to the parent can quietly break the child.
Both come from the same mistake — using inheritance for "I want to reuse some code" when the honest
relationship is "I want to *use* a list internally."`,
    },
    {
      type: 'text',
      md: md`
## The fix: a stack that *has* a list

~~~python
class Stack:
    def __init__(self):
        self._items = []                 # the stack HAS a list

    def push(self, item):
        self._items.append(item)

    def pop(self):
        if not self._items:
            raise IndexError("pop from empty stack")
        return self._items.pop()

    def peek(self):
        return self._items[-1]

    def __len__(self):
        return len(self._items)


s = Stack()
s.push(1)
s.push(2)
s.push(3)
print(s.pop(), s.peek(), len(s))    # 3 2 2
s.insert(0, 99)
# AttributeError: 'Stack' object has no attribute 'insert'
~~~

Now the stack offers exactly four operations and nothing else. Two new details:

- The leading underscore in \`_items\` is a Python **convention** meaning "internal — don't touch this
  from outside the class." Python doesn't enforce it (you *can* write \`s._items.insert(0, 99)\`), but
  anyone who does has clearly broken the rules on purpose rather than by accident.
- \`__len__\` is another double-underscore method Python calls for you: \`len(s)\` runs \`s.__len__()\`.
  That's how \`len\` works on lists, strings, and dicts too — duck typing again. Lesson Py.3 covers this
  family.

The cost of composition is that you write small **forwarding** methods (\`pop\` just calls
\`self._items.pop()\`). That is the price of choosing, deliberately, which operations to expose. It's
usually a bargain.

## The rule of thumb, stated honestly

You'll hear **"favour composition over inheritance"** from experienced programmers. It's a rule of
thumb, not a law, and it's worth knowing exactly what it's protecting you from: the leaky and fragile
base class problems, and deep family trees where understanding one class means reading five.

Use this test: **is "B is an A" true *everywhere*?** Could you hand a B to any code that expects an A,
and would every single A operation still make sense on a B?

- \`SavingsAccount\` / \`Account\`: yes. Every account operation — deposit, withdraw, apply_monthly — makes
  sense on a savings account. **Inheritance is right.**
- \`Stack\` / \`list\`: no. \`insert(0, x)\` is a valid list operation and a broken stack operation.
  **Composition.**
- \`Car\` / \`Engine\`: the sentence "a car is an engine" is false on its face. **Composition.**

When the answer is honestly yes, inheritance is the clearer choice, and it's used heavily in real code
you'll meet soon. In PyTorch, for example, every neural network layer you write will be a class that
inherits from a base class called \`nn.Module\` — because your layer genuinely *is* a module, and the
base class provides dozens of operations that must work on every one.

## Abstract base classes: a promise children must keep

One last loose end. In our design, \`Account.apply_monthly\` does nothing. What if a colleague writes a
new account type and *forgets* to write \`apply_monthly\` — or misspells it? The plain account's empty
version gets used, and interest silently never gets paid.

Sometimes you want a parent class that exists only to state a promise: "every child **must** provide
these methods." Python's \`abc\` module (short for *abstract base classes*) does exactly that:

~~~python
from abc import ABC, abstractmethod


class MonthlyItem(ABC):
    @abstractmethod
    def apply_monthly(self):
        ...


class Membership(MonthlyItem):
    def apply_monthly(self):
        return "charged"


class Broken(MonthlyItem):
    def apply_montly(self):          # typo!
        return "charged"


print(Membership().apply_monthly())   # charged
Broken()
# TypeError: Can't instantiate abstract class Broken without an implementation
#            for abstract method 'apply_monthly'
~~~

Line by line: inheriting from \`ABC\` marks \`MonthlyItem\` as abstract. \`@abstractmethod\` is a
**decorator** — a label written on the line above a \`def\` that changes how the function is treated
(a later lesson explains decorators properly; for now read it as a tag). It means "children must
override this." The \`...\` is a placeholder body that does nothing.

Python enforces the promise when you try to **create an object**: any class that still has an
unimplemented abstract method — including \`MonthlyItem\` itself — refuses to be instantiated. The typo
is caught the moment someone writes \`Broken()\`, instead of in next month's missing interest.
Compare with duck typing: duck typing checks "can you do this?" at the last possible moment; an
abstract base class checks it up front, and names exactly what's missing.

## What you now own

1. **Why inheritance exists:** copied code means every fix must be made in every copy. Inheritance
   lets shared behaviour live in one place.
2. **"Is-a", in code:** \`class Child(Parent):\` — the child inherits everything, can **add** methods,
   and can **override** them. Lookup goes instance, then class, then parent, up the chain (the
   **MRO**), never down.
3. **\`self\` still decides:** a parent method calling \`self.method()\` gets the *child's* version when
   \`self\` is a child. That's how "hooks" like \`can_withdraw\` work.
4. **\`super()\`, derived:** \`self.withdraw\` would find your own override; \`super().withdraw\` continues the
   lookup from the parent. Use \`super().__init__(...)\` first in every child \`__init__\`, or the
   parent's attributes never get created.
5. **\`isinstance\` / \`issubclass\`** for asking about the family tree.
6. **Polymorphism and duck typing:** one call, \`a.apply_monthly()\`, working on many types — and in
   Python, the object only needs the method, not the family tree.
7. **Composition ("has-a")** and the **leaky / fragile base class** problems it avoids —
   \`Stack(list)\` is the cautionary tale. Favour composition; inherit when "is-a" is true everywhere.
8. **Abstract base classes** as a promise, enforced when an object is created.

Next: Python's double-underscore methods and dataclasses — how to make your own objects work with
\`len\`, \`==\`, \`print\`, and \`for\` just like the built-in ones.
`,
    },
  ],
  questions: [
    {
      id: 'py-l2-q1',
      kind: 'mcq',
      prompt: md`Which pair is the best fit for inheritance — that is, where \`class B(A):\` is honest
because "B is an A" holds everywhere?`,
      options: [
        md`\`Stack\` and \`list\` — a stack is built from a list`,
        md`\`SavingsAccount\` and \`Account\` — every account operation makes sense on a savings account`,
        md`\`Car\` and \`Engine\` — a car needs everything an engine does`,
        md`\`Library\` and \`Book\` — a library is full of books`,
      ],
      answer: 1,
      explain: md`A savings account genuinely *is* an account: you can pass one to any code expecting an
\`Account\` and deposit, withdraw, and apply_monthly all still make sense. Option A is the most tempting
because a stack really is *implemented* with a list — but "built from" is has-a, and inheriting leaks
\`insert\`, \`sort\`, and indexing, which break the stack's rules. C and D both describe containment: a car
*has* an engine, a library *has* books. Those are composition.`,
    },
    {
      id: 'py-l2-q2',
      kind: 'numeric',
      prompt: md`What does this print? Trace which class each method call lands in.

~~~python
class A:
    def step(self):
        return 1

    def run(self):
        return self.step() * 10


class B(A):
    def step(self):
        return super().step() + 2


class C(B):
    def run(self):
        return super().run() + 5


print(C().run())
~~~`,
      answer: 35,
      tolerance: 0,
      explain: md`\`C().run()\` finds \`C.run\`, which calls \`super().run()\` — \`A.run\` (B has no \`run\`),
still with \`self\` being the C object. Inside \`A.run\`, \`self.step()\` starts a fresh lookup from C:
C has no \`step\`, B does. \`B.step\` calls \`super().step()\` → \`A.step\` returns 1, plus 2 is **3**.
Back in \`A.run\`: 3 × 10 = 30. Back in \`C.run\`: 30 + 5 = **35**. If you got 15, you let \`A.run\` call
\`A.step\` — the lookup always starts from the real object, never from where the code was written.`,
    },
    {
      id: 'py-l2-q3',
      kind: 'mcq',
      prompt: md`Given \`class SavingsAccount(Account)\` and \`s = SavingsAccount("Sam", 100)\`, which
expression is **False**?`,
      options: [
        md`\`isinstance(s, Account)\``,
        md`\`isinstance(s, object)\``,
        md`\`issubclass(Account, SavingsAccount)\``,
        md`\`issubclass(SavingsAccount, SavingsAccount)\``,
      ],
      answer: 2,
      explain: md`The relationship runs one way: a savings account is an account, but an account is
not necessarily a savings account — so C is False. A is True because \`isinstance\` includes
descendants (that's the whole point of "is-a"). B is True because every class ultimately inherits
from \`object\`. D is the tempting trap: it *looks* like it should be False, but Python counts every
class as a subclass of itself.`,
    },
    {
      id: 'py-l2-q4',
      kind: 'numeric',
      prompt: md`This version refuses a withdrawal silently instead of raising. What does it print?

~~~python
class Account:
    def __init__(self, balance):
        self.balance = balance

    def limit(self):
        return 0

    def withdraw(self, amount):
        if amount <= self.balance + self.limit():
            self.balance -= amount


class Checking(Account):
    def limit(self):
        return 100


c = Checking(50)
c.withdraw(120)
c.withdraw(40)
c.withdraw(30)
print(c.balance)
~~~`,
      answer: -100,
      tolerance: 0,
      explain: md`\`self.limit()\` inside the parent's \`withdraw\` finds \`Checking.limit\` → 100. Start 50.
Withdraw 120: 120 ≤ 50 + 100 = 150, allowed → **-70**. Withdraw 40: 40 ≤ -70 + 100 = 30? No, refused.
Withdraw 30: 30 ≤ 30, allowed (the check is ≤, not <) → **-100**. Answers of 50 come from using the
parent's \`limit\` of 0; answers of -70 come from missing that the boundary case is allowed.`,
    },
    {
      id: 'py-l2-q5',
      kind: 'mcq',
      prompt: md`\`class Stack(list)\` with added \`push\` and \`peek\` methods passes all its tests. What is
the real problem with it?`,
      options: [
        md`It's slower than a composition-based stack, because inheritance adds lookup overhead`,
        md`It exposes every list operation — \`insert\`, indexing, \`sort\` — so callers can break the stack's top-only rule without any error`,
        md`\`pop\` won't work, because the child didn't define it`,
        md`Python forbids inheriting from built-in types like \`list\``,
      ],
      answer: 1,
      explain: md`Inheritance advertises the parent's *entire* interface, so the "stack" accepts
operations that make it stop being a stack — the leaky base class problem. A is tempting because it
sounds technical, but the performance difference is negligible and beside the point; the problem is
correctness. C is wrong because \`pop\` is inherited from list (that's why the shortcut is tempting).
D is simply false — you *can* subclass \`list\`, which is exactly why the mistake is so easy to make.`,
    },
    {
      id: 'py-l2-q6',
      kind: 'numeric',
      prompt: md`What does this print? Watch the order of lines in \`Top.__init__\`.

~~~python
class Base:
    def __init__(self):
        self.log = ["base"]


class Mid(Base):
    def __init__(self):
        super().__init__()
        self.log.append("mid")


class Top(Mid):
    def __init__(self):
        self.log = ["top"]
        super().__init__()


print(len(Top().log))
~~~`,
      answer: 2,
      tolerance: 0,
      explain: md`\`Top.__init__\` sets \`self.log = ["top"]\`, then calls \`super().__init__()\` → \`Mid.__init__\`,
which calls \`Base.__init__\` — and that **replaces** \`self.log\` with a brand-new list \`["base"]\`. The
"top" entry is gone. Then \`Mid\` appends "mid": \`["base", "mid"]\`, length **2**. The tempting answer 3
assumes each level adds to one growing list. This is why the convention is to call
\`super().__init__()\` *first*: otherwise the parent's setup can overwrite what the child just did.`,
    },
    {
      id: 'py-l2-q7',
      kind: 'mcq',
      prompt: md`\`MonthlyItem(ABC)\` declares \`apply_monthly\` with \`@abstractmethod\`. A subclass
\`Broken(MonthlyItem)\` misspells it as \`apply_montly\`. When does Python complain?`,
      options: [
        md`Immediately, when the \`class Broken\` statement runs`,
        md`When you try to create an object with \`Broken()\` — a \`TypeError\` naming the missing method`,
        md`Only when some code calls \`apply_monthly\` on a Broken object — an \`AttributeError\``,
        md`Never — abstract methods are just documentation`,
      ],
      answer: 1,
      explain: md`The check happens at instantiation: a class with any unimplemented abstract method
refuses to create objects, with \`TypeError: Can't instantiate abstract class Broken...\`. A is tempting
because it would be even earlier, but Python allows the class to be *defined* — it might be meant as
another abstract parent. C describes what happens with plain duck typing and no ABC — the late failure
the ABC exists to prevent. D is how it works in some languages' comments, not Python's \`abc\` module.`,
    },
    {
      id: 'py-l2-q8',
      kind: 'numeric',
      prompt: md`A savings account that allows 3 withdrawals, refusing silently. What does it print?

~~~python
class Account:
    def __init__(self, balance):
        self.balance = balance

    def withdraw(self, amount):
        if amount <= self.balance:
            self.balance -= amount


class Savings(Account):
    def __init__(self, balance):
        super().__init__(balance)
        self.count = 0

    def withdraw(self, amount):
        if self.count < 3:
            super().withdraw(amount)
            self.count += 1


s = Savings(100)
for amount in [30, 200, 30, 30, 30]:
    s.withdraw(amount)
print(s.balance)
~~~`,
      answer: 40,
      tolerance: 0,
      explain: md`30 → balance 70, count 1. 200 → the *parent* refuses it silently, but \`Savings.withdraw\`
doesn't know that, so count still becomes 2 — a refused withdrawal used up an allowance! 30 → 40,
count 3. The last two are refused by the limit. Balance **40**. If you said 10, you assumed only
successful withdrawals count. This is exactly why the lesson's version lets the parent *raise*: an
exception stops \`self.withdrawals_this_month += 1\` from ever running.`,
    },
    {
      id: 'py-l2-q9',
      kind: 'written',
      prompt: md`**Derive, don't recall.** You're given the lesson's \`Account\` class (with \`deposit\`,
\`can_withdraw\`, \`withdraw\`, \`apply_monthly\`). On paper, write \`SavingsAccount(Account)\` so that:
it takes a \`rate\` (default 0.02); it allows at most 3 withdrawals per month; \`apply_monthly\` adds
interest (rounded to a whole number) and resets the counter. **You may not copy any code from
\`Account\`.** Then answer: (a) why must \`__init__\` call \`super().__init__\`? (b) why does
\`withdraw\` call \`super().withdraw(amount)\` rather than \`self.withdraw(amount)\`? (c) why does the
counter increment come *after* that call?`,
      rubric: md`**Model answer:**

~~~python
class SavingsAccount(Account):
    def __init__(self, owner, balance=0, rate=0.02):
        super().__init__(owner, balance)
        self.rate = rate
        self.withdrawals_this_month = 0

    def withdraw(self, amount):
        if self.withdrawals_this_month >= 3:
            raise ValueError("only 3 withdrawals per month")
        super().withdraw(amount)
        self.withdrawals_this_month += 1

    def apply_monthly(self):
        interest = round(self.balance * self.rate)
        if interest > 0:
            self.deposit(interest)
        self.withdrawals_this_month = 0
~~~

**(a)** Defining \`__init__\` in the child overrides the parent's, so \`Account.__init__\` would never run
and \`owner\`, \`balance\`, \`history\` would never exist — the first inherited method to touch them
raises \`AttributeError\`.

**(b)** \`self.withdraw\` looks up from the actual object, finds the child's own \`withdraw\`, and calls
itself forever (Python eventually stops it with \`RecursionError\`). \`super()\` starts the lookup one
step up the MRO, at \`Account\`.

**(c)** If the parent raises "insufficient funds", the method stops there and the refused withdrawal
doesn't consume one of the three.

Full credit: working code with **no** duplicated balance-check or history logic; interest added via
\`self.deposit\` (or equivalently recorded in history); all three explanations in terms of lookup and
\`self\`, not "because that's the syntax." Re-implementing the balance check inside the child is the
most common partial answer — it works, and it's exactly the copy the lesson set out to remove.`,
    },
    {
      id: 'py-l2-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid who has just learned classes asks: "What's the
difference between a class being *another* class and a class *having* another class? And why is it a
bad idea to make a stack of plates be a list?" Explain with examples you invent. No jargon without a
kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **Is-a, made concrete** — e.g. a golden retriever *is a* dog: everything you can do with any dog
   (feed it, walk it, pet it) you can do with a golden retriever. So a GoldenRetriever class can start
   from the Dog class and add the extras (fetches especially well).
2. **Has-a, made concrete** — a bicycle *has* wheels, but a bicycle is not a wheel. You wouldn't say "roll
   the bicycle down the hill on its side like a wheel." So the Bicycle class *keeps* wheels inside it and
   uses them, rather than *being* one.
3. **The stack of plates** — with a real stack of plates you only ever take from or add to the top. A
   list lets you do anything: shove a plate in at the bottom, swap one in the middle. If the stack *is a*
   list, it gets all those powers too, and someone will use them and topple the pile. If the stack
   *has* a list hidden inside, it can offer just "put on top", "take from top", "look at top."
4. **The general lesson** in kid terms: when you say "X is a Y", X gets *all* of Y's abilities — even
   the ones you didn't want.
5. **Jargon audit:** "inheritance", "composition", "subclass", "interface", "polymorphism",
   "encapsulation" used without a kid-level translation = partial credit at best. Using the words *after*
   explaining them is fine and even good.`,
    },
    {
      id: 'py-l2-q11',
      kind: 'written',
      prompt: md`**Design on paper.** A clinic needs a waiting-room \`Queue\`: patients \`join\` at the back,
the doctor calls \`next_patient\` to take from the front, and \`len(queue)\` gives how many are waiting.
Nobody may jump the queue. (1) Write the class using composition. (2) Explain, in two or three
sentences, what would go wrong if you wrote \`class Queue(list)\` instead. (3) Write a separate
\`Ticket\` class — *not* related to \`Queue\` or \`Account\` by inheritance — that has an
\`apply_monthly\` method, and explain why the lesson's \`month_end\` function would accept it.`,
      rubric: md`**(1) Model code:**

~~~python
class Queue:
    def __init__(self):
        self._patients = []              # has-a list, underscore = internal

    def join(self, name):
        self._patients.append(name)      # back of the line

    def next_patient(self):
        if not self._patients:
            raise IndexError("nobody is waiting")
        return self._patients.pop(0)     # front of the line

    def __len__(self):
        return len(self._patients)
~~~

**(2)** Inheriting from list would give \`Queue\` every list method: \`insert(0, name)\` lets someone
jump to the front, \`sort()\` reorders everyone, \`queue[3] = "x"\` replaces a patient. None raise
errors, so the no-queue-jumping rule silently breaks — the leaky base class problem.

**(3)**

~~~python
class Ticket:
    def __init__(self):
        self.months_valid = 0

    def apply_monthly(self):
        self.months_valid += 1
~~~

\`month_end\` only calls \`a.apply_monthly()\`; Python checks that the object *has* that method at the
moment of the call, not which class it belongs to. That's duck typing.

Full credit: composition with an internal list; empty-queue case handled; \`__len__\` so \`len()\` works;
a *specific* rule-breaking list operation named in (2); and "duck typing" explained in terms of what the
object can do, not its type.`,
    },
    {
      id: 'py-l2-q12',
      kind: 'written',
      prompt: md`**Find the bugs.** This child class has four separate bugs. For each, say what goes
wrong when it runs (the actual error or wrong value), and write the fix.

~~~python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.history = []

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount
        self.history.append(("withdraw", amount))


class Savings(Account):
    def __init__(self, owner, balance=0, rate=0.02):
        self.rate = rate

    def withdraw(self, amount):
        if self.count >= 3:
            raise ValueError("limit reached")
        Account.withdraw(amount)
        self.count += 1

    def apply_monthly(self):
        self.balance = self.balance * self.rate
~~~`,
      rubric: md`**Bug 1 — no \`super().__init__\`.** \`Savings.__init__\` overrides the parent's, so \`owner\`,
\`balance\`, \`history\` are never created. Any use of them raises \`AttributeError: 'Savings' object
has no attribute 'balance'\` (or \`history\`), and the owner and balance passed in are thrown away.
*Fix:* first line \`super().__init__(owner, balance)\`.

**Bug 2 — \`self.count\` never created.** The first \`withdraw\` raises \`AttributeError: 'Savings'
object has no attribute 'count'\`. *Fix:* \`self.count = 0\` in \`__init__\`.

**Bug 3 — \`Account.withdraw(amount)\` doesn't pass \`self\`.** Calling through the class means you must
supply \`self\` yourself (Py.1: \`obj.m(x)\` is \`Class.m(obj, x)\`). Here \`amount\` lands in the \`self\`
slot and the real \`amount\` is missing: \`TypeError: Account.withdraw() missing 1 required positional
argument: 'amount'\`. *Fix:* \`super().withdraw(amount)\` (preferred) or \`Account.withdraw(self, amount)\`.

**Bug 4 — \`apply_monthly\` replaces the balance with the interest.** 1000 becomes 20.0 instead of 1020.
*Fix:* add the interest, ideally through \`deposit\`-style logic so history records it:
\`self.balance += round(self.balance * self.rate)\`.

**Corrected:**

~~~python
class Savings(Account):
    def __init__(self, owner, balance=0, rate=0.02):
        super().__init__(owner, balance)
        self.rate = rate
        self.count = 0

    def withdraw(self, amount):
        if self.count >= 3:
            raise ValueError("limit reached")
        super().withdraw(amount)
        self.count += 1

    def apply_monthly(self):
        interest = round(self.balance * self.rate)
        self.balance += interest
        self.history.append(("interest", interest))
        self.count = 0
~~~

Full credit = all four bugs, each with the concrete failure it causes, and working fixes. Noticing that
\`apply_monthly\` should also reset the monthly counter is a bonus. Predicting the exact \`TypeError\` for
bug 3 shows you understand how \`self\` gets passed — the thread running through both lessons.`,
    },
  ],
}
