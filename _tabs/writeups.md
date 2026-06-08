---
title: Writeups
icon: fas fa-flag
order: 1
permalink: /writeups/
---

# Writeups

CTF 풀이를 대회와 문제 단위로 정리합니다.

{% assign writeup_posts = site.posts | where_exp: "post", "post.categories contains 'ctf' or post.categories contains 'writeup' or post.ctf_event" %}

{% if writeup_posts.size > 0 %}
{% assign event_groups = writeup_posts | group_by_exp: "post", "post.ctf_event | default: 'Unsorted CTF'" | sort: "name" %}

<div class="writeup-tree">
  {% for event in event_groups %}
    <details class="writeup-tree-event">
      <summary>
        <span class="writeup-tree-icon"><i class="fas fa-folder-open"></i></span>
        <span class="writeup-tree-name">{{ event.name }}</span>
        <span class="writeup-tree-count">{{ event.items.size }}</span>
      </summary>

      {% assign challenge_groups = event.items | group_by_exp: "post", "post.challenge | default: 'Unsorted Challenge'" | sort: "name" %}
      <div class="writeup-tree-children">
        {% for challenge in challenge_groups %}
          <details class="writeup-tree-challenge">
            <summary>
              <span class="writeup-tree-icon"><i class="fas fa-cube"></i></span>
              <span class="writeup-tree-name">{{ challenge.name }}</span>
              <span class="writeup-tree-count">{{ challenge.items.size }}</span>
            </summary>

            <ul class="writeup-tree-leaves">
              {% assign challenge_posts = challenge.items | sort: "date" | reverse %}
              {% for post in challenge_posts %}
                <li>
                  <a href="{{ post.url | relative_url }}" class="writeup-tree-link">
                    <span>
                      <span class="writeup-tree-title">{{ post.title }}</span>
                      {% if post.challenge_category %}
                        <span class="writeup-tree-meta">{{ post.challenge_category }}</span>
                      {% endif %}
                    </span>
                    <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%Y.%m.%d" }}</time>
                  </a>
                </li>
              {% endfor %}
            </ul>
          </details>
        {% endfor %}
      </div>
    </details>
  {% endfor %}
</div>
{% else %}
> 아직 공개된 writeup이 없습니다. 글을 작성할 때 `ctf_event`와 `challenge` 값을 넣으면 이 페이지에 트리 형태로 모입니다.
{: .prompt-info }

```yaml
categories: [ctf, web]
ctf_event: "Example CTF 2026"
challenge: "login-bypass"
challenge_category: web
```
{% endif %}
