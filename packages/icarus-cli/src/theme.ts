/**
 * Theme — color tokens and text styling for icarus CLI.
 *
 * Semantic naming: what something IS, not what color it happens to be.
 * All colors are Ink-compatible string values.
 */

// ---------------------------------------------------------------------------
// Palette — base colors
// ---------------------------------------------------------------------------

const palette = {
  white: "white",
  black: "black",
  gray: "gray",
  blue: "blue",
  cyan: "cyan",
  green: "green",
  yellow: "yellow",
  red: "red",
  magenta: "magenta",
} as const;

// ---------------------------------------------------------------------------
// Semantic tokens
// ---------------------------------------------------------------------------

export const colors = {
  // Text hierarchy
  text: palette.white,
  textDim: palette.gray,
  textAccent: palette.cyan,

  // Roles
  user: palette.blue,
  assistant: palette.white,
  system: palette.yellow,

  // Events
  toolCall: palette.cyan,
  toolResult: palette.green,
  toolError: palette.yellow,
  satellite: palette.gray,
  injection: palette.magenta,

  // UI chrome
  header: palette.cyan,
  headerDim: palette.gray,
  border: palette.gray,
  prompt: palette.blue,
  status: palette.gray,
} as const;

// ---------------------------------------------------------------------------
// Box drawing
// ---------------------------------------------------------------------------

export const border = {
  horizontal: "─",
  vertical: "│",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  teeLeft: "├",
  teeRight: "┤",
} as const;
