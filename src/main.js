function installShellFallback(error) {
  console.error("[rw] main module fallback", error);
  const defaultViewId = "dashboard";
  const isValidView = (viewId) => Boolean(viewId && document.getElementById(viewId)?.classList.contains("view"));
  const currentHashView = () => {
    try {
      return decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
    } catch {
      return window.location.hash.replace(/^#/, "").trim();
    }
  };
  const setView = (viewId) => {
    const nextView = isValidView(viewId) ? viewId : defaultViewId;
    document.querySelectorAll(".nav-item").forEach((item) => {
      const active = item.dataset.view === nextView;
      item.classList.toggle("active", active);
      if (active) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
    document.querySelectorAll(".view").forEach((view) => {
      const active = view.id === nextView;
      view.classList.toggle("active", active);
      view.hidden = !active;
      view.setAttribute("aria-hidden", String(!active));
    });
    const nav = [...document.querySelectorAll(".nav-item[data-view]")].find((item) => item.dataset.view === nextView);
    const title = nav?.dataset.title || nav?.textContent?.trim() || "总览";
    const heading = document.getElementById("viewTitle");
    if (heading) heading.textContent = title;
    if (window.location.hash !== `#${nextView}`) window.history.replaceState(null, "", `#${nextView}`);
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
    setView(currentHashView());
  });

  setView(currentHashView());
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
