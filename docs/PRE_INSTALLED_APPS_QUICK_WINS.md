# Pre-Installed Apps: Quick Wins for Showcasing PC2
## Simple Utility Apps That Come Pre-Installed (Like Debian's Calculator)

**Date:** January 25, 2025  
**Goal:** Add simple, showcase-ready apps that come pre-installed with PC2

---

## 🎯 The Vision

Just like Debian comes with a calculator, text editor, and file manager pre-installed, PC2 should come with a few simple utility apps that:
1. **Showcase the platform** - Demonstrate what's possible
2. **Provide immediate value** - Users can use them right away
3. **Are lightweight** - Don't add significant complexity
4. **Can be WASM later** - Simple enough to convert to WASM when runtime is ready

---

## 🚀 Quick Win Apps (Can Build in 1-2 Days Each)

### 1. **Calculator** ⭐ **HIGHEST PRIORITY**
**Why:** Universal utility, everyone understands it, perfect showcase

**Features:**
- Basic arithmetic (+, -, ×, ÷)
- Scientific mode (optional)
- History of calculations
- Copy result to clipboard
- Keyboard shortcuts

**Implementation:**
- **Option A:** Simple HTML/JS app (1-2 hours) - Quick win
- **Option B:** WASM app (when runtime ready) - Future-proof

**File:** `src/gui/src/UI/Apps/UICalculator.js`

**Icon:** Calculator icon (already in icons folder or create simple SVG)

**Launch:** `/app/calculator` or from app launcher

---

### 2. **Notes/Sticky Notes** ⭐ **HIGH PRIORITY**
**Why:** Simple, useful, demonstrates file persistence

**Features:**
- Create quick notes
- Auto-save to `/Notes/` folder
- Multiple notes (tabs or list)
- Search notes
- Markdown support (optional)

**Implementation:**
- HTML/JS with filesystem API
- Stores notes as `.md` files in user's Notes folder

**File:** `src/gui/src/UI/Apps/UINotes.js`

**Icon:** Note/sticky note icon

**Launch:** `/app/notes`

---

### 3. **Clock/Timer** ⭐ **MEDIUM PRIORITY**
**Why:** Useful utility, demonstrates real-time updates

**Features:**
- World clock (multiple timezones)
- Timer
- Stopwatch
- Alarm (optional - requires notifications)

**Implementation:**
- Simple HTML/JS with setInterval
- Can show multiple timezones

**File:** `src/gui/src/UI/Apps/UIClock.js`

**Icon:** Clock icon

**Launch:** `/app/clock`

---

### 4. **Unit Converter** ⭐ **MEDIUM PRIORITY**
**Why:** Useful, demonstrates form handling

**Features:**
- Length (meters, feet, miles, km)
- Weight (kg, lbs, oz)
- Temperature (C, F, K)
- Currency (if API available, optional)

**Implementation:**
- HTML/JS with conversion formulas
- Simple dropdowns for unit selection

**File:** `src/gui/src/UI/Apps/UIUnitConverter.js`

**Icon:** Conversion/arrows icon

**Launch:** `/app/converter`

---

### 5. **QR Code Generator** ⭐ **LOW PRIORITY**
**Why:** Cool utility, demonstrates API usage

**Features:**
- Generate QR codes from text/URL
- Download QR code as image
- Scan QR code (if camera available)

**Implementation:**
- Use existing QR library (already in codebase)
- Simple input → QR code display

**File:** `src/gui/src/UI/Apps/UIQRGenerator.js`

**Icon:** QR code icon

**Launch:** `/app/qr-generator`

---

## 📋 Implementation Strategy

### Phase 1: Quick HTML/JS Apps (This Week)
**Goal:** Get 2-3 apps working quickly to showcase

**Recommended Order:**
1. **Calculator** (2-3 hours) - Highest impact, simplest
2. **Notes** (3-4 hours) - Useful, demonstrates filesystem
3. **Clock** (2-3 hours) - Simple, demonstrates real-time

**Total Time:** 1 day for all 3

### Phase 2: Register as Pre-Installed Apps
**Goal:** Make them appear in app launcher automatically

**Changes Needed:**
1. Add to `RecommendedAppsService.APP_NAMES`:
   ```javascript
   static APP_NAMES = [
       'editor',
       'terminal',
       'calculator',  // NEW
       'notes',      // NEW
       'clock',      // NEW
   ];
   ```

2. Add app icons to `/src/gui/src/icons/`
3. Add app routes in backend (`/app/calculator`, etc.)
4. Create app window components

### Phase 3: Convert to WASM (Future)
**Goal:** When WASM runtime is ready, convert these apps

**Benefits:**
- Sandboxed execution
- Better performance
- Can be distributed via marketplace
- Demonstrates WASM capabilities

---

## 🛠️ Implementation Details

### Calculator App Structure

