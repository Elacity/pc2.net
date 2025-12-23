# Puter AI Chat - Exact UI Elements Specification

**Date:** 2025-12-23  
**Purpose:** Document ALL UI elements, CSS classes, structure, and styling from Puter's AI chat implementation  
**Source:** Analysis of Puter commits `e7876644` and `c3bb4c48`

---

## Table of Contents

1. [Panel Structure](#panel-structure)
2. [Header Components](#header-components)
3. [Message Components](#message-components)
4. [Input Area Components](#input-area-components)
5. [File Attachment UI](#file-attachment-ui)
6. [Menu & Dropdown](#menu--dropdown)
7. [Colors & Typography](#colors--typography)
8. [Icons & SVGs](#icons--svgs)
9. [Layout & Spacing](#layout--spacing)
10. [Interactive States](#interactive-states)

---

## Panel Structure

### Main Panel Container

```html
<div class="ai-panel">
  <!-- Header -->
  <div class="ai-panel-header">...</div>
  
  <!-- Messages -->
  <div class="ai-chat-messages">...</div>
  
  <!-- Input Area -->
  <div class="ai-chat-input-container">...</div>
</div>
```

**CSS:**
```css
.ai-panel {
    display: none;                    /* Hidden by default */
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;                     /* Fixed width */
    height: 100%;
    height: 100dvh;                    /* Dynamic viewport height */
    background-color: #ffffff;         /* White background */
    flex-direction: column;
    z-index: 999999;
    -webkit-font-smoothing: antialiased;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);  /* Left shadow */
}

.ai-panel-open {
    display: flex;                     /* Show when open */
}
```

---

## Header Components

### Header Structure

```html
<div class="ai-panel-header">
    <button class="ai-menu-btn" title="Menu">
        <!-- Hamburger menu icon -->
    </button>
    <div class="btn-hide-ai">
        <div class="generic-close-window-button"> &times; </div>
    </div>
</div>
```

**CSS:**
```css
.ai-panel-header {
    width: 100%;
    height: 40px;                     /* Fixed height */
    padding: 8px 12px;
    position: relative;
    border-bottom: 1px solid #e5e7eb; /* Light gray border */
    display: flex;
    align-items: center;
    justify-content: flex-end;        /* Right-aligned */
}

.ai-menu-btn {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: #666;                      /* Gray icon */
    margin-right: 8px;
}

.ai-menu-btn svg {
    width: 20px;
    height: 20px;
}

.btn-hide-ai {
    /* Close button container */
}

.generic-close-window-button {
    /* Standard close button styling */
    cursor: pointer;
    color: #666;
    font-size: 20px;
    line-height: 1;
}
```

---

## Message Components

### User Message Structure

```html
<div class="ai-chat-message ai-chat-message-user-wrapper" data-message-id="...">
    <div class="ai-chat-message-user">
        <!-- Message content -->
    </div>
    <div class="ai-message-actions">
        <button class="ai-message-copy" title="Copy message">
            <!-- Copy icon -->
        </button>
        <button class="ai-message-edit" title="Edit message">
            <!-- Edit icon -->
        </button>
    </div>
</div>
```

**CSS:**
```css
.ai-chat-message {
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
}

.ai-chat-message-user-wrapper {
    position: relative;
    align-self: flex-end;             /* Right-aligned */
    max-width: 75%;                    /* Max 75% width */
    margin-left: auto;
}

.ai-chat-message-user {
    background-color: #e5e7eb;         /* Light gray background */
    color: #1f2937;                    /* Dark gray text */
    padding: 10px 14px;
    border-radius: 18px 18px 4px 18px; /* Rounded corners, sharp bottom-left */
    word-wrap: break-word;
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.5;
}

/* Message actions - shown on hover */
.ai-message-actions {
    position: absolute;
    top: 4px;
    right: 4px;
    display: none;                     /* Hidden by default */
    gap: 4px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.ai-chat-message-user-wrapper:hover .ai-message-actions {
    display: flex;                     /* Show on hover */
}

.ai-message-copy,
.ai-message-edit {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: #6b7280;                    /* Medium gray */
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.ai-message-copy:hover,
.ai-message-edit:hover {
    background-color: #f3f4f6;        /* Light gray hover */
    color: #1f2937;                    /* Dark text on hover */
}

.ai-message-copy svg,
.ai-message-edit svg {
    width: 16px;
    height: 16px;
}
```

### AI Message Structure

```html
<div class="ai-chat-message">
    <div class="ai-chat-message-ai">
        <!-- Markdown-rendered content -->
    </div>
</div>
```

**CSS:**
```css
.ai-chat-message-ai {
    align-self: flex-start;            /* Left-aligned */
    background-color: transparent;      /* No background */
    color: #1f2937;
    padding: 0;
    border-radius: 0;
    max-width: 85%;                    /* Max 85% width */
    word-wrap: break-word;
    white-space: normal;
    border: none;
    font-size: 14px;
    line-height: 1.6;
    margin-right: auto;
    user-select: text;                 /* Allow text selection */
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;
}
```

### Message Edit Mode

```html
<div class="ai-message-edit-mode">
    <textarea class="ai-message-edit-input">...</textarea>
    <div class="ai-message-edit-actions">
        <button class="ai-message-edit-cancel">Cancel</button>
        <button class="ai-message-edit-save">Save</button>
    </div>
</div>
```

**CSS:**
```css
.ai-message-edit-mode {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    position: relative;
    left: 0;
    right: 0;
    margin-left: 0;
    max-width: 100% !important;
}

.ai-chat-message-user-wrapper:has(.ai-message-edit-mode) {
    max-width: 100% !important;
    margin-left: 0 !important;
    width: 100%;
}

.ai-message-edit-input {
    width: 100%;
    border: 2px solid #4a9eff;         /* Blue border */
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 14px;
    font-family: inherit;
    line-height: 1.5;
    resize: vertical;
    min-height: 60px;
    box-sizing: border-box;
}

.ai-message-edit-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

.ai-message-edit-cancel {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    background: #f3f4f6;
    color: #1f2937;
    transition: background-color 0.2s;
}

.ai-message-edit-cancel:hover {
    background: #e5e7eb;
}

.ai-message-edit-save {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    background: #1f2937;               /* Dark background */
    color: white;
    transition: background-color 0.2s;
}

.ai-message-edit-save:hover {
    background: #374151;
}
```

---

## Input Area Components

### Input Container Structure

```html
<div class="ai-chat-input-container">
    <textarea class="ai-chat-input" placeholder="Reply to Puter..." rows="1"></textarea>
    <div class="ai-attached-files"></div>
    <div class="ai-chat-input-actions">
        <button class="ai-attach-btn" title="Attach file">
            <!-- Attachment icon -->
        </button>
        <select class="ai-model-select">
            <option value="ollama:deepseek-r1:1.5b">Fast</option>
        </select>
        <button class="btn-send-ai" title="Send">
            <!-- Send icon -->
        </button>
    </div>
</div>
```

**CSS:**
```css
.ai-chat-input-container {
    display: flex;
    flex-direction: column;            /* Stack vertically */
    gap: 8px;
    padding: 12px 16px;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
}

/* Text input - full width at top */
.ai-chat-input {
    width: 100%;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 8px 12px;
    min-height: 36px;
    max-height: 200px;
    resize: none;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    box-sizing: border-box;
    overflow-y: auto;
    background: #ffffff;
    margin: 0;
}

.ai-chat-input:focus {
    outline: none;
    border-color: #4a9eff;             /* Blue border on focus */
}

.ai-chat-input:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
}

/* Actions row - below text input */
.ai-chat-input-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-end;         /* Right-aligned */
}

/* Attachment button */
.ai-attach-btn {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    padding: 0;
    cursor: pointer;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    box-sizing: border-box;
}

.ai-attach-btn:hover {
    background: #f5f5f5;
    color: #333;
}

.ai-attach-btn svg {
    width: 20px;
    height: 20px;
}

/* Model select dropdown */
.ai-model-select {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 13px;
    background: #ffffff;
    color: #1f2937;
    cursor: pointer;
    flex-shrink: 0;
    width: auto;
    min-width: 60px;
}

.ai-model-select:focus {
    outline: none;
    border-color: #4a9eff;
}

/* Send button */
.btn-send-ai {
    background: #4a9eff;               /* Blue background */
    color: white;
    border: none;
    padding: 0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
}

.btn-send-ai svg {
    width: 18px;
    height: 18px;
}

.btn-send-ai:hover:not(:disabled) {
    background: #3a8eef;               /* Darker blue on hover */
}

.btn-send-ai:disabled {
    background: #cccccc;
    cursor: not-allowed;
}
```

---

## File Attachment UI

### Attached Files Display

```html
<div class="ai-attached-files">
    <div class="ai-attached-file-card ai-attached-file-image" data-index="0">
        <img src="..." alt="..." class="ai-attached-file-thumbnail">
        <span class="ai-attached-file-label">filename.png</span>
        <button class="ai-attached-file-remove">×</button>
    </div>
</div>
```

**CSS:**
```css
.ai-attached-files {
    display: none;                     /* Hidden by default */
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
    margin-top: 8px;
    border-top: 1px solid #e5e7eb;
}

.ai-attached-files:not(:empty) {
    display: flex;                     /* Show when has files */
}

/* File card */
.ai-attached-file-card {
    position: relative;
    width: 120px;
    height: 120px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: box-shadow 0.2s;
}

.ai-attached-file-card:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

/* Image thumbnail */
.ai-attached-file-thumbnail {
    width: 100%;
    height: 80px;
    object-fit: cover;
    border-radius: 4px;
    margin-bottom: 4px;
}

/* File label */
.ai-attached-file-label {
    font-size: 12px;
    color: #1f2937;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
    padding: 4px 6px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    margin-top: auto;
}

/* Remove button */
.ai-attached-file-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 2px 6px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
    opacity: 0;                        /* Hidden by default */
    transition: opacity 0.2s;
}

.ai-attached-file-card:hover .ai-attached-file-remove {
    opacity: 1;                        /* Show on hover */
}

.ai-attached-file-remove:hover {
    background: rgba(0, 0, 0, 0.8);
}
```

### Files in Message Display

```html
<div class="ai-message-files">
    <div class="ai-message-file-item ai-message-file-image">
        <img src="..." alt="..." class="ai-message-file-thumbnail">
        <span>filename.png</span>
    </div>
</div>
```

**CSS:**
```css
.ai-message-files {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.ai-message-file-item {
    font-size: 13px;
    color: #6b7280;
    margin: 4px 0;
    display: flex;
    align-items: center;
    gap: 6px;
}

.ai-message-file-image {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.ai-message-file-thumbnail {
    width: 120px;
    height: 120px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
}
```

---

## Menu & Dropdown

### Menu Button

```html
<button class="ai-menu-btn" title="Menu">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
</button>
```

### Dropdown Menu (UIContextMenu)

**Menu Items:**
- "New Chat" (bold, with icon)
- Divider
- "Current" conversation preview (disabled)
- Divider
- "Clear History" (with icon)

**Styling:**
- Uses PC2's `UIContextMenu` component
- Min width: 200px
- Max width: 300px
- Position: Below menu button
- Delay: false (show immediately)

---

## Colors & Typography

### Color Palette

```css
/* Backgrounds */
--bg-white: #ffffff;
--bg-light-gray: #f3f4f6;
--bg-medium-gray: #e5e7eb;
--bg-dark: #1f2937;

/* Text Colors */
--text-dark: #1f2937;
--text-medium: #6b7280;
--text-light: #999;
--text-white: #ffffff;

/* Borders */
--border-light: #e5e7eb;
--border-medium: #374151;

/* Accent Colors */
--accent-blue: #4a9eff;
--accent-blue-hover: #3a8eef;
--accent-red: #e11d48;
--accent-error: #c62828;

/* Shadows */
--shadow-light: rgba(0, 0, 0, 0.1);
--shadow-medium: rgba(0, 0, 0, 0.15);
```

### Typography

```css
/* Font Sizes */
--font-size-small: 12px;
--font-size-base: 13px;
--font-size-normal: 14px;
--font-size-large: 16px;
--font-size-h3: 16px;
--font-size-h2: 18px;
--font-size-h1: 20px;

/* Font Weights */
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;

/* Line Heights */
--line-height-tight: 1.3;
--line-height-normal: 1.5;
--line-height-relaxed: 1.6;

/* Font Family */
--font-family: inherit;                /* System font */
--font-family-mono: 'Courier New', Courier, monospace;
```

---

## Icons & SVGs

### Menu Icon (Hamburger)

```svg
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
</svg>
```

### Copy Icon

```svg
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>
```

### Edit Icon

```svg
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
</svg>
```

### Attachment Icon

```svg
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
</svg>
```

### Send Icon

```svg
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
</svg>
```

### AI Icon (Toolbar Button)

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
</svg>
```

---

## Layout & Spacing

### Spacing System

```css
/* Padding */
--padding-xs: 4px;
--padding-sm: 8px;
--padding-md: 12px;
--padding-lg: 16px;

/* Margins */
--margin-xs: 4px;
--margin-sm: 8px;
--margin-md: 12px;
--margin-lg: 16px;

/* Gaps */
--gap-xs: 4px;
--gap-sm: 6px;
--gap-md: 8px;
--gap-lg: 12px;
```

### Border Radius

```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 18px;
```

### Panel Dimensions

```css
--panel-width: 400px;
--panel-height: 100vh / 100dvh;
--header-height: 40px;
--input-min-height: 36px;
--input-max-height: 200px;
--message-max-width-user: 75%;
--message-max-width-ai: 85%;
```

---

## Interactive States

### Hover States

```css
/* Buttons */
.ai-attach-btn:hover {
    background: #f5f5f5;
    color: #333;
}

.btn-send-ai:hover:not(:disabled) {
    background: #3a8eef;
}

.ai-message-copy:hover,
.ai-message-edit:hover {
    background-color: #f3f4f6;
    color: #1f2937;
}

/* File cards */
.ai-attached-file-card:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.ai-attached-file-card:hover .ai-attached-file-remove {
    opacity: 1;
}
```

### Focus States

```css
.ai-chat-input:focus {
    outline: none;
    border-color: #4a9eff;
}

.ai-model-select:focus {
    outline: none;
    border-color: #4a9eff;
}
```

### Disabled States

```css
.ai-chat-input:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
}

.btn-send-ai:disabled {
    background: #cccccc;
    cursor: not-allowed;
}
```

### Active States

```css
.ai-toolbar-btn.active {
    background-color: rgb(255 255 255 / 35%);
    border-radius: 3px;
}

.ai-chat-messages.active {
    /* Ensure scrolling works */
}
```

---

## Markdown Styling

### Headers

```css
.ai-chat-message-ai h1,
.ai-chat-message-ai h2,
.ai-chat-message-ai h3 {
    margin: 16px 0 8px 0;
    font-weight: 600;
    line-height: 1.3;
}

.ai-chat-message-ai h1 {
    font-size: 20px;
}

.ai-chat-message-ai h2 {
    font-size: 18px;
}

.ai-chat-message-ai h3 {
    font-size: 16px;
}
```

### Code Blocks

```css
.ai-chat-message-ai code {
    background-color: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 13px;
    color: #e11d48;
}

.ai-chat-message-ai pre {
    background-color: #1f2937;
    color: #f9fafb;
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 12px 0;
    font-family: 'Courier New', Courier, monospace;
    font-size: 13px;
    line-height: 1.5;
}

.ai-chat-message-ai pre code {
    background-color: transparent;
    padding: 0;
    color: inherit;
    font-size: inherit;
}
```

### Text Formatting

```css
.ai-chat-message-ai strong {
    font-weight: 600;
}

.ai-chat-message-ai em {
    font-style: italic;
}

.ai-chat-message-ai a {
    color: #4a9eff;
    text-decoration: none;
}

.ai-chat-message-ai a:hover {
    text-decoration: underline;
}

.ai-chat-message-ai p {
    margin: 8px 0;
}
```

---

## Streaming & Loading States

### Streaming Indicator

```css
.ai-streaming {
    position: relative;
}

.ai-streaming::after {
    content: '▋';
    animation: blink 1s infinite;
    margin-left: 2px;
}

@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}
```

### Loading State

```css
.ai-chat-loading {
    font-style: italic;
    color: #999;
}
```

### Error State

```css
.ai-chat-message-error {
    align-self: flex-start;
    background-color: #ffebee;
    color: #c62828;
    padding: 10px 15px;
    border-radius: 18px 18px 18px 4px;
    max-width: 80%;
    word-wrap: break-word;
    white-space: pre-wrap;
    border: 1px solid #ffcdd2;
}

.ai-chat-error {
    color: #c62828;
}
```

---

## Responsive Design

### Mobile Breakpoint

```css
@media (max-width: 768px) {
    .ai-panel {
        width: 100%;                    /* Full width on mobile */
    }
}
```

---

## Summary

### Key UI Principles

1. **Clean & Minimal**: White background, subtle borders, minimal shadows
2. **Right-Aligned User Messages**: User messages on right, AI on left
3. **Hover Interactions**: Actions appear on hover (copy, edit, delete)
4. **Consistent Spacing**: 8px, 12px, 16px spacing system
5. **Rounded Corners**: 4px, 6px, 8px, 18px border radius
6. **Blue Accent**: #4a9eff for primary actions and focus states
7. **Gray Scale**: Light grays for backgrounds, dark grays for text
8. **Transitions**: 0.2s transitions for smooth interactions

### Component Hierarchy

```
ai-panel
├── ai-panel-header
│   ├── ai-menu-btn
│   └── btn-hide-ai
├── ai-chat-messages
│   ├── ai-chat-message (user)
│   │   ├── ai-chat-message-user-wrapper
│   │   │   ├── ai-chat-message-user
│   │   │   └── ai-message-actions
│   │   │       ├── ai-message-copy
│   │   │       └── ai-message-edit
│   │   └── ai-message-files
│   └── ai-chat-message (ai)
│       └── ai-chat-message-ai
└── ai-chat-input-container
    ├── ai-chat-input
    ├── ai-attached-files
    │   └── ai-attached-file-card
    └── ai-chat-input-actions
        ├── ai-attach-btn
        ├── ai-model-select
        └── btn-send-ai
```

---

*This specification documents all UI elements from Puter's AI chat implementation. Use this as a reference to ensure pixel-perfect matching in PC2.*

