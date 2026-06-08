---
title: Study
icon: fas fa-book-open
order: 2
permalink: /study/
---

# Study

보안 공부, 개발 메모, 실습 기록을 모아두는 공간입니다.

{% assign study_posts = site.posts | where_exp: "post", "post.categories contains 'study' or post.categories contains 'notes'" %}

{% if study_posts.size > 0 %}
{% for post in study_posts %}
## [{{ post.title }}]({{ post.url | relative_url }})

{{ post.excerpt | strip_html | truncate: 160 }}

{% endfor %}
{% else %}
> 아직 공개된 공부 기록이 없습니다. 글을 작성할 때 `categories: [study, web]`처럼 `study`를 포함하면 여기에 모입니다.
{: .prompt-info }
{% endif %}
