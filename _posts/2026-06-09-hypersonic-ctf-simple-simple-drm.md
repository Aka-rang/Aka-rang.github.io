---
title: "[Hypersonic CTF] simple simple drm Writeup"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, reversing]
tags: [writeup, reversing, electron, drm]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "simple simple drm"
challenge_category: reversing
toc: true
comments: false
---

## Challenge

- Category: Reversing
- File: `for_user.7z`
- Goal: DRM-protected document viewer에서 flag 획득

## Summary

압축을 풀어보면 Electron 앱 형태의 `SecureDoc Reader.exe`가 들어있다.
실제 로직은 `resources/app.asar` 안의 JavaScript에 있고, 보호된 문서는
`resources/encrypted.dat`로 저장되어 있다.

`app.asar`를 풀어 `main.js`를 확인한 뒤, Electron 런타임을 직접 실행하지 않고
Node VM에서 `electron` 모듈만 가짜로 대체했다. 그 결과 앱 내부의 라이선스 키 생성
함수와 IPC 복호화 핸들러를 직접 호출할 수 있었다.

## File Structure

압축 해제 후 주요 파일은 다음과 같다.

```text
for_user/
├── SecureDoc Reader.exe
├── resources/
│   ├── app.asar
│   └── encrypted.dat
└── ...
```

`SecureDoc Reader.exe`는 Electron 실행 파일이고, 핵심 코드는 `app.asar`에 있다.

## Extracting app.asar

`app.asar`의 헤더를 확인하면 다음 파일들이 포함되어 있었다.

```text
main.js
package.json
preload.js
renderer.html
renderer.js
```

`renderer.html`과 `renderer.js`에서는 라이선스 키 입력 UI와 `decrypt-doc` IPC 호출을
확인할 수 있다.

```javascript
window.secureApi.decrypt(licenseKey).then(function (b64) {
  ...
  pdfEmbed.src = 'data:application/pdf;base64,' + b64;
});
```

즉, 사용자가 올바른 라이선스 키를 입력하면 메인 프로세스가 문서를 복호화하고
base64 PDF를 반환하는 구조다.

## Main Logic

`main.js`는 난독화되어 있지만, 핵심 흐름은 다음과 같다.

1. `process.versions.electron` 값과 `process.resourcesPath` 존재 여부를 검사한다.
2. `_getLicenseKey()`가 WASM을 통해 라이선스 키를 만든다.
3. 입력한 키가 내부 키와 일치하는지 비교한다.
4. `_getPdfKey()`가 AES 키를 만든다.
5. `encrypted.dat` 앞 16바이트를 IV로 사용하고, 나머지를 AES-256-CBC로 복호화한다.
6. 복호화된 PDF를 base64 문자열로 반환한다.

복호화 핸들러의 의미는 대략 아래와 같다.

```javascript
ipcMain.handle('decrypt-doc', async function (_, inputKey) {
  const licenseKey = await _getLicenseKey();
  if (!inputKey || inputKey.toUpperCase() !== licenseKey) return null;

  const data = fs.readFileSync(path.join(process.resourcesPath, 'encrypted.dat'));
  const iv = data.slice(0, 16);
  const ciphertext = data.slice(16);
  const key = await _getPdfKey();

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString('base64');
});
```

## Bypassing Electron

앱을 실제로 실행하지 않아도 된다. Node VM에서 `electron` 모듈만 가짜 객체로 대체하고
`main.js`를 실행하면 IPC 핸들러가 등록된다.

```javascript
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync('app_unpacked/main.js', 'utf8');
const handlers = {};

const fakeElectron = {
  app: {
    quit() {},
    whenReady() { return { then() {} }; },
    on() {}
  },
  BrowserWindow: function () {
    return {
      webContents: { on() {}, closeDevTools() {} },
      loadFile() {},
      setMenu() {},
      on() {}
    };
  },
  ipcMain: {
    handle(name, fn) {
      handlers[name] = fn;
    }
  }
};

const context = {
  require(name) {
    if (name === 'electron') return fakeElectron;
    return require(name);
  },
  console,
  Buffer,
  Uint8Array,
  WebAssembly,
  process: {
    versions: { electron: '32' },
    resourcesPath: path.resolve('extracted/for_user/resources'),
    exit() {},
    env: {}
  },
  __dirname: path.resolve('app_unpacked'),
  setTimeout,
  clearTimeout
};

vm.createContext(context);
vm.runInContext(code, context);

(async () => {
  const license = await context._getLicenseKey();
  console.log('license:', license);

  const b64 = await handlers['decrypt-doc'](null, license);
  fs.writeFileSync('decrypted.pdf', Buffer.from(b64, 'base64'));
})();
```

실행 결과 라이선스 키는 다음과 같았다.

```text
1A62-5880-C435-52BA
```

그리고 `decrypted.pdf`가 생성된다.

## Extracting the Flag

복호화된 PDF에서 텍스트를 추출하면 다음 내용이 나온다.

```text
SECURE DOCUMENT
SecureDoc DRM v4.1
License ID:
A7F3-2C91-EE84
Status:
VERIFIED
Encryption:
AES-256-CBC
VALIDATION KEY
hs{1+1=flag}
```

## Flag

```text
hs{1+1=flag}
```
