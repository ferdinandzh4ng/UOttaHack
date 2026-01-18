# Professional LMS Design System

## Overview
Complete visual redesign from game-inspired pastel theme to **professional, clean, and academic** styling suitable for a university/SaaS learning management system.

---

## Color Palette

### Primary Colors
- **Deep Violet (#6366f1)** - Primary actions, headings, key emphasis
  - Dark variant: #4f46e5 (hover states)
  - Light variant: #818cf8 (secondary use)
- **Teal (#14b8a6)** - Secondary accent, links, active states, progress indicators
  - Dark variant: #0d9488 (hover states)
  - Light variant: #2dd4bf (backgrounds)

### Base Colors  
- **White (#ffffff)** - Primary background, card surfaces
- **Light Gray (#f9fafb)** - Secondary backgrounds, subtle contrast

### Gray Scale
- Gray 50: #f9fafb
- Gray 100: #f3f4f6
- Gray 200: #e5e7eb
- Gray 300: #d1d5db
- Gray 400: #9ca3af (subtle text)
- Gray 600: #4b5563
- Gray 700: #374151
- Gray 900: #111827

### Text Colors
- **Primary text**: #111827 (dark, high contrast)
- **Secondary text**: #6b7280 (muted, for hints/labels)

### UI Elements
- **Border color**: #e5e7eb (subtle, professional)
- **Shadows**:
  - Small: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`
  - Medium: `0 4px 6px -1px rgba(0, 0, 0, 0.1)`
  - Large: `0 10px 15px -3px rgba(0, 0, 0, 0.1)`

---

## Typography

### Font Family
**Primary**: `'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

Clean, modern sans-serif with excellent readability. No decorative or rounded fonts.

### Heading Hierarchy

#### H1 (Large Headings)
- **Size**: 3.5rem
- **Weight**: 700 (bold)
- **Color**: Violet (#6366f1)
- **Usage**: Page titles, main content headers
- **Line height**: 1.2
- **Letter spacing**: -0.5px

#### H2 (Section Headings)
- **Size**: 1.75rem
- **Weight**: 600 (semibold)
- **Color**: Violet (#6366f1)
- **Letter spacing**: -0.3px

#### Body Text
- **Size**: 1rem
- **Weight**: 400 (regular)
- **Color**: Primary text (#111827)
- **Line height**: 1.6

#### Labels & Secondary Text
- **Size**: 0.9–0.95rem
- **Weight**: 500–600
- **Color**: Secondary text (#6b7280)

---

## Component Styling

### Buttons

#### Primary Button (Violet)
```css
Background: #6366f1
Color: White
Padding: 0.75rem 1.5rem
Border radius: 8px
Font weight: 600
Box shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1)
Hover: Background #4f46e5, shadow enhanced
```

#### Secondary Button (Gray)
```css
Background: #f3f4f6
Color: #111827
Border: 1px solid #e5e7eb
Padding: 0.75rem 1.5rem
Border radius: 8px
Hover: Background #e5e7eb, border stronger
```

#### Danger Button (Red)
```css
Background: #dc2626
Color: White
Padding: 0.75rem 1.5rem
Border radius: 8px
Hover: Background #b91c1c
```

### Cards & Panels

#### Main Content Panel
```css
Background: White (#ffffff)
Border radius: 12px
Border: 1px solid #e5e7eb
Padding: 2–2.5rem
Box shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1)
```

#### Info Card (Dashboard Stats)
```css
Background: Light gray (#f9fafb)
Border: 1px solid #e5e7eb
Border radius: 10px
Padding: 1.75rem
Hover: Subtle border color change to teal, shadow enhancement
```

### Form Elements

#### Text Input / Select
```css
Border: 1px solid #e5e7eb
Border radius: 8px
Padding: 0.85rem 1rem
Font size: 1rem
Background: White
Focus: Border #6366f1, box-shadow 0 0 0 2px rgba(99, 102, 241, 0.1)
```

#### Label
```css
Font weight: 600
Font size: 0.95rem
Color: #111827
Margin bottom: 0.5rem
```

#### Error Message
```css
Background: rgba(220, 38, 38, 0.1)
Color: #dc2626
Border left: 3px solid #dc2626
Padding: 0.875rem
Border radius: 8px
Font size: 0.9rem
```

### Modals

#### Modal Overlay
```css
Background: rgba(0, 0, 0, 0.3)
Backdrop filter: blur(4px)
Z-index: 1000
```

#### Modal Content
```css
Background: White
Border radius: 12px
Padding: 2.5rem
Max width: 520px
Box shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1)
Border: 1px solid #e5e7eb
Max height: 90vh
Overflow: Auto
```

---

## Animations & Interactions

### Entrance Animation
```css
fadeIn: opacity 0 → 1 over 0.5s ease-out
```
Used for: Pages, modals, panels loading

### Hover Effects
- **Buttons**: Lift by 1px (`translateY(-1px)`), shadow enhancement
- **Links**: Color change from #14b8a6 to #0d9488
- **Cards**: Subtle shadow increase, border color to teal

### Transitions
- **Default duration**: 0.2s
- **Easing**: `ease` or ease-out for entrances
- **Interaction feedback**: Immediate visual response

---

## Spacing Standards

### Padding
- **Large sections**: 2.5–3rem
- **Cards**: 1.75–2rem
- **Form groups**: 1.5rem gaps
- **Buttons**: 0.75rem vertical, 1.5rem horizontal

### Margins
- **Between sections**: 2–3rem
- **Between cards**: 1.5rem
- **Heading spacing**: 1–1.5rem below

### Border Radius
- **Buttons**: 8px
- **Input fields**: 8px
- **Panels/Cards**: 10–12px
- **Small elements**: 6px

---

## Responsive Design

### Mobile Breakpoint (≤768px)
- **H1**: 2.5rem → 1.875rem
- **H2**: 1.75rem → 1.5rem
- **Padding**: Reduce by 25–30%
- **Layout**: Stack vertically where needed
- **Modal**: Full width with side margins
- **Buttons**: Full width in modals

---

## Implementation Checklist

✓ Global CSS variables defined in `:root`  
✓ Typography system with Inter font  
✓ Button styling (primary, secondary, danger)  
✓ Card and panel styling  
✓ Form input styling with focus states  
✓ Modal styling with backdrop blur  
✓ Subtle shadow system  
✓ Smooth transitions (0.2s)  
✓ Responsive breakpoints  
✓ Removed: Pastel gradients, playful animations, rounded shadows  
✓ Removed: Decorative elements (clouds, effects)  
✓ Accessibility: High contrast, clear focus states, readable text  

---

## Files Updated

1. **src/index.css** - Global styles, color variables, typography
2. **src/App.css** - Container styling
3. **src/components/Homepage.css** - Landing page
4. **src/components/RoleSelection.css** - Role choice cards
5. **src/components/AuthForm.css** - Login/signup modals
6. **src/components/Dashboard.css** - Student dashboard
7. **src/components/EducatorHomepage.css** - Teacher dashboard
8. **src/components/ClassDetail.css** - Class management
9. **src/components/CreateClassModal.css** - Class creation modal
10. **src/components/CreateTaskModal.css** - Task creation modal
11. **src/components/TaskViewModal.css** - Task viewer

---

## Design Principles

1. **Clean & Academic** - Professional appearance suitable for educational institutions
2. **Clarity First** - Every element serves a purpose; no clutter
3. **Subtle, Not Flashy** - Smooth transitions, minimal animations
4. **High Contrast** - Text and interactive elements are easily readable
5. **Consistency** - Unified spacing, colors, and component styling
6. **Accessibility** - WCAG AA contrast standards met, clear focus states
7. **Efficiency** - Minimal cognitive load, intuitive interactions

---

## Color Usage Guide

| Element | Color | Why |
|---------|-------|-----|
| Primary headings | Violet #6366f1 | Authority, hierarchy |
| Primary buttons | Violet #6366f1 | Call-to-action emphasis |
| Links | Teal #14b8a6 | Navigation clarity |
| Active states | Teal #14b8a6 | Progress indication |
| Card backgrounds | White/Gray 50 | Clean surfaces |
| Borders | Gray 200 #e5e7eb | Subtle separation |
| Text | Gray 900 #111827 | Maximum readability |
| Danger actions | Red #dc2626 | Warning/destructive |

---

This design system creates a **professional, focused learning environment** where students and educators can work without distraction.
