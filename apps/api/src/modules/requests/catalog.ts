/** Fixed choices offered on the quote request form. Keys are stored in the database. */
export const TATTOO_STYLES = {
  fine_line: 'Fine line',
  traditional: 'Traditional',
  neo_traditional: 'Neo-traditional',
  realism: 'Realism',
  blackwork: 'Blackwork',
  japanese: 'Japanese',
  geometric: 'Geometric',
  watercolor: 'Watercolor',
  lettering: 'Lettering',
  other: 'Other',
} as const;

export type TattooStyle = keyof typeof TATTOO_STYLES;
export const STYLE_KEYS = Object.keys(TATTOO_STYLES) as [TattooStyle, ...TattooStyle[]];

export const COLOR_MODES = {
  color: 'Color',
  black_grey: 'Black & grey',
} as const;

export type ColorMode = keyof typeof COLOR_MODES;
export const COLOR_MODE_KEYS = Object.keys(COLOR_MODES) as [ColorMode, ...ColorMode[]];

/** Suggestions only; placement is free text. */
export const PLACEMENT_SUGGESTIONS = [
  'Forearm (inner)',
  'Forearm (outer)',
  'Upper arm',
  'Shoulder',
  'Back',
  'Chest',
  'Ribs',
  'Thigh',
  'Calf',
  'Ankle',
  'Wrist',
  'Hand',
  'Neck',
] as const;

export const DEFAULT_CURRENCY = 'MXN';

export const SIZE_LIMITS_CM = { min: 1, max: 200 } as const;
