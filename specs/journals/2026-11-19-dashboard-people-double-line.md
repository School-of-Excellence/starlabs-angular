# 2026-11-19: Workshop dashboard, double line under the People cards

## Report

The operator sent a screenshot of At a glance: under Existing Participants / New Users / New Users Not Enrolled there were two horizontal lines a few pixels apart, above the Top tags row.

## Cause

- **The Participation and People groups share one row** (`.wdx-groups` is a wrapping flex row) once the content area is wide enough, about 1180px or more. Flex stretches both groups to the taller one.
- **Participation is taller.** Its **Completed** card has an extra line ("of N enrolled"), so its cards are 100px tall. The People cards have no extra line and stay at the 96px minimum.
- **The People cards did not fill the stretched group.** `.wdx-grp` was a plain block, so the cards stayed 96px tall inside a 100px group.
- **So the card bottom border showed.** It is normally hidden by the cells' `-1px` bottom margin plus `overflow:hidden`. Here it sat 4px above the group's bottom, and the At a glance row draws its own top border right under the group. That made two lines.
- **When the screen is narrower,** People wraps to its own line and the bug does not show.

## Fix

`workshop-dashboard.component.css`, after `.wdx-grp-cells`:

- `.wdx-groups>.wdx-grp` is now a flex column;
- its header doesn't shrink;
- its cells grow to fill the group (`flex:1 1 auto`).

The People cards now stretch to 100px. Their numbers line up with Participation's, and their bottom border is clipped as before.

The selector is scoped to `.wdx-groups>`, so the Needs attention group in the At a glance row, which has its own height rule, is untouched. The category-based layout gets the same fix: Progress by group has taller cards with a bar.

## Checks

- **Test page,** built from the real global sheets (Bootstrap and `styles.css`) plus the component CSS, with the real group markup. Measured the gap between the card bottom and the group bottom:
  - **before:** 3px of strip plus the 1px border at 1878px and 1300px wide;
  - **after:** none at 1878, 1300, 1150 (wrapped) and 560 (two columns). The narrow layouts did not change.
- **Production build:** exit 0, with the same 36 warnings as before, all in other files.
- **No hub spec checks the group geometry,** so the e2e set was not re-run.
- **Not committed.** The operator commits.
