---
title: "[Hypersonic CTF] No.. This is Terrible Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, reversing]
tags: [writeup, reversing]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "No.. This is Terrible"
challenge_category: reversing
toc: true
comments: false
---

## 개요

압축 파일 `for_user.zip` 안에는 Linux 64-bit ELF 실행 파일 `NoThisisTerrible`이 들어 있다.

```bash
$ file NoThisisTerrible
ELF 64-bit LSB pie executable, x86-64
```

실행하면 표준 입력에서 한 줄을 읽고 검증 결과에 따라 `Wrong` 또는 `Correct`를 출력한다.

```bash
$ printf 'test' | ./NoThisisTerrible
Wrong
```

## 정적 분석

문자열을 보면 Rust 런타임 문자열이 많이 보이고, challenge 관련 문자열은 아래 정도만 직접 드러난다.

```text
Wrong
Correct
failed to read input
```

`Correct` 문자열의 참조 지점을 추적하면 `0x16045` 근처에서 정답 출력 분기로 들어간다.

```asm
0001600c: test     rdx, rdx
0001600f: je       0x16045

00016011: lea      rdi, [rip - 0xf848] ; "Wrong\n"
...

00016045: lea      rdi, [rip - 0xf864] ; "Correct\n"
```

즉 `rdx == 0`이면 정답이다. 이 직전 루프는 계산 결과 배열과 정답 테이블을 xor/or로 비교한다.

## 입력 조건

입력 처리 루틴은 개행 문자 `\n`, `\r`을 제거한 뒤 길이가 `0x44`, 즉 68바이트인지 확인한다.

```asm
00015e4b: cmp      rcx, 0x44
00015e4f: jne      0x16011
```

길이가 맞으면 입력 바이트를 64-bit 정수 배열 `A[0..67]`에 넣는다.

그 뒤 `A[68..255]`는 입력과 무관하게 다음 공식으로 채운다.

```python
A[i] = ((i * i + 0x11) ^ (73 * i + 0x29)) & 0xff
```

## 핵심 알고리즘

검증 루틴은 길이 256 배열에 대해 NTT를 수행한다. 사용되는 모듈러는 다음 값이다.

```text
p = 0x3b800001 = 998244353
g = 3
n = 256
```

루틴 흐름은 다음과 같다.

```text
A = input bytes + deterministic padding
B = rodata에 들어 있는 고정 배열
T = rodata에 들어 있는 정답 배열

NTT(A)
NTT(B)
C[i] = A[i] * B[i] mod p
inverse_NTT(C)

C == T 이면 Correct
```

즉 검증은 다항식 convolution 비교다. `B`가 NTT 도메인에서 0을 만들지 않으면 역산 가능하다.

```text
NTT(A) = NTT(T) / NTT(B) mod p
A = inverse_NTT(NTT(T) / NTT(B))
```

바이너리에서 사용한 배열 위치는 다음과 같다.

```text
B table: 0x5fd0
T table: 0x6818
```

## 풀이 스크립트

```python
import struct
from pathlib import Path

P = 0x3b800001
G = 3
N = 256

data = Path("NoThisisTerrible").read_bytes()

def qwords(addr, n=N):
    return list(struct.unpack_from("<" + "Q" * n, data, addr))

def ntt(a, invert=False):
    a = a[:]
    n = len(a)

    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            a[i], a[j] = a[j], a[i]

    length = 2
    while length <= n:
        wlen = pow(G, (P - 1) // length, P)
        if invert:
            wlen = pow(wlen, P - 2, P)

        half = length // 2
        for i in range(0, n, length):
            w = 1
            for j in range(i, i + half):
                u = a[j]
                v = a[j + half] * w % P
                a[j] = (u + v) % P
                a[j + half] = (u - v) % P
                w = w * wlen % P

        length *= 2

    if invert:
        inv_n = pow(n, P - 2, P)
        a = [x * inv_n % P for x in a]

    return a

B = qwords(0x5fd0)
T = qwords(0x6818)

FB = ntt(B)
FT = ntt(T)

assert all(x != 0 for x in FB)

FA = [FT[i] * pow(FB[i], P - 2, P) % P for i in range(N)]
A = ntt(FA, invert=True)

flag = bytes(A[:68]).decode()
print(flag)

for i in range(68, 256):
    expected = ((i * i + 0x11) ^ (73 * i + 0x29)) & 0xff
    assert A[i] == expected
```

실행 결과:

```text
HS{6ce247509eece08f6c5a7a72263b90a396ca6f3e738e29b90089b4c33a40490c}
```

## 검증

복구한 값을 바이너리에 넣으면 `Correct`가 출력된다.

```bash
$ echo 'HS{6ce247509eece08f6c5a7a72263b90a396ca6f3e738e29b90089b4c33a40490c}' | ./NoThisisTerrible
Correct
```

## Flag

```text
HS{6ce247509eece08f6c5a7a72263b90a396ca6f3e738e29b90089b4c33a40490c}
```
