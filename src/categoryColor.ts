// v0.2 Step 4 fragment: one source of truth for "given a category id, what is
// its color?" All coloring in the app is CSS-class-driven off theme variables
// (see src/index.css), so this helper just maps to the class + a CSS variable
// reference the caller can inline into fill/stroke on SVG paths.

import type { CategoryDefStored, PaperCategoryAssignment } from './api'

export const DEFAULT_CATEGORY_PALETTE = [
  '#4f6ad6', '#0c9c78', '#c66a1a', '#b25aa8', '#c02e24',
  '#7d6ac2', '#0f7791', '#8f8b1c', '#c33e75', '#5e6773',
]

const PALETTE_KEY = 'aibc-category-palette'

export function loadCategoryPalette(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PALETTE_KEY) || 'null')
    if (Array.isArray(saved) && saved.length === 10 && saved.every((value) => /^#[0-9a-f]{6}$/i.test(value))) {
      return saved
    }
  } catch { /* use defaults */ }
  return [...DEFAULT_CATEGORY_PALETTE]
}

export function saveCategoryPalette(palette: string[]) {
  localStorage.setItem(PALETTE_KEY, JSON.stringify(palette))
}

/** CSS class for a category chip / node fill. */
export function categoryClass(colorSlot: number): string {
  const slot = ((colorSlot - 1) % 10 + 10) % 10 + 1
  // Matches the report-chip CSS selectors (`.cat-chip.c1` … `.c10`).
  return `c${slot}`
}

/** CSS variable reference for use in inline `style` (e.g. SVG `fill`). */
export function categoryVar(colorSlot: number): string {
  const slot = ((colorSlot - 1) % 10 + 10) % 10 + 1
  return `var(--cat-${slot})`
}

/** Build id → color_slot lookup from a stored category set. */
export function slotMap(cats: CategoryDefStored[]): Map<string, number> {
  return new Map(cats.map(c => [c.id, c.color_slot]))
}

/** Primary category of a paper (highest confidence, ties → user-list order).
 * Returns null when the paper has no assignments on the current set. */
export function primaryCategory(
  assignments: PaperCategoryAssignment[] | null | undefined,
): PaperCategoryAssignment | null {
  if (!assignments || assignments.length === 0) return null
  // Assignments come pre-sorted primary-first from the backend, but sort here
  // too for safety when callers slice the list.
  const p = assignments.find(a => a.is_primary)
  if (p) return p
  return [...assignments].sort((a, b) => b.confidence - a.confidence)[0] ?? null
}
