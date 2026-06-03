(function () {
  const mount = document.getElementById("live2d-assistant");

  if (!mount || typeof window.PIXI === "undefined" || !window.PIXI.live2d) {
    return;
  }

  const modelUrl = mount.dataset.model;
  const desktopLeft = Number.parseFloat(mount.dataset.desktopLeft || "0.35");
  const desktopBottom = Number.parseFloat(mount.dataset.desktopBottom || "0.4");
  const desktopWidth = Number.parseFloat(mount.dataset.desktopWidth || "250");
  const desktopZoom = Number.parseFloat(mount.dataset.desktopZoom || "1.9");
  const desktopYRatio = Number.parseFloat(mount.dataset.desktopYRatio || "1.46");
  const mobileWidth = Number.parseFloat(mount.dataset.mobileWidth || "150");
  const mobileBottom = Number.parseFloat(mount.dataset.mobileBottom || "0.15");
  const mobileZoom = Number.parseFloat(mount.dataset.mobileZoom || "1.65");
  const mobileYRatio = Number.parseFloat(mount.dataset.mobileYRatio || "1.34");

  const app = new PIXI.Application({
    antialias: true,
    autoDensity: true,
    backgroundAlpha: 0,
    height: mount.clientHeight || 420,
    width: mount.clientWidth || desktopWidth
  });

  mount.appendChild(app.view);

  const state = {
    model: null,
    rafId: 0
  };

  function updatePlacement() {
    const isDesktop = window.innerWidth >= 992;
    const width = isDesktop ? desktopWidth : mobileWidth;
    const height = isDesktop ? width * 1.24 : width * 1.28;
    const zoom = isDesktop ? desktopZoom : mobileZoom;
    const yRatio = isDesktop ? desktopYRatio : mobileYRatio;

    mount.style.width = width + "px";
    mount.style.height = height + "px";
    mount.style.left = isDesktop ? desktopLeft + "rem" : "0.75rem";
    mount.style.bottom = isDesktop ? desktopBottom + "rem" : mobileBottom + "rem";

    app.renderer.resize(Math.round(width), Math.round(height));

    if (!state.model) {
      return;
    }

    const bounds = state.model.getLocalBounds();
    const scale = Math.min((width * 0.92) / bounds.width, (height * 0.96) / bounds.height) * zoom;

    state.model.scale.set(scale);
    state.model.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height);
    state.model.position.set(width * 0.48, height * yRatio);
  }

  function focusAt(x, y) {
    if (!state.model) {
      return;
    }

    state.model.focus(x, y);
  }

  function scheduleResetFocus() {
    window.cancelAnimationFrame(state.rafId);
    state.rafId = window.requestAnimationFrame(() => {
      focusAt(window.innerWidth * 0.5, window.innerHeight * 0.58);
    });
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      focusAt(event.clientX, event.clientY);
    },
    { passive: true }
  );

  window.addEventListener("mouseleave", scheduleResetFocus, { passive: true });
  window.addEventListener("blur", scheduleResetFocus, { passive: true });
  window.addEventListener("resize", updatePlacement, { passive: true });

  window.PIXI.live2d.Live2DModel.from(modelUrl, {
    autoInteract: false
  })
    .then((model) => {
      state.model = model;
      app.stage.addChild(model);
      updatePlacement();
      scheduleResetFocus();
      mount.classList.add("is-ready");
    })
    .catch((error) => {
      console.error("Live2D widget failed to load.", error);
      mount.remove();
    });
})();
