function installShellFallback(error) {
  console.error("[rw] main module fallback", error);
  const setView = (viewId) => {
    if (!viewId || !document.getElementById(viewId)?.classList.contains("view")) return;
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === viewId);
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("active", view.id === viewId);
    });
    const nav = [...document.querySelectorAll(".nav-item[data-view]")].find((item) => item.dataset.view === viewId);
    const title = nav?.dataset.title || nav?.textContent?.trim() || "总览";
    const heading = document.getElementById("viewTitle");
    if (heading) heading.textContent = title;
    if (window.location.hash !== `#${viewId}`) window.history.pushState(null, "", `#${viewId}`);
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const nav = target.closest(".nav-item[data-view], [data-jump]");
    if (nav) {
      event.preventDefault();
      setView(nav.dataset.view || nav.dataset.jump);
      return;
    }
    if (target.closest("#authOpenBtn")) {
      event.preventDefault();
      document.getElementById("authDialog")?.showModal();
    }
    if (target.closest("#authCloseBtn")) {
      event.preventDefault();
      document.getElementById("authDialog")?.close();
    }
  }, true);

  window.addEventListener("hashchange", () => {
    const view = window.location.hash.replace(/^#/, "");
    setView(view || "dashboard");
  });

  setView(window.location.hash.replace(/^#/, "") || "dashboard");
  const hint = document.getElementById("authHint");
  if (hint) hint.textContent = "页面进入恢复模式。请先清理本机缓存，再刷新页面。";
}

try {
  await import("./app.js");
} catch (error) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => installShellFallback(error));
  } else {
    installShellFallback(error);
  }
}
