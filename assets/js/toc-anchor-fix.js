(function () {
  "use strict";

  var TOC_LINK_SELECTOR = "#toc a";
  var HEADING_SELECTOR = "main h2[id], main h3[id]";

  function samePageHash(link) {
    var href = link.getAttribute("href");

    if (!href || href === "#") {
      return "";
    }

    try {
      var url = new URL(href, window.location.href);

      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) {
        return "";
      }

      return url.hash;
    } catch (error) {
      return href.charAt(0) === "#" ? href : "";
    }
  }

  function decodeHash(hash) {
    try {
      return decodeURIComponent(hash.slice(1));
    } catch (error) {
      return hash.slice(1);
    }
  }

  function revealToc() {
    var wrapper = document.getElementById("toc-wrapper");
    var toc = document.getElementById("toc");

    if (!wrapper || !toc || toc.children.length === 0) {
      return;
    }

    wrapper.classList.remove("invisible");
  }

  function buildFallbackToc() {
    var wrapper = document.getElementById("toc-wrapper");
    var toc = document.getElementById("toc");

    if (!wrapper || !toc || toc.children.length > 0) {
      return;
    }

    var headings = Array.prototype.slice
      .call(document.querySelectorAll(HEADING_SELECTOR))
      .filter(function (heading) {
        return heading.id && heading.textContent.trim();
      });

    if (headings.length === 0) {
      return;
    }

    var list = document.createElement("ul");
    list.className = "toc-list ";

    headings.forEach(function (heading) {
      var item = document.createElement("li");
      var link = document.createElement("a");

      item.className = "toc-list-item";
      link.className = "toc-link node-name--" + heading.tagName + " ";
      link.href = "#" + heading.id;
      link.textContent = heading.textContent.trim();
      link.setAttribute("data-turbo", "false");

      item.appendChild(link);
      list.appendChild(item);
    });

    toc.appendChild(list);
    revealToc();
  }

  function setActiveLink(hash) {
    Array.prototype.forEach.call(document.querySelectorAll("#toc .is-active-link"), function (link) {
      link.classList.remove("is-active-link");
    });

    Array.prototype.forEach.call(document.querySelectorAll("#toc .is-active-li"), function (item) {
      item.classList.remove("is-active-li");
    });

    if (!hash) {
      return;
    }

    var activeLink = Array.prototype.find.call(document.querySelectorAll(TOC_LINK_SELECTOR), function (link) {
      return samePageHash(link) === hash;
    });

    if (!activeLink) {
      return;
    }

    activeLink.classList.add("is-active-link");

    var item = activeLink.closest(".toc-list-item");
    if (item) {
      item.classList.add("is-active-li");
    }
  }

  function prepareToc() {
    buildFallbackToc();

    Array.prototype.forEach.call(document.querySelectorAll(TOC_LINK_SELECTOR), function (link) {
      if (samePageHash(link)) {
        link.setAttribute("data-turbo", "false");
      }
    });

    revealToc();
  }

  function scrollToHash(hash) {
    var target = document.getElementById(decodeHash(hash));

    if (!target) {
      return false;
    }

    var topbar = document.getElementById("topbar-wrapper");
    var topbarHeight = topbar ? topbar.getBoundingClientRect().height : 0;
    var offset = Math.max(56, topbarHeight + 16);
    var top = target.getBoundingClientRect().top + window.scrollY - offset;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    prepareToc();
    window.history.pushState(null, "", hash);
    window.scrollTo({
      top: Math.max(0, top),
      behavior: reduceMotion ? "auto" : "smooth"
    });
    setActiveLink(hash);

    [250, 900, 1800].forEach(function (delay) {
      window.setTimeout(function () {
        prepareToc();
        setActiveLink(hash);
      }, delay);
    });

    return true;
  }

  document.addEventListener(
    "click",
    function (event) {
      var target = event.target instanceof Element ? event.target : null;
      var link = target ? target.closest(TOC_LINK_SELECTOR) : null;
      var hash = link ? samePageHash(link) : "";

      if (!hash || !scrollToHash(hash)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    },
    true
  );

  document.addEventListener("DOMContentLoaded", prepareToc);
  document.addEventListener("turbo:load", prepareToc);
  window.addEventListener("hashchange", prepareToc);

  prepareToc();
})();
