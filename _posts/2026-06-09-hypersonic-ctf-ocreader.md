---
title: "[Hypersonic CTF] ocreader Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, pwn]
tags: [writeup, pwn, uaf]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "ocreader"
challenge_category: pwn
toc: true
comments: false
---

## 요약

플래그:

```text
Hypersonic{0cr_n3v3r_d13_1n_chr00t}
```

접속 정보:

```text
nc 54.116.174.160 21314
```

이 문제는 이미지를 업로드하고 OCR을 수행하는 서비스처럼 보이지만, 실제 핵심은 OCR 결과가 `libvmhandlers.so` 안의 간단한 VM 명령어로 해석된다는 점이다. OCR 문자열을 이용해 VM 명령을 실행하고, UAF와 tcache poisoning으로 VM dispatch table을 덮어써 최종적으로 `system()`을 호출했다.

## 바이너리 개요

제공 파일에는 메인 바이너리 `prob`와 공유 라이브러리 `libvmhandlers.so`가 포함되어 있다.

메뉴는 다음과 같다.

```text
1. store image
2. ocr image
3. show info
4. edit title
5. delete title
```

전체 흐름은 다음과 같다.

1. `store image`에서 base64로 인코딩된 이미지 데이터를 업로드한다.
2. 업로드된 이미지는 `images/<random>` 경로에 저장된다.
3. `ocr image`를 실행하면 Tesseract가 이미지에서 문자열을 추출한다.
4. 추출된 OCR 결과는 `ocr/<idx>.txt`에 저장된다.
5. 이후 OCR 결과가 `libvmhandlers.so`의 `vm_execute_line()`에 의해 한 줄씩 VM 명령어로 실행된다.

VM에서 지원하는 명령어는 다음 네 가지다.

```text
RENAME
MKDIR
BLACKLIST
ADDDESC
```

즉, 단순 OCR 문제가 아니라 OCR 결과를 원하는 VM 명령어로 만들고, 그 명령어 처리 과정을 공격해야 하는 문제다.

## 보호 기법

메인 바이너리 `prob`:

```text
PIE enabled
NX enabled
Canary enabled
Full RELRO
```

공유 라이브러리 `libvmhandlers.so`:

```text
PIE enabled
NX enabled
Canary enabled
Partial RELRO
```

메인 바이너리는 Full RELRO가 걸려 있어 GOT overwrite가 어렵다. 대신 공유 라이브러리 쪽에 writable VM dispatch table이 존재하므로, 이 테이블을 덮어쓰는 방향으로 공격을 구성했다.

## VM 명령어 테이블

`libvmhandlers.so`에는 VM 명령어 문자열과 핸들러 함수 포인터를 저장하는 테이블이 존재한다. 테이블은 라이브러리 기준 오프셋 `0x40e0` 부근의 writable data 영역에 있다.

구조는 다음과 같이 볼 수 있다.

```c
struct vm_entry {
    char *opcode;
    void (*handler)(state, idx, arg);
};
```

분석에 사용한 주요 오프셋은 다음과 같다.

```text
cmd_table       = libbase + 0x40e0
"BLACKLIST"     = libbase + 0x20cc
"ADDDESC"       = libbase + 0x20d6
handler_RENAME  = libbase + 0x1379
handler_MKDIR   = libbase + 0x1654
```

따라서 `cmd_table`에 쓸 수 있다면, 특정 명령어가 원래 핸들러가 아닌 다른 핸들러를 실행하도록 바꿀 수 있다.

## 취약점 1: ADDDESC를 이용한 라이브러리 주소 leak

`ADDDESC` 명령어는 description 객체를 할당한다. 인자가 비어 있으면 `desc + 8` 위치에 정적 문자열 `"Default Desc"`의 포인터를 저장한다.

문제는 `show info`가 이 값을 포인터로 따라가서 출력하지 않고, `desc + 8` 위치 자체를 C 문자열처럼 출력한다는 점이다. 그 결과 포인터 값의 raw bytes가 그대로 출력된다.

OCR 이미지에 다음 한 줄을 넣는다.

```text
ADDDESC
```

이후 `show info`를 호출하면 description 출력에서 라이브러리 내부 주소가 leak된다.

leak되는 주소는 다음과 같다.

```text
libbase + 0x40c0
```

따라서 라이브러리 base는 다음처럼 계산할 수 있다.

```python
libbase = leak - 0x40c0
```

단, 출력 함수가 `\x00`에서 멈추기 때문에 leak 길이가 짧게 잘릴 수 있다. 익스플로잇에서는 leak된 바이트가 부족하면 다시 시도하도록 처리했다.

## 취약점 2: title UAF

`delete title` 기능은 title 포인터를 `free()`하지만, 이후 포인터를 `NULL`로 초기화하지 않는다.

이로 인해 다음 두 가지가 가능하다.

1. `show info`를 통한 use-after-free read
2. `edit title`을 통한 use-after-free write

title chunk를 free한 뒤 `show info`를 호출하면 tcache의 forward pointer가 leak된다. glibc safe-linking 환경에서 첫 번째 freed chunk의 `fd` 값은 heap key로 사용할 수 있다.

```python
heap_key = freed_fd
```

이 문제의 할당 배치에서는 첫 title chunk 주소를 다음처럼 안정적으로 계산할 수 있었다.

```python
title0 = (heap_key << 12) + 0x550
```

이후 UAF write가 가능한 `edit title`로 freed chunk의 `fd`를 조작한다.

