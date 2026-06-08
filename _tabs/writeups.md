---
title: Writeups
icon: fas fa-flag
order: 1
permalink: /writeups/
---

# Writeups

CTF 문제 풀이와 분석 기록을 모아두는 공간입니다.

{% assign writeup_posts = site.posts | where_exp: "post", "post.categories contains 'ctf' or post.categories contains 'writeup'" %}

{% if writeup_posts.size > 0 %}
{% for post in writeup_posts %}
## [{{ post.title }}]({{ post.url | relative_url }})

{{ post.excerpt | strip_html | truncate: 160 }}

{% endfor %}
{% else %}
> 아직 공개된 writeup이 없습니다. 글을 작성할 때 `categories: [ctf, web]`처럼 `ctf`를 포함하면 여기에 모입니다.
{: .prompt-info }
{% endif %}
