import { Editor, Toolbar } from 'ngx-editor';
import { setBlockType } from 'prosemirror-commands';

/**
 * Shared rich-text configuration for the workshop configuration screens.
 *
 * Kept in one place so the Enrollment, Challenges, Settings and popup-banner
 * editors offer the same tools — they used to drift apart.
 *
 * What is safe to offer here is bounded by what the EiFlix app can render: it
 * displays these fields with `flutter_widget_from_html`, which handles
 * headings, lists, quotes, code, rules, images, sub/superscript, alignment and
 * inline colour. Every tool below produces markup that renderer understands.
 */

/** Everything, for the long-form fields (description, join us, block content). */
export const WC2_TOOLBAR_FULL: Toolbar = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
  ['bullet_list', 'ordered_list', 'indent', 'outdent'],
  ['link', 'image', 'blockquote', 'code', 'horizontal_rule'],
  ['text_color', 'background_color'],
  ['superscript', 'subscript'],
  ['align_left', 'align_center', 'align_right', 'align_justify'],
  ['format_clear', 'undo', 'redo'],
];

/** Headline fields — headings matter, layout tools mostly do not. */
export const WC2_TOOLBAR_TITLE: Toolbar = [
  ['bold', 'italic', 'underline'],
  [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
  ['bullet_list', 'link'],
  ['text_color', 'background_color'],
  ['format_clear', 'undo', 'redo'],
];

/** Short one-line items. */
export const WC2_TOOLBAR_ITEM: Toolbar = [
  ['bold', 'italic', 'underline'],
  ['bullet_list', 'ordered_list'],
  ['link'],
  ['text_color'],
  ['format_clear', 'undo', 'redo'],
];

/**
 * Turns the block the cursor is in back into a normal paragraph.
 *
 * The toolbar has no such control of its own: the heading dropdown only lists
 * h1–h6, and while re-clicking the *same* heading does revert it, nothing on
 * screen says so. `format_clear` does not help either — it strips marks (bold,
 * colour) and leaves the block type alone. So a heading was a one-way trip.
 */
export function resetToParagraph(editor: Editor | null | undefined): boolean {
  const view = editor?.view;
  if (!view) return false;
  const paragraph = view.state.schema.nodes['paragraph'];
  if (!paragraph) return false;
  const applied = setBlockType(paragraph)(view.state, view.dispatch);
  view.focus();
  return applied;
}

/**
 * The editor the caret is currently in.
 *
 * The toolbar button must not steal focus before this runs — its mousedown is
 * cancelled in the template so the caret stays in the editor.
 */
export function focusedEditor(...groups: ({ [key: string]: Editor } | Editor[] | null | undefined)[]): Editor | null {
  for (const group of groups) {
    if (!group) continue;
    const list = Array.isArray(group) ? group : Object.values(group);
    const hit = list.find(e => {
      try { return !!e?.view?.hasFocus(); } catch { return false; }
    });
    if (hit) return hit;
  }
  return null;
}
