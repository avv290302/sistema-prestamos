export type Theme = "light" | "dark" | "system";
const key = "prestamos-theme";
let preference: Theme = "system";
try {
  const saved = localStorage.getItem(key);
  if (saved === "dark" || saved === "light" || saved === "system")
    preference = saved;
} catch {
  /* Private browsing may deny storage. */
}
const media = window.matchMedia("(prefers-color-scheme: dark)");
function apply() {
  document.documentElement.dataset.theme =
    preference === "system" ? (media.matches ? "dark" : "light") : preference;
}
apply();
media.addEventListener("change", apply);
export function getTheme() {
  return preference;
}
export function setTheme(value: Theme) {
  preference = value;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Keep in-memory preference. */
  }
  apply();
  window.dispatchEvent(new Event("theme-change"));
}
export function subscribeTheme(callback: () => void) {
  window.addEventListener("theme-change", callback);
  return () => window.removeEventListener("theme-change", callback);
}
window.addEventListener("storage", (event) => {
  if (event.key === key) {
    preference =
      event.newValue === "light" || event.newValue === "dark"
        ? event.newValue
        : "system";
    apply();
    window.dispatchEvent(new Event("theme-change"));
  }
});
