(function () {
  const key = "mydiary_theme";
  const root = document.documentElement;

  function apply(mode) {
    root.setAttribute("data-theme", mode === "light" ? "light" : "dark");
  }

  const saved = localStorage.getItem(key);
  apply(saved || "dark");

  window.__toggleTheme = function toggleTheme() {
    const cur = root.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    localStorage.setItem(key, next);
    apply(next);
  };
})();