```javascript
// src/gui/src/UI/Apps/UICalculator.js
export default function UICalculator() {
    let h = '';
    h += `<div class="calculator-window">`;
    h += `<div class="calculator-display">0</div>`;
    h += `<div class="calculator-buttons">`;
    // ... button grid
    h += `</div>`;
    h += `</div>`;
    
    // Event handlers for buttons
    // Calculation logic
    // History tracking
    
    return h;
}
```

**Styling:**
- Match PC2 window styling
- Responsive design
- Dark/light theme support

**Features:**
- Basic operations
- Clear button
- Backspace
- Keyboard support (optional)

---

### Notes App Structure

```javascript
// src/gui/src/UI/Apps/UINotes.js
export default async function UINotes() {
    // Load existing notes from /Notes/ folder
    const notes = await puter.fs.readdir('/Notes/');
    
    let h = '';
    h += `<div class="notes-window">`;
    h += `<div class="notes-sidebar">`;
    // List of notes
    h += `</div>`;
    h += `<div class="notes-editor">`;
    // Markdown editor
    h += `</div>`;
    h += `</div>`;
    
    // Auto-save functionality
    // Create new note
    // Delete note
    
    return h;
}
```

**Features:**
- Auto-save every 2 seconds
- Create/delete notes
- Search notes
- Markdown preview (optional)

---

## 🎨 App Icons

**Need to Create:**
1. `calculator.svg` - Simple calculator icon
2. `notes.svg` - Sticky note or document icon
3. `clock.svg` - Clock/watch icon
4. `converter.svg` - Conversion arrows icon

**Or Use Existing:**
- Check if icons already exist in `/src/gui/src/icons/`
- Can use simple SVG shapes

---

## 📦 Pre-Installation Setup

### Backend Changes

**File:** `pc2-node/test-fresh-install/src/api/index.ts`

```typescript
// Add routes for pre-installed apps
app.get('/app/calculator', (req, res) => {
    // Serve calculator app
});

app.get('/app/notes', (req, res) => {
    // Serve notes app
});

app.get('/app/clock', (req, res) => {
    // Serve clock app
});
```

### Frontend Changes

**File:** `src/backend/src/modules/apps/RecommendedAppsService.js`

```javascript
static APP_NAMES = [
    'editor',
    'terminal',
    'calculator',  // NEW
    'notes',      // NEW
    'clock',      // NEW
];
```

**File:** App launcher/desktop icons
- Add calculator, notes, clock to default desktop
- Or show in app launcher

---

## 🚀 Quick Start: Build Calculator First

**Time Estimate:** 2-3 hours

**Steps:**
1. Create `src/gui/src/UI/Apps/UICalculator.js`
2. Add calculator HTML/CSS/JS
3. Add route in backend
4. Add to `RecommendedAppsService.APP_NAMES`
5. Add icon
6. Test

**Result:** Users see calculator in app launcher, can launch it, use it immediately

---

## 💡 Why This Matters

**User Experience:**
- Users see value immediately (not just empty desktop)
- Demonstrates platform capabilities
- Shows that apps can be installed/used

**Showcase Value:**
- "Look, PC2 comes with useful apps pre-installed"
- "Just like Debian, but for personal cloud"
- Demonstrates extensibility

**Future-Proof:**
- These apps can be converted to WASM later
- Shows progression: HTML → WASM
- Demonstrates app ecosystem potential

---

## 📊 Priority Ranking

1. **Calculator** ⭐⭐⭐ - Universal, simple, high impact
2. **Notes** ⭐⭐ - Useful, demonstrates filesystem
3. **Clock** ⭐⭐ - Simple, demonstrates real-time
4. **Unit Converter** ⭐ - Nice to have
5. **QR Generator** ⭐ - Cool but less essential

---

## ✅ Success Criteria

**Phase 1 Complete When:**
- [ ] Calculator app works and is pre-installed
- [ ] Notes app works and is pre-installed
- [ ] Clock app works and is pre-installed
- [ ] Apps appear in app launcher
- [ ] Apps can be launched from desktop
- [ ] Apps match PC2 design system

**Showcase Ready:**
- Users can immediately use calculator
- Demonstrates "apps come pre-installed"
- Shows platform is functional, not empty

---

## 🎯 Recommendation

**Start with Calculator** - It's the highest impact, simplest to build, and most universally understood. Can be built in 2-3 hours and immediately showcases the platform.

**Then add Notes** - Useful, demonstrates filesystem integration, shows persistence.

**Then Clock** - Simple, demonstrates real-time capabilities.

**Total Time:** 1 day for all 3 apps, ready to showcase.

---

**Next Steps:**
1. Build calculator app (2-3 hours)
2. Add to pre-installed apps list
3. Test and showcase
4. Build notes app (3-4 hours)
5. Build clock app (2-3 hours)
6. All ready for packaging phase!

