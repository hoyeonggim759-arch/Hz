"use client";

import { useAccentTheme } from "./theme-provider";

const options = [
  { id: "blue" as const, label: "蓝色" },
  { id: "violet" as const, label: "紫色" },
  { id: "cyan" as const, label: "青色" },
];

export function AccentPicker() {
  const { accent, setAccent } = useAccentTheme();
  return (
    <div className="accent-picker" role="group" aria-label="品牌强调色">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className={`accent-dot accent-dot-${option.id}${accent === option.id ? " is-active" : ""}`}
          aria-label={`切换为${option.label}主题色`}
          aria-pressed={accent === option.id}
          title={`${option.label}主题色`}
          onClick={() => setAccent(option.id)}
        />
      ))}
    </div>
  );
}
