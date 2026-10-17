# PortWise design notes

These notes add to the *Frontend Source of Truth*: the guide fixes the palette, type, tokens and motion budget, and this file records the choices made where the guide left room.

## Concept: the docket fills in

The result panel is on screen from the first visit, as an empty landed-cost docket. It lists the real sequence (customs value, duty, levies, VAT, total) with blanks and plain-language explanations, so the page explains how the number is built before anyone types. Calculate fills the same docket. Nothing jumps and nothing new appears from nowhere.

## The one bold element: the container

The cost split is drawn as the side of a shipping container, with corner castings, a corrugated wall and end doors with locking bars. The four cost parts load in from left to right. Widths are exact shares, and tiny parts keep a minimum width; the legend carries the exact figure. It is the only decorative flourish, and it carries real data. The empty container appears in the idle docket and on the 404 page.

## Layout

- **Desktop:** a navy harbour band behind the header and hero. The docket rises into the band at the top right like a document laid on the quay, and the form sits at the bottom left, overlapping the band's edge.
- **Mobile:** single column in the order hero, form, docket. A sticky bar offers Edit goods and Share estimate once there is a result.
- Everything is left-aligned. Sequences are numbered only where they are real sequences: the "Show the math" steps and the five methodology steps.

## Deliberately avoided

- All-caps eyebrow labels (labels are sentence case).
- Stats rows, gradients, decorative hero imagery.
- Identical cards everywhere (radius follows hierarchy: input 8, button 10, card 14, chip 999).
- Scattered entrance animations. There is one orchestrated reveal (docket rises, cargo loads, rows stagger, total counts up); everything else responds only to the user.

## Accessibility and contrast notes

- Input borders use `#7F90A8` (3.2:1 on white) rather than `#B9C6D8`, to meet the 3:1 non-text contrast rule.
- Amber never carries text on white. Amber fills get a darker `#B07A00` outline.
- Errors use colour plus an icon plus text.
- The animated total is `aria-hidden`; screen readers hear the final value once from a polite status region.
