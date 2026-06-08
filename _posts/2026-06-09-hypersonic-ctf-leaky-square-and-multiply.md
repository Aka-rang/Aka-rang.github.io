---
title: "[Hypersonic CTF] Leaky Square-and-Multiply Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, crypto]
tags: [writeup, crypto, rsa, side-channel]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "Leaky Square-and-Multiply"
challenge_category: crypto
toc: true
comments: false
---

## Challenge Files

- `chall.py`: RSA 복호화 함수
- `output.txt`: 공개키 `N`, `e`와 암호문 `c`
- `trace.npy`: 복호화 과정에서 측정된 side-channel trace

## Vulnerability

`chall.py`의 복호화는 일반적인 square-and-multiply 방식이다.

```python
def modexp_leaky(base, exp, mod):
    result = 1
    for bit in bin(exp)[2:]:
        result = (result * result) % mod
        if bit == '1':
            result = (result * base) % mod
    return result
```

각 비트마다 square 연산은 항상 수행되고, 비트가 `1`일 때만 multiply 연산이 추가로 수행된다.

따라서 trace에서 연산 개수를 구분할 수 있으면 private exponent `d`의 모든 비트를 복구할 수 있다.

## Trace Analysis

`trace.npy`는 1차원 `float32` 배열이다.

```text
shape = (981730,)
dtype = float32
```

trace에 threshold를 적용하면 매우 규칙적인 run length가 나온다.

```text
threshold = 0.35

high run length = 220
low run length  = 25 or 135
```

해석은 다음과 같다.

- `high 220`: modular operation 1회
- `low 25`: square 직후 multiply가 이어짐
- `low 135`: 현재 비트 처리가 끝나고 다음 비트로 넘어감

즉,

- `square -> short gap -> multiply -> long gap`이면 bit `1`
- `square -> long gap`이면 bit `0`

## Solver

```python
import numpy as np
from pathlib import Path

arr = np.load("trace.npy")

threshold = 0.35
b = arr > threshold

idx = np.flatnonzero(b[1:] != b[:-1]) + 1
runs = np.diff(np.r_[0, idx, len(b)])
vals = b[np.r_[0, idx]]

assert vals[0] == True
assert vals[-1] == False
assert all(vals[::2])
assert not any(vals[1::2])

low_lens = runs[1::2]

bits = []
op = 0

while op < len(low_lens):
    gap = int(low_lens[op])

    if gap < 80:
        bits.append("1")
        op += 2
    else:
        bits.append("0")
        op += 1

d = int("".join(bits), 2)

ns = {}
exec(Path("output.txt").read_text(), ns)

N = ns["N"]
e = ns["e"]
c = ns["c"]

m = pow(c, d, N)
flag = m.to_bytes((m.bit_length() + 7) // 8, "big")

print(flag.decode())
print(pow(m, e, N) == c)
```

## Result

복구된 지수는 2047 bit이고, 복호화 결과를 다시 `e = 65537`로 암호화했을 때 원래 암호문과 일치한다.

```text
pow(m, e, N) == c
True
```

Flag:

```text
hs{squ4re_4nd_mult1ply_l34ks_3v3ry_b1t_0f_y0ur_pr1v4t3_d}
```
