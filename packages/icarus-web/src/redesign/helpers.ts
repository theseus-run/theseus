import type { MissionStatus, Tone } from "./types";

export function toneClass(tone: Tone) {
  switch (tone) {
    case "good":
      return "tone-good";
    case "process":
      return "tone-process";
    case "danger":
      return "tone-danger";
    case "muted":
      return "tone-muted";
  }
}

export function statusSymbol(status: MissionStatus) {
  switch (status) {
    case "defining":
      return "·";
    case "active":
      return "◆";
    case "review":
      return "◦";
    case "paused":
      return "×";
  }
}
