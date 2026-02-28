---
name: Ubuntu-style UI workflow
overview: Align ElastOS desktop visuals with Ubuntu/GNOME (top bar, dock-style taskbar, window chrome, clock, system tray). Optional final part covers UNIX-style UX (keyboard shortcuts, path bar, Copy path, Open terminal here, shortcuts overlay, focus/ARIA) for later.
todos:
  - id: dock-style-taskbar
    content: Make bottom taskbar dock-style (floating, pill, centered) in style.css
    status: done
  - id: window-head-adwaita
    content: Window head height ~38px, reduce inactive grayscale, optional Adwaita-like buttons
    status: done
  - id: clock-widget
    content: Add clock (and optional date) in toolbar or new top bar
    status: done
  - id: top-bar-optional
    content: Optional full-width top bar with Activities, clock, system tray, profile
    status: done
  - id: system-tray
    content: System tray placeholders (WiFi, sound, power) opening Settings or dropdown
    status: pending
  - id: alt-tab
    content: Add Alt+Tab / Super+Tab and optional Alt+F4 in keyboard_shortcuts.js and keyboard.js
    status: pending
  - id: copy-path-terminal-here
    content: Add Copy path and Open terminal here to explorer/desktop context menu
    status: pending
  - id: shortcuts-overlay
    content: Add Keyboard shortcuts overlay/modal and link from launch menu or Settings
    status: pending
  - id: path-bar-edit
    content: Ensure path bar is editable or add Edit location; navigate on Enter
    status: pending
  - id: focus-aria
    content: Add focus indicators and ARIA roles for context menu, taskbar, window chrome
    status: pending
isProject: false
---

# Ubuntu-style UI Workflow Plan

## Part 1: Visual comparison to Ubuntu (GNOME)

### 1.1 Top bar

| Ubuntu | ElastOS today |
|--------|----------------|
| Full-width top bar, ~30–40px, semi-transparent with blur; left: Activities; center: clock + date; right: system tray (WiFi, battery, sound, power) | **Toolbar**: floating pill, 30px, centered, rounded bottom; cloud, chat, wallet, profile on right; no clock in top area; no system tray |

**Gap:** No full-width system bar; no central clock; no top-right system indicators.

### 1.2 Dock / taskbar

| Ubuntu | ElastOS today |
|--------|----------------|
| **Dock**: centered at bottom, floating (inset from edges), pill-shaped, blur; icons only with running indicator | **Taskbar**: fixed to bottom (or left/right), full width when bottom; 40px items; not floating |

**Gap:** Taskbar is edge-to-edge and not dock-shaped when bottom.

### 1.3 Window chrome

| Ubuntu | ElastOS today |
|--------|----------------|
| Adwaita: title bar ~36–40px, 12px radius, flat; min/max/close on right | **Window head**: ~30px, 12px radius; icon + title left; min/max/close right; **grayscale(80%)** when inactive |

**Gap:** Inactive windows very muted; title bar height and button style can match Adwaita.

### 1.4 Desktop and global look

- Ubuntu: full-bleed wallpaper; Activities overview. ElastOS has wallpaper and desktop grid; no overview (optional).
- Adwaita: rounded corners, consistent spacing. ElastOS already uses 12px radius and theme variables; toolbar/taskbar use blur.

---

## Part 2: UI work to get closer to Ubuntu

### A. Top bar (optional “Ubuntu-like” mode)

- **Option A1 – Full-width top bar**  
  Add a top bar (full width, ~36px, semi-transparent + blur): left = Activities/launcher icon; center = **clock + date** (e.g. “tor 26 feb 20:20”); right = system indicators + **profile** (reuse existing dropdown). Hide or repurpose the current floating toolbar when this mode is on.
- **Option A2 – Minimal**  
  Add only a **clock** in the existing toolbar (center or right).

**Files:** New top-bar section in [UIDesktop.js](src/gui/src/UI/UIDesktop.js) or new component; [style.css](src/gui/src/css/style.css); optional clock widget and system-tray placeholder.

### B. Dock-style taskbar (when position = bottom)

- For `.taskbar.taskbar-position-bottom`: **width** `max-content`; **center** with `left: 50%; transform: translateX(-50%)`; **inset** e.g. `bottom: 8px` so it floats; **border-radius** ~24px for a pill; keep semi-transparent + blur.
- **Files:** [style.css](src/gui/src/css/style.css) under `.taskbar.taskbar-position-bottom`; [UITaskbar.js](src/gui/src/UI/UITaskbar.js) if a “dock mode” class or wrapper is needed.

### C. Window title bar (Adwaita-like)

- **Height:** `.window-head` to ~36–40px (e.g. 38px).
- **Inactive:** Remove or reduce `filter: grayscale(80%)` on `.window-head`; use subtle opacity or background difference instead.
- **Buttons:** Optionally restyle min/max/close to single-color, circular or rounded-square (Adwaita-like).
- **Files:** [style.css](src/gui/src/css/style.css) – `.window-head`, `.window-head-title`, window button selectors.

### D. Clock and system tray

- **Clock:** Widget in new top bar or in current toolbar; date + time; locale-aware.
- **System tray:** Region (top-right in new bar or toolbar) with placeholders for WiFi, sound, power, user; first step: icons that open Settings or a dropdown.
- **Files:** New clock component; new tray component or region; [style.css](src/gui/src/css/style.css).

### E. Theme / layout variant

