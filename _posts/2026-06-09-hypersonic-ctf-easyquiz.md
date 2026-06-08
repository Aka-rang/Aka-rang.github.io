---
title: "[Hypersonic CTF] EasyQuiz Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, misc]
tags: [writeup, misc, math]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "EasyQuiz"
challenge_category: misc
toc: true
comments: false
---

## Challenge

`chall.py` has three independent quiz branches. Each successful branch prints one piece of the flag.

```python
inp = int(input())
```

The final flag is assembled from the three outputs:

```text
HS{70927730afde31916a2f22a1385a5d2343377937a7c3cf1a796b78d05b7d070e50b8c5526395e3d968da2ca26f198476}
```

## Part 1

The service asks five times for positive integers `x, y, z` such that:

```python
x/(y+z) + y/(x+z) + z/(x+y) == N
```

where `N` is randomly chosen from `4..50`.

At first this looks like a hard Diophantine equation, but the check is done with Python `/`, so the comparison is a `float` comparison. We can abuse floating point rounding instead of finding exact integer solutions.

Set:

```text
y = z = S
x = aS
```

Then the expression becomes:

```text
a/2 + 2/(a+1) = N
```

Solving the quadratic gives:

```text
a = (2N - 1 + sqrt(4N^2 + 4N - 15)) / 2
```

Use a huge scale such as `S = 10^40`, compute `x ~= aS`, then binary-search near that value until Python's floating point evaluation is exactly `N.0`.

The solver handles every `N` in `4..50`:

```python
def quiz1_answer(n, exp=40):
    s = 10**exp
    disc = Decimal(4 * n * n + 4 * n - 15)
    alpha = (Decimal(2 * n - 1) + disc.sqrt()) / 2
    root = int((alpha * Decimal(s)).to_integral_value(rounding=ROUND_FLOOR))

    lo = root - 10**25
    hi = root + 10**25
    while quiz1_value(lo, s) >= n:
        lo -= (hi - lo) * 2
    while quiz1_value(hi, s) < n:
        hi += (hi - lo) * 2

    a, b = lo, hi
    while a + 1 < b:
        m = (a + b) // 2
        if quiz1_value(m, s) >= n:
            b = m
        else:
            a = m

    for off in range(-1000, 1001):
        x = b + off
        if quiz1_value(x, s) == n:
            return x, s, s
```

This gives the first flag part:

```text
HS{70927730afde31916a2f22a1385a5d23
```

## Part 2

The second branch does this:

```python
M = ast.literal_eval(input())
n = len(M)
M = Matrix(ZZ, M)
minkowski_bound = sqrt(n)*abs(det(M))**(1/n)

if norm(M.BKZ(block_size=30)[0]) > minkowski_bound:
    print("...")
```

There are two bugs:

1. `n = len(M)` is computed before converting `M` to a Sage matrix.
2. Sage creates a sparse matrix when the input is a dictionary of `(row, col): value` entries.

Payload:

```python
{(0, 0): 100, (0, 1): 0, (1, 0): 0, (1, 1): 100}
```

This makes `len(M) == 4`, while Sage converts it into a sparse `2x2` integer matrix. On the remote service, `Matrix_integer_sparse` has no `BKZ` method, so the program crashes. The unhandled traceback includes the actual source line containing the second flag piece:

```text
43377937a7c3cf1a796b78d05b7d070e
```

## Part 3

The third branch checks:

```python
assert len(set(number)) > 21
assert len(set([hash(i) for i in number])) == 1
assert hash(number[0]) == 42
assert all(abs(i) < 2424242 for i in number)
assert all(int(i.real) == i.real and int(i.imag) == i.imag for i in number if isinstance(i, complex))
```

So we need at least 22 distinct numbers, all with hash `42`.

For floats, CPython hashes numeric values using their exact integer ratio modulo:

```python
sys.hash_info.modulus == 2**61 - 1
```

Since `2^61 == 1 mod (2^61 - 1)`, values of the form:

```text
21 / 2^(60 + 61k)
```

hash to `42`. This gives many tiny distinct floats under the size bound.

For complex numbers, CPython combines the real and imaginary hashes using:

```python
sys.hash_info.imag == 1000003
```

So Gaussian integers such as these also hash to `42`:

```python
(2000048-1j)
(2000048-2j)
(-999961+1j)
(-1999964+2j)
```

The final payload is:

```python
[2.8519623430573e-311, 6.576177431279442e-293, 1.5163632757264568e-274, 3.4964956587622276e-256, 8.062370071502912e-238, 1.85905596670687e-219, 4.286691204568042e-201, 9.884436946711048e-183, 2.279195983358722e-164, 5.25546812485564e-146, 1.2118284435843778e-127, 2.794286145005349e-109, 6.443185173203266e-91, 1.4856973488700075e-72, 3.4257848456992254e-54, 7.899322037525772e-36, 1.8214596497756474e-17, 42.0, (2000048-1j), (2000048-2j), (-999961+1j), (-1999964+2j)]
```

This gives the last flag part:

```text
50b8c5526395e3d968da2ca26f198476}
```

## Exploit

The full solver is in `solve_easyquiz.py`.

Run:

```powershell
$env:PYTHONIOENCODING='utf-8'
& 'C:\Users\한혁\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .\solve_easyquiz.py --host 15.165.245.192 --port 1337
```

Remote output:

```text
HS{70927730afde31916a2f22a1385a5d23
43377937a7c3cf1a796b78d05b7d070e
50b8c5526395e3d968da2ca26f198476}
```

Final flag:

```text
HS{70927730afde31916a2f22a1385a5d2343377937a7c3cf1a796b78d05b7d070e50b8c5526395e3d968da2ca26f198476}
```
