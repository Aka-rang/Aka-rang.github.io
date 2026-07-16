---
title: "[DreamHack] Chess.com 풀이"
date: 2026-07-16 11:54:20 +0900
categories: [study, dreamhack]
tags: [dreamhack, wargame, web, url-validation]
study_collection: "드림핵 워게임"
study_level: "Bronze"
study_problem: "Chess.com"
study_area: "WEB"
toc: true
comments: false
---

## 풀이 요약

`nc`로 문제 서버에 연결하면 `chess.com`을 이용하고 싶다며 URL 입력을 요구한다. 문제 설명에는 학교 방화벽 때문에 사이트에 접속할 수 없다는 내용이 있다.

`chall.py`를 확인하면 입력 URL은 다음 조건을 만족해야 한다.

1. `https://`가 포함되어야 한다.
2. `school` 문자열이 포함되어야 한다.
3. `com`으로 끝나야 한다.

위 조건을 만족하면서 `chess.com`으로 연결되는 미러 주소인 다음 URL을 입력했다.

```text
https://schoolschoolschool.com
```

검증을 통과한 뒤 플래그가 출력됐다.

## 핵심

문자열 조건만 만족하는 URL을 찾는 문제다. 각 검증 조건을 분리해서 확인한 뒤 세 조건을 동시에 만족하는 정상 주소를 입력하면 된다.