```python
edit(0, p64(target ^ heap_key) + b"C" * 24)
```

그러면 다음 `malloc(0x20)`이 원하는 `target` 주소를 반환한다. 이를 통해 `0x20` 바이트 크기의 arbitrary write primitive를 얻을 수 있다.

## 취약점 3: VM 테이블 덮어쓰기

UAF와 tcache poisoning으로 얻은 arbitrary write를 이용해 다음 주소를 target으로 잡는다.

```text
libbase + 0x40e0
```

즉, VM command table을 title chunk처럼 할당받고 내용을 덮어쓴다.

첫 번째 테이블 조작은 다음과 같다.

```python
cmd_table[0] = ("ADDDESC", handler_RENAME)
cmd_table[1] = ("BLACKLIST", handler_MKDIR)
```

이 상태에서 OCR 결과가 다음과 같다고 하자.

```text
BLACKLIST ../bin
ADDDESC 2 ../bin/sh
```

원래라면 `BLACKLIST`, `ADDDESC`가 실행되어야 하지만, 테이블을 바꿨기 때문에 실제 실행은 다음처럼 바뀐다.

```text
MKDIR ../bin
RENAME slot2 -> ../bin/sh
```

즉, 먼저 `../bin` 디렉터리를 만들고, slot 2에 업로드한 파일을 `../bin/sh`로 rename한다.

## 커스텀 `/bin/sh`가 필요한 이유

프로그램은 chroot jail 안에서 동작한다. 단순히 `system("cat /flag")`를 실행하려고 해도 chroot 내부에 `/bin/sh`가 없으면 `system()` 호출이 제대로 동작하지 않는다.

그래서 익스플로잇은 직접 만든 정적 ELF를 이미지 파일처럼 업로드한 뒤, VM 테이블 조작을 통해 그 파일을 chroot 내부의 `/bin/sh` 위치로 옮긴다.

커스텀 ELF는 syscall만 사용하는 작은 바이너리이며, 동작은 다음과 같다.

1. 실행 확인용 마커 `PWNST`를 출력한다.
2. `mkdir("x")`를 호출한다.
3. `chroot("x")`를 호출한다.
4. `chdir("..")`를 여러 번 반복한다.
5. `chroot(".")`를 호출해 chroot를 탈출한다.
6. 여러 후보 경로에서 flag 파일을 찾는다.

시도한 flag 후보 경로는 다음과 같다.

```text
/flag
/home/ctf/flag
/home/ctf/flag.txt
/root/flag
/tmp/flag
```

실제 플래그는 다음 경로에 있었다.

```text
/home/ctf/flag
```

## system 호출 만들기

`system()` 주소는 `libvmhandlers.so`와 libc 사이의 고정 매핑 차이를 이용해 계산했다.

```python
libc_base = libbase - 0x215000
system = libc_base + 0x58750
```

이후 VM command table을 다시 덮어쓴다.

```python
cmd_table[0] = ("BLACKLIST", system)
cmd_table[1] = ("ADDDESC", handler_RENAME)
```

이제 같은 OCR 파일을 다시 실행하면 첫 번째 줄이 다음처럼 처리된다.

```text
BLACKLIST ../bin
```

테이블이 조작되어 있으므로 실제로는 다음 호출이 발생한다.

```c
system("../bin");
```

`system()`은 `/bin/sh -c "../bin"` 형태로 shell을 실행하려고 한다. 이때 chroot 내부의 `/bin/sh`는 우리가 넣어둔 커스텀 ELF이므로, 커스텀 ELF가 실행되고 chroot를 탈출한 뒤 플래그를 출력한다.

## 최종 익스플로잇 흐름

1. `ADDDESC`가 들어 있는 OCR 이미지를 업로드한다.
2. OCR을 실행한다.
3. `show info`로 `libvmhandlers.so` base를 leak한다.
4. 더미 이미지를 하나 더 업로드한다.
5. title chunk를 free하고 tcache safe-linking key를 leak한다.
6. UAF write로 tcache poisoning을 수행한다.
7. 다음 title allocation이 VM command table을 가리키도록 만든다.
8. 커스텀 syscall-only ELF를 slot 2에 업로드한다.
9. VM 명령어 OCR 이미지를 slot 3에 업로드한다.
10. `ADDDESC -> RENAME`, `BLACKLIST -> MKDIR`로 테이블을 조작한다.
11. slot 3 OCR을 실행해 `/bin`을 만들고 slot 2 파일을 `/bin/sh`로 옮긴다.
12. 다시 테이블을 조작해 `BLACKLIST -> system`으로 바꾼다.
13. slot 3 OCR을 한 번 더 실행한다.
14. 커스텀 `/bin/sh`가 실행되어 chroot를 탈출하고 flag를 출력한다.

## 실행 결과

성공 시 출력은 다음과 같다.

```text
PWNST
Hypersonic{0cr_n3v3r_d13_1n_chr00t}
[vm] image renamed
```

## 결론

이 문제의 핵심은 OCR 결과가 단순 문자열이 아니라 VM 명령어로 실행된다는 점을 파악하는 것이다. 이후 `ADDDESC`의 포인터 출력 버그로 라이브러리 base를 leak하고, title UAF로 tcache poisoning을 수행해 VM dispatch table을 덮어썼다.

최종적으로 VM 명령어 매핑을 조작해 chroot 내부에 커스텀 `/bin/sh`를 만들고, `BLACKLIST` 명령어가 `system()`을 호출하도록 바꿔 플래그를 획득했다.
