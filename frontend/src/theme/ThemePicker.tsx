import { useSyncExternalStore, useId } from "react";
import { getTheme, setTheme, subscribeTheme, type Theme } from "./theme";
export default function ThemePicker({
  compact = false,
}: {
  compact?: boolean;
}) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  const id = useId();
  return (
    <div className={compact ? "theme-picker compact" : "theme-picker"}>
      <label htmlFor={id}>Tema de la pantalla</label>
      <select
        id={id}
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
      >
        <option value="light">Claro</option>
        <option value="dark">Oscuro</option>
        <option value="system">Según el dispositivo</option>
      </select>
    </div>
  );
}
