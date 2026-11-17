// Values the browser needs as literals (meta theme-color, web manifest). The only file besides
// theme.css allowed to hold colour literals. Keep in sync with --tk-primary and --tk-bg.
export const THEME_COLOR = "#0E7A5C";
export const BACKGROUND_COLOR = "#F4FAF6";

// LINE Flex cards cannot use CSS variables: same palette as theme.css, as literals.
export const LINE_COLORS = {
  title: "#0A6149", // primary-hover (7.5:1 on white)
  text: "#10282B", // ink
  muted: "#506468",
  button: "#0E7A5C", // primary: the Flex button label is white, so the fill must be dark
} as const;
