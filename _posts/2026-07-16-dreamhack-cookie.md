---
title: "[DreamHack] cookie 풀이"
date: 2026-07-16 11:01:14 +0900
categories: [study, dreamhack]
tags: [dreamhack, wargame, web, cookie, session]
study_collection: "드림핵 워게임"
study_level: "Beginner"
study_problem: "cookie"
study_area: "WEB"
toc: true
comments: false
---

## 풀이 요약

`app.py`를 확인하면 기본 로그인 계정으로 `guest / guest`가 존재한다. 해당 계정으로 로그인한 뒤 브라우저 개발자 도구에서 세션 토큰을 확인했다.

세션에는 관리자 정보가 포함되어 있었고, 사용자 이름 값을 `admin`으로 변경하자 관리자 권한으로 인식되어 플래그가 출력됐다.

## 풀이 순서

1. 소스 코드에서 기본 계정 `guest / guest`를 확인한다.
2. 기본 계정으로 로그인한다.
3. 개발자 도구에서 로그인 세션 토큰을 확인한다.
4. 세션의 사용자 이름을 `admin`으로 변경한다.
5. 변경된 세션으로 요청해 플래그를 확인한다.

## 핵심

클라이언트가 가진 세션 정보의 사용자 값을 신뢰하기 때문에 권한을 관리자 계정으로 바꿀 수 있다는 점이 핵심이다.
