# Rich-text fields: headings, the way back to normal, and a fuller toolbar

**Date:** 2026-09-09 · **Branch:** `nanda-development` (uncommitted) · **Status:** built, builds green, runtime unverified behind login

Operator, on the workshop configuration rich-text fields: applying Heading 1 to a selected
word changes other lines too; a heading cannot be turned back into normal text; and they
want more headings and more tools.

---

## 1. What was actually wrong (and what was not)

Three complaints, three different answers. Worth separating, because only two were defects.

### "I can't turn a heading back to normal" — a real gap, now fixed
Read from `ngx-editor@19.0.0-beta.1`:
- The heading dropdown only offers `h1`–`h6`; the library's `ToolbarDropdown` type has no
  paragraph entry, so there was no visible way back.
- `Heading.toggle()` *does* revert to a paragraph when the same level is re-clicked, but
  nothing on screen says so.
- **`format_clear` does not help**: its `insert()` only calls `tr.removeMark(...)` for each
  mark. It strips bold/colour and leaves the block type alone.

So a heading really was close to a one-way trip. Added a **Normal** button, appended to
every editor's menu bar via the library's supported `customMenuRef` template input (it
renders inside `.NgxEditor__MenuBar`, confirmed in the component template). It runs
`setBlockType(paragraph)` on whichever editor holds the caret, with `mousedown` cancelled so
the click does not steal focus first.

### "Selecting a word makes other lines a heading too" — not a bug, and provable
A heading is a **block** type, so it applies to the whole block, never to one word. Tested
against real ProseMirror (schema shaped like the library's, no DOM needed):

```
CASE A — two separate paragraphs, select one word in the first
   before: paragraph("alpha one") + paragraph("beta two")
   after : heading1("alpha one") + paragraph("beta two")     <- neighbours untouched

CASE B — ONE paragraph holding two visual lines via a line break
   before: paragraph("alpha one" <br> "beta two")
   after : heading1("alpha one" <br> "beta two")              <- both lines become the heading

CASE C — the new Normal button on that heading
   after : paragraph(...)                                     <- reverted
```

So the editor is not leaking across real paragraphs (Case A). What the operator hit is
**Case B**: when lines were made with Shift+Enter, or the content was pasted/authored that
way, what looks like separate lines is one block, and the whole block converts.

**The practical remedy is authoring, not code:** press Enter for a new paragraph (each line
is then its own block and converts independently) and reserve Shift+Enter for a soft line
break inside one block. Nothing in ProseMirror can make a single word a heading.

### "More headings, more tools" — done
`h1`–`h6` everywhere (was `h1`–`h3`), and the toolbar now offers the library's full set.

## 2. What the tools are bounded by

The tools offered are limited by what the EiFlix app can actually render — it displays these
fields with `flutter_widget_from_html` (`workshop_html.dart`), whose own doc comment notes
headings, paragraphs, bold runs and inline colour/background spans are preserved. That
package also handles lists, quotes, code, rules, images and sub/superscript, so every item
added below produces markup the app understands. Nothing was added that the app would drop.

Full toolbar: bold/italic/underline/strike · headings h1–h6 · bullet & ordered lists,
indent/outdent · link, image, blockquote, code, horizontal rule · text & background colour ·
superscript/subscript · four alignments · clear formatting, undo, redo — plus **Normal**.

## 3. One shared definition

The four screens each carried their own toolbar array and had already drifted. They now all
import from `wc2-editor.ts`, which holds three toolbars (full, title, item), the
`resetToParagraph` helper and a `focusedEditor` lookup. Ten editor instances across the
Enrollment, Challenges, Settings and popup-banner screens were wired to the shared set and
to the Normal button.

The narrow fields deliberately keep the lighter title/item toolbars — the full bar wraps to
three rows in a half-width column, which the harness showed clearly.

## 4. Verification

- Dev and production builds green.
- ProseMirror semantics verified by running the commands directly (above), not by reasoning
  about them.
- Library behaviour read from the shipped source, not assumed: `Heading.toggle`,
  `FormatClear.insert`, the `TBItems` union, and the menu template's `customMenuRef` outlet.
- Toolbar layout rendered in a harness with the real global stylesheets: 26 items wrap to
  two rows at full width, the Normal button renders in the bar with the house styling, no
  horizontal overflow.
- **Not verified at runtime** — the screen is behind login. The operator pass should apply a
  heading to a paragraph, press Normal to revert it, and try Enter versus Shift+Enter on a
  block that previously misbehaved.
