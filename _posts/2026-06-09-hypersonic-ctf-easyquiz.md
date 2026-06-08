---
title: "[Hypersonic CTF] EasyQuiz 라이트업"
date: 2026-06-09 00:00:00 +0900
categories: [ctf, misc]
tags: [writeup, misc, math]
ctf_event: "Hypersonic CTF (2026.06.07)"
challenge: "EasyQuiz"
challenge_category: misc
toc: true
comments: false
---

## 문제 개요

`chall.py`에는 서로 독립적인 quiz branch가 3개 있다. 각 branch를 통과할 때마다 flag의 한 조각이 출력된다.

```python
inp = int(input())
```

세 branch에서 나온 출력을 이어 붙이면 최종 flag가 된다.

```text
HS{70927730afde31916a2f22a1385a5d2343377937a7c3cf1a796b78d05b7d070e50b8c5526395e3d968da2ca26f198476}
```

## 1번 파트

첫 번째 branch는 아래 식을 만족하는 양의 정수 `x, y, z`를 5번 요구한다.

```python
x/(y+z) + y/(x+z) + z/(x+y) == N
```

여기서 `N`은 `4..50` 범위에서 랜덤으로 선택된다.

처음 보면 정수해를 찾아야 하는 어려운 Diophantine equation처럼 보인다. 하지만 Python의 `/` 연산으로 계산되기 때문에 실제 비교는 `float` 비교다. 따라서 정확한 정수해를 찾는 대신 floating point rounding을 이용할 수 있다.

다음처럼 둔다.

```text
y = z = S
x = aS
```

그러면 식은 다음 형태로 단순화된다.

```text
a/2 + 2/(a+1) = N
```

이를 이차방정식으로 풀면 `a`는 다음과 같다.

```text
a = (2N - 1 + sqrt(4N^2 + 4N - 15)) / 2
```

`S = 10^40`처럼 큰 scale을 잡고 `x ~= aS`를 계산한다. 이후 그 근처를 binary search하면서 Python의 floating point 평가 결과가 정확히 `N.0`이 되는 값을 찾는다.

아래 solver는 `4..50` 범위의 모든 `N`에 대해 답을 구한다.

```python
def quiz1_answer(n, exp=40):
    s = 10**exp
    disc = Decimal(4 * n * n + 4 * n - 15)
    alpha = (Decimal(2 * n - 1) + disc.sqrt()) / 2
    root = int((alpha * Decimal(s)).to_integral_value(rounding=ROUND_FLOOR))

    lo = root - 10**25
    hi = root + 10**25
    while quiz1_value(lo, s) >= n:
        lo -= (hi - lo) * 2
    while quiz1_value(hi, s) < n:
        hi += (hi - lo) * 2

    a, b = lo, hi
    while a + 1 < b:
        m = (a + b) // 2
        if quiz1_value(m, s) >= n:
            b = m
        else:
            a = m

    for off in range(-1000, 1001):
        x = b + off
        if quiz1_value(x, s) == n:
            return x, s, s
```

이를 통해 첫 번째 flag 조각을 얻을 수 있다.

```text
HS{70927730afde31916a2f22a1385a5d23
```

## 2번 파트

두 번째 branch는 대략 다음 로직을 수행한다.

```python
M = ast.literal_eval(input())
n = len(M)
M = Matrix(ZZ, M)
minkowski_bound = sqrt(n)*abs(det(M))**(1/n)

if norm(M.BKZ(block_size=30)[0]) > minkowski_bound:
    print("...")
```

여기에는 두 가지 문제가 있다.

1. `n = len(M)`이 `M`을 Sage matrix로 변환하기 전에 계산된다.
2. 입력이 `(row, col): value` 형태의 dictionary이면 Sage가 sparse matrix를 만든다.

payload는 다음과 같다.

```python
{(0, 0): 100, (0, 1): 0, (1, 0): 0, (1, 1): 100}
```

이 입력에서는 Python dictionary 기준으로 `len(M) == 4`가 된다. 하지만 Sage는 이를 sparse `2x2` integer matrix로 변환한다.

원격 서비스에서 `Matrix_integer_sparse`에는 `BKZ` method가 없어서 프로그램이 crash한다. 이때 처리되지 않은 traceback에 두 번째 flag 조각이 들어 있는 실제 source line이 함께 노출된다.

```text
43377937a7c3cf1a796b78d05b7d070e
```

## 3번 파트

세 번째 branch는 다음 조건들을 검사한다.

```python
assert len(set(number)) > 21
assert len(set([hash(i) for i in number])) == 1
assert hash(number[0]) == 42
assert all(abs(i) < 2424242 for i in number)
assert all(int(i.real) == i.real and int(i.imag) == i.imag for i in number if isinstance(i, complex))
```

즉, 서로 다른 숫자 22개 이상이 필요하고, 모든 원소의 `hash` 값은 `42`여야 한다.

CPython에서 float hash는 숫자의 exact integer ratio를 아래 modulus 기준으로 계산한다.

```python
sys.hash_info.modulus == 2**61 - 1
```

`2^61 == 1 mod (2^61 - 1)`이므로 다음 형태의 값들은 모두 `42`로 hash된다.

```text
21 / 2^(60 + 61k)
```

이 값들은 매우 작은 서로 다른 float들이고, 문제의 크기 제한도 만족한다.

complex number의 경우 CPython은 real part와 imaginary part의 hash를 아래 상수를 이용해 조합한다.

```python
sys.hash_info.imag == 1000003
```

따라서 다음과 같은 Gaussian integer들도 `42`로 hash된다.

```python
(2000048-1j)
(2000048-2j)
(-999961+1j)
(-1999964+2j)
```

최종 payload는 다음과 같다.

```python
[2.8519623430573e-311, 6.576177431279442e-293, 1.5163632757264568e-274, 3.4964956587622276e-256, 8.062370071502912e-238, 1.85905596670687e-219, 4.286691204568042e-201, 9.884436946711048e-183, 2.279195983358722e-164, 5.25546812485564e-146, 1.2118284435843778e-127, 2.794286145005349e-109, 6.443185173203266e-91, 1.4856973488700075e-72, 3.4257848456992254e-54, 7.899322037525772e-36, 1.8214596497756474e-17, 42.0, (2000048-1j), (2000048-2j), (-999961+1j), (-1999964+2j)]
```

이를 통해 마지막 flag 조각을 얻을 수 있다.

```text
50b8c5526395e3d968da2ca26f198476}
```

## 익스플로잇

전체 solver는 `solve_easyquiz.py`에 정리했다.

실행:

```powershell
$env:PYTHONIOENCODING='utf-8'
python .\solve_easyquiz.py --host 15.165.245.192 --port 1337
```

원격 실행 결과:

```text
HS{70927730afde31916a2f22a1385a5d23
43377937a7c3cf1a796b78d05b7d070e
50b8c5526395e3d968da2ca26f198476}
```

최종 flag:

```text
HS{70927730afde31916a2f22a1385a5d2343377937a7c3cf1a796b78d05b7d070e50b8c5526395e3d968da2ca26f198476}
```
