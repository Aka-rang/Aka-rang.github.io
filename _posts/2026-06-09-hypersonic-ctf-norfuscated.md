---
title: "[Hypersonic CTF] NORfuscated Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, reversing]
tags: [writeup, reversing, obfuscation]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "NORfuscated"
challenge_category: reversing
toc: true
comments: false
---

## Challenge

배포 파일은 `for_user.zip` 하나였고, 압축을 풀면 `NORfuscated`라는 실행 파일이 나온다.

```text
for_user/
└── NORfuscated
```

파일 헤더를 확인하면 64-bit ELF 바이너리이다.

```text
7f 45 4c 46 02 01 01 ...
```

WSL에서 실행하면 플래그 입력을 요구한다.

```text
$ ./NORfuscated
Enter flag: Wrong!
```

## Initial Analysis

문자열을 확인하면 다음과 같은 출력 문자열이 보인다.

```text
Enter flag:
Wrong!
Correct!
```

또한 Rust 런타임 관련 문자열이 많이 남아 있어서 Rust로 빌드된 바이너리임을 알 수 있다.

```text
library/std/src/...
library/core/src/...
called `Result::unwrap()` on an `Err` value
```

ELF 섹션을 보면 `.text`는 약 `0x40200` 바이트지만, `.rodata`가 약 `0x3f5ad0` 바이트로 매우 크다.

```text
.rodata  addr=0x00004fe0  size=0x3f5ad0
.text    addr=0x00404c80  size=0x040200
```

즉 검증 로직 자체는 비교적 작고, 거대한 상수 테이블을 이용해 입력을 검증하는 구조로 볼 수 있다.

## Main Routine

`Enter flag:` 문자열 참조를 기준으로 `main` 근처를 찾으면 `0x404d70` 부근에서 입력 처리 루틴이 시작된다.

핵심 흐름은 다음과 같다.

1. `Enter flag:` 출력
2. stdin에서 한 줄 입력
3. 끝의 `\r`, `\n` 제거
4. 입력 길이가 `0x44`, 즉 68바이트인지 검사
5. 각 입력 바이트를 `u64` 배열로 확장
6. `.rodata`의 거대한 테이블을 파싱
7. NOR 회로를 평가
8. 결과가 1이면 `Correct!`, 아니면 `Wrong!`

길이 검사는 다음 코드에서 확인할 수 있다.

```asm
00404ee7: sub      rax, r14
00404eea: cmp      rax, 0x44
00404eee: jne      wrong
```

이후 68바이트 입력은 각각 8바이트 정수로 확장된다.

```asm
00404f3e: movzx    eax, byte ptr [r14]
00404f42: mov      qword ptr [rbx], rax
...
00405230: movzx    eax, byte ptr [r14 + 0x43]
00405235: mov      qword ptr [rbx + 0x218], rax
```

## Table Format

`main`에서 `.rodata`의 `0x4ffc` 주소와 `0x3f08e0` 크기를 넘겨 테이블을 파싱한다.

```asm
00404ef4: lea      rsi, [rip - 0x3ffeff] ; 0x4ffc
00404f00: mov      edx, 0x3f08e0
```

테이블을 직접 파싱하면 다음 구조가 나온다.

```text
u32 gate_count
gate_count * (u32 out, u32 in_a, u32 in_b)
u32 output_count
output_count * u32 output_wire
u32 input_count
input_count * (u32 bit_count, bit_count * u32 input_wire)
```

실제 값은 다음과 같다.

```text
gate_count   = 344048
output_count = 1
output_wire  = 344592
input_count  = 68
```

입력 매핑은 각 바이트마다 8개 wire를 사용한다.

```text
byte 0 -> wires 1..8
byte 1 -> wires 9..16
...
```

따라서 입력은 총 68바이트, 544비트이다.

## NOR Circuit

검증 함수들은 간접 호출로 연결되어 있는데, relocation을 풀면 주요 함수 주소는 다음과 같다.

```text
0x405720 : 테이블 파서
0x405d70 : 입력 비트를 wire 배열에 반영
0x405e30 : NOR 게이트 평가
0x405d10 : output wire를 정수로 수집
```

NOR 게이트 평가 함수 `0x405e30`의 핵심은 다음과 같다.

```asm
00405e70: mov      eax, dword ptr [rdx + rbx]      ; out
00405e78: mov      ecx, dword ptr [rdx + rbx + 4]  ; in_a
00405e81: mov      r8d, dword ptr [rdx + rbx + 8]  ; in_b
00405e90: mov      r8d, dword ptr [r10 + r8*8]
00405e94: or       r8d, dword ptr [r10 + rcx*8]
00405e98: not      r8d
00405e9b: and      r8d, 1
00405e9f: mov      qword ptr [r10 + rax*8], r8
```

즉 각 게이트는 다음 연산이다.

```text
wire[out] = NOT (wire[in_a] OR wire[in_b])
```

문제 이름 `NORfuscated` 그대로, 플래그 검증 로직이 거대한 NOR 회로로 난독화되어 있다.

## Solving With SAT

NOR 게이트는 Boolean 식으로 바로 바꿀 수 있다.

```text
out = not (a or b)
```

이를 CNF로 변환하면 다음 세 절이 된다.

```text
out -> not a     : (-out or -a)
out -> not b     : (-out or -b)
not out -> a|b   : (out or a or b)
```

최종 output wire는 참이어야 하므로 `output_wire = true` 절을 추가한다.

아래 스크립트로 `.rodata`의 회로를 CNF로 변환하고 SAT solver로 풀었다.

```python
import struct
from pysat.solvers import Solver

D = open("NORfuscated", "rb").read()
off = 0x4ffc

gate_count = struct.unpack_from("<I", D, off)[0]
off += 4

with Solver(name="glucose3") as solver:
    for _ in range(gate_count):
        out, a, b = struct.unpack_from("<III", D, off)
        off += 12

        solver.add_clause([-out, -a])
        solver.add_clause([-out, -b])
        solver.add_clause([out, a, b])

    output_count = struct.unpack_from("<I", D, off)[0]
    off += 4
    outputs = struct.unpack_from("<" + "I" * output_count, D, off)
    off += 4 * output_count

    # output value must be 1
    solver.add_clause([outputs[0]])

    assert solver.solve()
    model = set(solver.get_model())

    flag = []
    for i in range(68):
        c = 0
        for bit in range(8):
            wire = i * 8 + bit + 1
            if wire in model:
                c |= 1 << bit
        flag.append(c)

    print(bytes(flag).decode())
```

## Flag

Solver 결과는 다음과 같다.

```text
HS{f89020f327be2051d14b23b5d26bf7433c86a499d3ec3f5b06d88a67e58c2d3e}
```

실제 바이너리에 입력해 검증하면 `Correct!`가 출력된다.

```text
$ printf '%s\n' 'HS{f89020f327be2051d14b23b5d26bf7433c86a499d3ec3f5b06d88a67e58c2d3e}' | ./NORfuscated
Enter flag: Correct!
```

따라서 플래그는 다음과 같다.

```text
HS{f89020f327be2051d14b23b5d26bf7433c86a499d3ec3f5b06d88a67e58c2d3e}
```
