---
title: Study
icon: fas fa-book-open
order: 2
permalink: /study/
---

보안 공부, 개발 메모, 실습 기록을 모아두는 공간입니다.

드림핵 워게임 롸업? 풀이방법?도 모아두는 공간 그냥 내가 어떻게 풀었는지 기록하는거라 자세한 롸업은 아니고 그냥 진짜 대충 적음

{% assign study_posts = site.posts | where_exp: "post", "post.categories contains 'study' or post.categories contains 'notes'" %}

{% if study_posts.size > 0 %}
{% assign study_groups = study_posts | group_by_exp: "post", "post.study_collection | default: '기타 공부 기록'" | sort: "name" %}

<div class="writeup-tree study-tree">
  {% assign hskf_posts = study_posts | where: "study_collection", "HSKF 3기" %}
  {% if hskf_posts.size == 0 %}
    <details class="study-tree-root">
      <summary>
        <span class="writeup-tree-icon"><i class="fas fa-folder-open"></i></span>
        <span class="writeup-tree-name">HSKF 3기</span>
        <span class="writeup-tree-count">0</span>
      </summary>
      <div class="study-tree-levels">
        <p class="study-tree-empty">아직 작성된 글이 없습니다.</p>
      </div>
    </details>
  {% endif %}
  {% for study_group in study_groups %}
    <details class="study-tree-root">
      <summary>
        <span class="writeup-tree-icon"><i class="fas fa-folder-open"></i></span>
        <span class="writeup-tree-name">{{ study_group.name }}</span>
        <span class="writeup-tree-count">{{ study_group.items.size }}</span>
      </summary>

      <div class="study-tree-levels">
        {% assign level_groups = study_group.items | group_by_exp: "post", "post.study_level | default: '기타'" | sort: "name" %}
        {% for level in level_groups %}
          <details class="study-tree-level">
            <summary>
              <span class="writeup-tree-icon"><i class="fas fa-layer-group"></i></span>
              <span class="writeup-tree-name">{{ level.name }}</span>
              <span class="writeup-tree-count">{{ level.items.size }}</span>
            </summary>

            <div class="study-tree-problems">
              {% assign level_posts = level.items | sort: "study_problem" %}
              {% for post in level_posts %}
                <details class="study-tree-problem">
                  <summary>
                    <span class="writeup-tree-icon"><i class="fas fa-cube"></i></span>
                    <span class="writeup-tree-name">{{ post.study_problem | default: post.title }}</span>
                    {% if post.study_area %}
                      <span class="writeup-tree-meta">{{ post.study_area }}</span>
                    {% endif %}
                  </summary>

                  <div class="study-tree-solution-wrap">
                    <a href="{{ post.url | relative_url }}" class="study-tree-solution">
                      <span><i class="fas fa-file-alt"></i> {{ post.study_link_label | default: '풀이 보기' }}</span>
                      <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%Y.%m.%d" }}</time>
                    </a>
                  </div>
                </details>
              {% endfor %}
            </div>
          </details>
        {% endfor %}
      </div>
    </details>
  {% endfor %}
</div>
{% else %}
> 아직 공개된 공부 기록이 없습니다. 글을 작성할 때 `categories: [study, web]`처럼 `study`를 포함하면 여기에 모입니다.
{: .prompt-info }
{% endif %}
