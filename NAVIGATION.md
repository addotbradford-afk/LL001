# Line Logic header standard

The Pop Quiz navigation is the site-wide default: keep the existing page logo at the top left, and a small rounded Home link with a house icon at the top right. Home returns to the WUK home menu at `https://linelogic.uk/wuk/?home=1`. Signed-in users return directly to the menu without replaying the opening animation.

Use `site-header.css` and the `.site-header` / `.site-header-inner` / `.site-home-link` markup for top-level static pages. The same stylesheet is kept in the main Line Logic and LL001 repositories; keep those copies aligned. Pop Quiz uses its existing `QuizHeader` component with equivalent positioning and styling.

The header has a 1200px outer maximum width, 44px desktop side padding and a 104px row. At 600px and below it uses 20px side padding and an 82px row. Home is at least 40px high on desktop and 44px on phones. Preserve the visible Home label, accessible focus state and existing branding.

Main-site account controls mount in `.site-session-slot`, alongside Home on desktop and on a separate row below it on narrow screens. In LL001 the flight identity stays on the left and map controls sit below the header. Embedded training panels retain the enclosing page's navigation.

Leaving a live scenario or a single/multiplayer quiz requires the existing Stay here / Return home overlay. Menu, search and setup pages return directly. Keep these behaviours when adding pages.


## LL001 scenario exit

LL001 uses an Exit control with a boxed X in place of Home. Its confirmation asks “Are you sure you want to exit?” with “No, stay here” and “Yes”. Confirming returns to the scenarios dashboard at `https://linelogic.uk/wuk/guided.html`, preserving the signed-in session through the account-session handoff. Escape or No cancels and restores focus to Exit.