- Use existing `data-theme="light"` / dark and `--taskbar-*`, `--window-head-*`.
- Optional “Ubuntu-style” or “GNOME-like” layout variant: full-width top bar + dock-style bottom bar + Adwaita-like window tweaks.
- **Files:** [style.css](src/gui/src/css/style.css), [ThemeService.js](src/gui/src/services/ThemeService.js) or settings for layout mode.

---

## Suggested order of work (UI first)

| # | Item | Status |
|---|------|--------|
| 1 | Dock-style bottom taskbar – floating pill, centered, inset | done |
| 2 | Window head – 38px height, less inactive grayscale, optional Adwaita-like buttons | done |
| 3 | Clock – in toolbar or top bar | done |
| 4 | Full top bar (optional) – Activities, clock, system tray, profile | done |
| 5 | System tray placeholders – WiFi, sound, power, open Settings/dropdown | pending |
| 6 | Alt+Tab / Super+Tab, optional Alt+F4 | pending |
| 7 | Copy path and Open terminal here in explorer/desktop context menu | pending |
| 8 | Keyboard shortcuts overlay – linked from launch or Settings | pending |
| 9 | Path bar editable – Edit location, navigate on Enter | pending |
| 10 | Focus + ARIA – focus indicators, roles/labels for context menu, taskbar, window | pending |

---

## Part 3 (Final): UNIX desktop UX – optional / later

For when you want to align behavior and discoverability with typical UNIX desktops. Not required for the UI workflow above.

### Keyboard and navigation

| UNIX expectation | Current state | Gap |
|------------------|---------------|-----|
| Window switching (Alt+Tab / Super+Tab) | None | Add global next/previous window shortcut |
| Close window (Alt+F4) | Ctrl+W only | Add Alt+F4 for consistency |
| Type-ahead in file list, Cmd+K search, New file/folder, Copy/paste, Delete | Implemented in [keyboard_shortcuts.js](src/gui/src/helpers/keyboard_shortcuts.js) and [keyboard.js](src/gui/src/keyboard.js) | Good |

### Path bar and terminal

| UNIX expectation | Current state | Gap |
|------------------|---------------|-----|
| Editable path / address bar | [UIWindow.js](src/gui/src/UI/UIWindow.js) has `.window-navbar-path` and path segments; `.window-navbar-path-input` exists | Ensure editable and visible |
| Copy path | Not in context menu | Add to explorer/desktop context menu |
| Open terminal here | Terminal exists ([UIWindowSystemTerminal.js](src/gui/src/UI/UIWindowSystemTerminal.js)) but no entry from explorer | Add from file manager with cwd |

### Menus and discoverability

- Add a **Keyboard shortcuts** overlay (e.g. new `UIWindowShortcuts.js`) linked from launch menu or Settings, listing global shortcuts.

### Accessibility

- [style.css](src/gui/src/css/style.css): visible `:focus-visible` and `.item-selected` ring.
- [UIContextMenu.js](src/gui/src/UI/UIContextMenu.js), [UITaskbar.js](src/gui/src/UI/UITaskbar.js), [UIWindow.js](src/gui/src/UI/UIWindow.js): add `role` and `aria-label` for menus, taskbar, window title.
- Optional: respect `prefers-reduced-motion` for animations.

### Files to touch (Part 3)

- [src/gui/src/helpers/keyboard_shortcuts.js](src/gui/src/helpers/keyboard_shortcuts.js), [src/gui/src/keyboard.js](src/gui/src/keyboard.js) – Alt+Tab, Alt+F4.
- [src/gui/src/helpers/new_context_menu_item.js](src/gui/src/helpers/new_context_menu_item.js), [UIItem.js](src/gui/src/UI/UIItem.js) or [UIDesktop.js](src/gui/src/UI/UIDesktop.js) – Copy path, Open terminal here.
- [src/gui/src/UI/UIWindow.js](src/gui/src/UI/UIWindow.js) – path bar edit.
- New shortcuts overlay component; [style.css](src/gui/src/css/style.css) and menu/taskbar/window components for focus and ARIA.

---

## Files summary

| Area | Files |
|------|--------|
| Dock and window chrome | [src/gui/src/css/style.css](src/gui/src/css/style.css) |
| Top bar, clock, system tray | New components or [UIDesktop.js](src/gui/src/UI/UIDesktop.js); [style.css](src/gui/src/css/style.css) |
| Global shortcuts (Part 3) | [src/gui/src/helpers/keyboard_shortcuts.js](src/gui/src/helpers/keyboard_shortcuts.js), [src/gui/src/keyboard.js](src/gui/src/keyboard.js) |
| Context menu – Copy path, Open terminal here (Part 3) | [src/gui/src/helpers/new_context_menu_item.js](src/gui/src/helpers/new_context_menu_item.js), [UIItem.js](src/gui/src/UI/UIItem.js), [UIDesktop.js](src/gui/src/UI/UIDesktop.js) |
| Path bar (Part 3) | [src/gui/src/UI/UIWindow.js](src/gui/src/UI/UIWindow.js) |
| Shortcuts overlay, focus and ARIA (Part 3) | New component; [style.css](src/gui/src/css/style.css), [UIContextMenu.js](src/gui/src/UI/UIContextMenu.js), [UITaskbar.js](src/gui/src/UI/UITaskbar.js), [UIWindow.js](src/gui/src/UI/UIWindow.js) |
