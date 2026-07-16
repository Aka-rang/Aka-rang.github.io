---
title: "[DreamHack] Easy Way to Get the Flag 풀이"
date: 2026-07-16 11:35:02 +0900
categories: [study, dreamhack]
tags: [dreamhack, wargame, web, http, curl]
study_collection: "드림핵 워게임"
study_level: "Bronze"
study_problem: "Easy Way to Get the Flag"
study_area: "WEB"
toc: true
comments: false
---

## 풀이 요약

사이트에 접속하면 `1`부터 `25`까지의 번호가 표시되고, 개발자 도구에서는 가짜 플래그 두 개가 보인다.

처음에는 각 번호를 눌렀을 때 나오는 문자를 조합하는 방식으로 접근했다. 하지만 `14`번을 눌렀을 때 다른 번호와 달리 `404` 응답이 발생했다.

일반 페이지 화면만으로는 응답 전체를 확인하기 어려워 다음처럼 `curl -i`로 헤더를 포함한 HTTP 응답을 확인했다.

```bash
curl -i http://문제주소/14
```

응답 내용을 확인해 플래그를 획득했다.

## 핵심

화면에 표시되는 내용과 개발자 도구의 가짜 플래그에만 집중하지 않고, 동작이 다른 `14`번 요청의 HTTP 응답 전체를 확인하는 것이 핵심이다.
