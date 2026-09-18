# 2026-07-06 — dynamic-studio-v2: comment out the studio chat bubble (std-chat-fab)

Operator request: "comment out the chat bubble in the studio" — specifically the **bottom-right chat
button that leads to `studio_chat`**.

## Disambiguation
There are TWO floating teal chat bubbles in the studio corner:
- `.std-chat-fab` (`dynamic-studio-v2.component.html` ~L1448) — 50px bubble at `bottom:80px`, unread badge,
  opens `.std-chat-popup` which reads/writes the **`studio_chat`** Firestore collection. ← the one meant.
- `.chat-container` (~L92) — 44px bubble at `bottom:20px`, opens the "Participant Conversation" list
  (`.example-container`). **Left untouched.**

## Change (HTML only)
Wrapped the `std-chat-fab` **button** and its entire `std-chat-popup` panel (the head, message list,
attachment previews, and input row) in a single Angular HTML comment `<!-- ... -->` in
`dynamic-studio-v2.component.html`. Chose to comment the popup too (not just the bubble) because
`showChatNotification()`'s `notification.onclick` (ts ~L5120) also sets `isChatOpen = true` +
`openChat()` — so a desktop-notification click could otherwise still surface the popup. With the popup
markup commented, `isChatOpen` has nothing to render.

- No TS changed: `openChat()`/`chatUnreadSub`/`sendChatMessage()` etc. still exist but are now UI-unreachable
  (harmless — the unread subscription just updates a counter no one displays).
- The comment safely spans a block containing the `[class.std-chat-msg--mine]` binding (a `--` inside the
  comment). Verified this parses: `ng serve` rebuilt clean, `dynamic-studio-v2-component` chunk built, no
  studio-v2 errors.

## Gotcha (fixed)
First attempt didn't hide the bubble: the comment's own descriptive text contained the literal `-->`,
which **closed the HTML comment early** — so the button + popup after it still rendered. Fix: keep the
`<!-- ... -->` wrapper's inner text free of `-->` (and of `--` immediately before `>`). Verified by the
compiled chunk shrinking 839 kB → 823 kB once the markup was truly excluded.

## Revert
Delete the two comment markers: the `<!-- Studio chat bubble + popup commented out per request ...`
opener just above `<button ... class="std-chat-fab" ...>`, and the matching `-->` line just before the
final `</div>` after `.std-chat-popup__input`. No other change needed.
