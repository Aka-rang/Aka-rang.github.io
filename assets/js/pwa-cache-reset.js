(function () {
  "use strict";

  function clearCaches() {
    if (!("caches" in window)) {
      return Promise.resolve();
    }

    return window.caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          return window.caches.delete(key);
        })
      );
    });
  }

  function unregisterServiceWorkers() {
    if (!("serviceWorker" in navigator)) {
      return Promise.resolve();
    }

    return navigator.serviceWorker.getRegistrations().then(function (registrations) {
      return Promise.all(
        registrations.map(function (registration) {
          return registration.unregister();
        })
      );
    });
  }

  window.addEventListener("load", function () {
    Promise.all([unregisterServiceWorkers(), clearCaches()]).catch(function () {});
  });
})();
