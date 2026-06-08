---
title: "[Hypersonic CTF] long time no see, its me again Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, forensics]
tags: [writeup, forensics, ransomware, recovery]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "long time no see, its me again"
challenge_category: forensics
toc: true
comments: false
---

## 개요

문제 파일은 Google Drive로 배포된 `prob1.zip`이며, 압축을 풀면 다음 세 파일이 나온다.

```text
dfs.records.ENC
dfs.record_ids.ENC
MillicentRansomware.exe
```

`MillicentRansomware.exe`를 분석해 `.ENC` 파일이 어떤 방식으로 훼손됐는지 파악하고, 훼손된 Rapid Recovery DVM 저장소에서 Linux VM의 파일시스템 흔적을 복구해 플래그를 얻는 문제다.

최종 플래그:

```text
HS{d0c0cb460720e6f21de1dccfeb34cab91d1c4990dbf3452f5a9a2095b9430fae}
```

## 1. 랜섬웨어 분석

`MillicentRansomware.exe`는 PyInstaller로 패키징된 Python 바이너리였다. 메인 로직을 복원하면 핵심 동작은 다음과 같다.

```python
ENC = 524288
SKIP = 9961472
STRIDE = SKIP + ENC  # 10 MiB

def encrypt(path):
    out = path + ".ENC"
    shutil.copy2(path, out)
    size = os.path.getsize(out)
    with open(out, "r+b") as f:
        offset = 0
        while offset < size:
            offset += SKIP
            if offset >= size:
                break
            length = min(ENC, size - offset)
            f.seek(offset)
            f.write(os.urandom(length))
            offset += ENC
```

즉, 파일을 10MiB 단위로 보면서 앞의 9.5MiB는 그대로 두고 뒤의 512KiB만 랜덤 데이터로 덮는다. 완전 암호화가 아니라 주기적 파괴에 가깝다.

## 2. DVM 저장소 식별

`dfs.records.ENC`, `dfs.record_ids.ENC`는 Quest/AppAssure Rapid Recovery 계열의 DVM 저장소 파일이다.

`dfs.record_ids.ENC`는 73바이트 고정 길이 엔트리 배열이었다.

엔트리 구조는 다음과 같이 파악했다.

```text
0x00: 5 bytes  records 파일 내 위치 loc
0x05: 3 bytes  압축/저장 길이 clen
0x08: 48 bytes hash
0x38: 8 bytes  보통 1
0x40: 3 bytes  복원 후 길이 ulen
0x43: 1 byte   record type
0x44: 5 bytes  padding
```

실제 `dfs.records.ENC`에서 레코드 데이터는 `loc * 512` 위치에 저장되어 있었다.

자주 나온 타입은 다음과 같다.

```text
0x83: 8KiB 데이터 블록, 압축 저장
0x81: 8KiB 데이터 블록, 비압축 저장
0xa0: map 또는 metadata
0x88, 0x90: 상위 map
```

## 3. 압축 포맷 확인

처음에는 zlib, gzip, xz, zstd, lz4 등을 시도했지만 맞지 않았다. 그런데 `0x83` 레코드의 raw payload를 보면 앞 몇 바이트 뒤에 ELF, C++ 헤더, systemd 문자열 등이 부분적으로 보였다.

예를 들어 한 레코드는 다음처럼 시작했다.

```text
ee 9e c2 92 05 7f 45 4c 46 ...
```

앞의 4바이트를 제외하면 LZO1X 스트림이었다. `lzokay`로 확인하면 정확히 8192바이트로 복원된다.

```python
import lzokay

raw = read_record(idx)
plain = lzokay.decompress(raw[4:], 8192)
```

이후 모든 정상 `0x83` 레코드를 풀어서 문자열 검색을 할 수 있었다.

## 4. 파일시스템 단서 찾기

복원된 블록을 검색하던 중 사용자명 `kyouki`와 `/home/kyouki` 관련 흔적이 나왔다. 특히 `/home/kyouki` 디렉터리 블록에서 다음 엔트리를 확인했다.

```text
.bash_logout
.profile
.bashrc
.ssh
.cache
f
.sudo_as_admin_successful
.bash_history
```

여기서 `f`가 수상했다. 일반 파일처럼 보일 수 있지만 ext4 dirent의 type 값이 `2`였으므로 디렉터리였다.

`/home/kyouki/f`의 inode는 `2548`이었다.

## 5. 디렉터리명 체인 추적

inode `2548`의 디렉터리 블록을 찾으면 내부에 `l` 디렉터리 하나만 있었다.

```text
/home/kyouki/f
└── l
```

이후 같은 방식으로 하위 디렉터리를 계속 따라가면 각 디렉터리 이름이 한 글자씩 플래그 문장을 구성한다.

추적 결과:

```text
f/l/a/g/ /i/s/ /H/S/{/d/0/c/0/c/b/4/6/0/7/2/0/e/6/f/2/1/d/e/1/d/c/c/f/e/b/3/4/c/a/b/9/1/d/1/c/4/9/9/0/d/b/f/3/4/5/2/f/5/a/9/a/2/0/9/5/b/9/4/3/0/f/a/e/}
```

공백 디렉터리도 실제 이름으로 포함되어 있어, 이어 붙이면 다음 문장이 된다.

```text
flag is HS{d0c0cb460720e6f21de1dccfeb34cab91d1c4990dbf3452f5a9a2095b9430fae}
```

## 6. 플래그

```text
HS{d0c0cb460720e6f21de1dccfeb34cab91d1c4990dbf3452f5a9a2095b9430fae}
```
