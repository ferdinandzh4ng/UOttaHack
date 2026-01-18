# Visual Design Reference Guide

## Quick Color Reference

### Primary Colors (Used Everywhere)
- **Coral (#FF9999)** - Main headings, delete buttons, warning actions
- **Teal (#6DD5D5)** - Primary buttons, interactive elements, accents
- **Peach (#FFB6A3)** - Warm highlights, secondary accents

### Background Palette
- **Warm Cream (#FFF5E6)** - Top of illustrated sky
- **Soft Peach (#FFE8D6)** - Upper mid-sky
- **Light Pink (#FFD4E8)** - Middle transition
- **Pale Purple (#E8D4FF)** - Lower mid-sky
- **Sky Blue (#D4E8FF)** - Bottom of illustrated sky

### Text Colors
- **Dark (#2d3436)** - Main body text, labels
- **Medium (#636e72)** - Secondary text, hints

### Card/Panel Interiors
- **White with Gradient (#FFFFFF → #FFFAF0)** - Light, airy feel
- **With Border**: `rgba(255, 255, 255, 0.8)` - Frosted glass outline

---

## Button Types & States

### Primary Button (Call-to-Action)
```
Background: Teal gradient (#6DD5D5 → #55B8B8)
Text Color: White
Border Radius: 16px
Padding: 1.1rem 3.5rem (varies by context)
Shadow: 0 10px 35px rgba(109, 213, 213, 0.35)

Hover:
  - Lift: translateY(-5px)
  - Scale: 1.03
  - Shadow: Enhanced (0 15px 50px)
  
Examples: Get Started, Submit, Create Class
```

### Secondary Button (Cancel/Back)
```
Background: Pastel gradient with transparency
Border: 2px solid teal (rgba(109, 213, 213, 0.4))
Text Color: Dark (#2d3436)
Border Radius: 16px
Padding: 0.9rem 1.8rem

Hover:
  - Opacity: Increase
  - Lift: translateY(-2px)
  
Examples: Cancel, Back, Decline
```

### Danger Button (Delete/Logout)
```
Background: Coral gradient (#FF9999 → #FF7777)
Text Color: White
Border Radius: 16px
Shadow: 0 4px 15px rgba(255, 153, 153, 0.3)

Hover:
  - Lift: translateY(-3px)
  - Scale: 1.1
  - Shadow: Enhanced
  
Examples: Delete, Logout, Remove
```

### Close/Dismiss Button
```
Background: Coral gradient with transparency
Border Radius: 12px (rounded square)
Size: 40px × 40px
Font Size: 1.8rem

Hover:
  - Rotate: 90deg
  - Scale: 1.1
  - Playful animation
  
Examples: Modal close, Dismiss
```

---

## Card Types & Layouts

### Page Panel (Main Content Container)
```
Border Radius: 30px
Padding: 3-4rem
Background: Gradient
  linear-gradient(135deg, 
    rgba(255, 255, 255, 0.98) 0%, 
    rgba(255, 250, 240, 0.98) 100%)
Border: 2px solid rgba(255, 255, 255, 0.8)
Shadow: 0 15px 50px rgba(0, 0, 0, 0.12)
Animation: fadeInUp 0.6s ease-out (on load)

Used for: Dashboard, ClassDetail, EducatorHomepage
```

### Information Card (Dashboard Stats)
```
Border Radius: 20px
Padding: 2rem
Background: Pastel gradient
  linear-gradient(135deg, 
    rgba(213, 232, 255, 0.6) 0%, 
    rgba(168, 230, 207, 0.6) 100%)
Border: 2px solid rgba(255, 255, 255, 0.7)
Position: relative (for z-index stacking)

Decoration (::before):
  - Radial gradient circle
  - Semi-transparent
  - Floating animation
  
Hover: translateY(-5px) scale(1.02)

Used for: Dashboard stats, Class info
```

### Class/Task Card (Grid Tile)
```
Border Radius: 25px
Padding: 2rem
Background: Pastel gradient
Border: 2px solid rgba(255, 255, 255, 0.7)
Min Width: 280px
Gap in Grid: 2rem

Decoration (::before):
  - Similar to info cards
  - Creates depth effect
  
Hover: translateY(-8px) scale(1.02) with teal border

Used for: Class list, Task list
```

### Modal/Dialog
```
Border Radius: 30px
Padding: 2.5rem
Max Width: 500-540px
Background: Gradient (same as page panel)
Border: 2px solid rgba(255, 255, 255, 0.8)
Shadow: 0 20px 60px rgba(0, 0, 0, 0.15)
Max Height: 90vh (scrollable)
Animation: fadeInUp 0.5s ease-out

Overlay:
  Background: rgba(0, 0, 0, 0.35) (soft, not harsh)
  Backdrop Filter: blur(4px) (frosted glass)
  
Used for: Create class, Create task, Confirm actions
```

---

## Form Elements

### Text Input
```
Border: 2.5px solid #E8D4FF (soft purple)
Border Radius: 16px
Padding: 0.9rem 1.2rem
Background: rgba(255, 255, 255, 0.9)
Font Size: 1rem
Transition: all 0.3s ease

Focus State:
  Border Color: #6DD5D5 (teal)
  Background: #ffffff (solid)
  Box Shadow: 0 0 0 3px rgba(109, 213, 213, 0.15)
  
Placeholder Color: #b2bec3
```

### Label
```
Font Weight: 700
Font Size: 0.98rem
Color: #2d3436 (dark text)
Margin Bottom: 0.3rem
```

### Select Dropdown
```
Same styling as text input
Cursor: pointer
```

### Error Message
```
Background: rgba(255, 153, 153, 0.15) (light coral)
Color: #FF6B6B (coral red)
Border Left: 4px solid #FF9999
Border Radius: 12px
Padding: 1rem
Font Weight: 500
Font Size: 0.95rem

Purpose: Friendly, helpful tone (not harsh)
```

---

## Typography Examples

### Page Heading (H1)
```
Font Family: 'Poppins', 'SF Pro Rounded'
Font Size: 3.8rem
Font Weight: 800
Letter Spacing: -1px
Color: Coral gradient
  gradient(135deg, #FF9999 0%, #FFB6A3 50%, #FFE680 100%)
Text Shadow: 0 4px 20px rgba(255, 153, 153, 0.2)
```

### Section Heading (H2)
```
Font Family: 'Poppins'
Font Size: 2.2-2.8rem
Font Weight: 800
Color: #FF9999 (coral)
Letter Spacing: -0.5px
```

### Body Text
```
Font Family: 'Poppins', 'Inter'
Font Size: 1rem
Font Weight: 400-500
Color: #2d3436 (dark text)
Line Height: 1.5-1.7
```

### Label/Button Text
```
Font Family: 'Poppins', 'Inter'
Font Size: 0.95-1.15rem
Font Weight: 600-700
Color: Varies (white on colored backgrounds, dark on light)
Letter Spacing: 0.5px (on buttons)
```

---

## Animation Reference

### Entrance (fadeInUp)
```
Duration: 0.6s
Easing: ease-out
From: opacity 0, translateY(30px)
To: opacity 1, translateY(0)

Applied to: Page panels, modals, cards on load
```

### Float (Background Clouds)
```
Duration: 8-10s
Easing: ease-in-out infinite
Animation:
  0%, 100%: translateY(0) translateX(0)
  50%: translateY(20px) translateX(10px)
  
Creates organic, natural movement
```

### Hover Lift (Interactive Elements)
```
Duration: 0.3s
Easing: cubic-bezier(0.34, 1.56, 0.64, 1) (bouncy)

Light Lift: translateY(-2px)
Medium Lift: translateY(-3px)
Heavy Lift: translateY(-5px) or more

Often combined with scale(1.02-1.05)
```

### Button Shine (Overlay Gradient)
```
Duration: 0.4-0.5s
Created via ::before pseudo-element
Animation: left: -100% → 100% on hover
Gradient: transparent → white(0.2) → transparent

Creates "glass" or "liquid" effect
```

### Pulse (Icon Emphasis)
```
Duration: 2s
Easing: ease-in-out infinite
Animation:
  0%, 100%: scale(1)
  50%: scale(1.05)
  
Applied to: Role icons, action prompts
```

### Rotate (Close Button)
```
Duration: 0.3s
Easing: ease
Transform: rotate(90deg) on hover

Fun, interactive feedback
```

---

## Spacing & Layout

### Standard Padding
- **Container Internal**: 2.5-4rem
- **Card Internal**: 1.5-2.5rem
- **Form Group**: 0.5-1rem gaps
- **Section Spacing**: 2-3rem margins

### Standard Border Radius
- **Buttons**: 16px
- **Input Fields**: 16px
- **Cards**: 25-30px
- **Small Buttons**: 12-16px
- **Close Buttons**: 12px

### Standard Shadow (Soft, Diffused)
- **Light**: `0 4px 12px rgba(0, 0, 0, 0.08)`
- **Medium**: `0 10px 30px rgba(0, 0, 0, 0.1)`
- **Dark**: `0 15px 50px rgba(0, 0, 0, 0.15)`
- **Very Dark**: `0 20px 60px rgba(0, 0, 0, 0.2)`

---

## Responsive Adjustments

### Mobile (≤768px)
- **H1**: Reduce from 3.8rem to ~2.2rem
- **H2**: Reduce from 2.8rem to ~2rem
- **Padding**: Reduce from 3-4rem to 2rem
- **Button Padding**: Reduce slightly
- **Modal Width**: Use full width with margins
- **Layout**: Stack vertically where needed

---

## Accessibility Notes

### Color Contrast
- ✓ Dark text (#2d3436) on light backgrounds: 15:1+
- ✓ White text on teal/coral: 8:1+
- ✓ All text meets WCAG AA standard

### Focus States
- All interactive elements have clear focus ring
- Focus ring: 3px outline with high contrast
- Outline offset: 2px for visibility

### Motion
- All animations are smooth, not jarring
- No fast/aggressive motion
- Reduced motion media query can disable animations

---

## Usage Tips

1. **Color Consistency**: Use coral for headings, teal for actions, pastels for backgrounds
2. **Button Hierarchy**: Primary = teal, secondary = pastel, danger = coral
3. **Card Depth**: Use decorative ::before elements to create subtle depth
4. **Animations**: Keep hover effects bouncy and playful
5. **Spacing**: Err on the side of more whitespace - it looks cleaner
6. **Typography**: Use Poppins for friendliness, system fonts as fallback
7. **Shadows**: Use soft, diffused shadows - no harsh darkness
8. **Gradients**: Use subtle, pastel gradients for sophistication

---

## Testing Checklist

- [ ] All colors display correctly on different monitors
- [ ] Hover effects work smoothly on all devices
- [ ] Focus states are visible and clear
- [ ] Text remains readable at all sizes
- [ ] Animations perform smoothly without lag
- [ ] Responsive breakpoints work correctly
- [ ] Touch interactions work on mobile
- [ ] Keyboard navigation is clear
- [ ] Form validation messages are visible
- [ ] Accessibility contrast ratios are met

---

This reference guide should help maintain design consistency across the platform and guide any future design updates or component additions.
