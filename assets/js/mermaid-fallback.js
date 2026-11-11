(function () {
  "use strict";

  async function renderDiagrams() {
    if (!window.mermaid || typeof window.mermaid.run !== "function") {
      return;
    }

    var pending = [];

    document.querySelectorAll("pre > code.language-mermaid").forEach(function (code) {
      var source = code.parentElement;
      var next = source.nextElementSibling;

      // Chirpy may already have prepared or rendered this diagram.
      if (next && next.classList.contains("mermaid")) {
        return;
      }

      var diagram = document.createElement("pre");
      diagram.className = "mermaid";
      diagram.textContent = code.textContent;
      source.after(diagram);
      pending.push({ source: source, diagram: diagram });
    });

    if (pending.length === 0) {
      return;
    }

    window.mermaid.initialize({
      startOnLoad: false,
      theme: document.documentElement.dataset.mode === "dark" ? "dark" : "default"
    });

    try {
      await window.mermaid.run({
        nodes: pending.map(function (item) { return item.diagram; })
      });
      pending.forEach(function (item) { item.source.classList.add("d-none"); });
    } catch (error) {
      // Keep the readable source if the library cannot render the diagram.
      pending.forEach(function (item) { item.diagram.remove(); });
      console.warn("Unable to render Mermaid diagram", error);
    }
  }

  document.addEventListener("DOMContentLoaded", renderDiagrams);
  document.addEventListener("turbo:load", renderDiagrams);
  if (document.readyState !== "loading") {
    renderDiagrams();
  }
})();
