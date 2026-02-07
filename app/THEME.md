# Theme System Documentation

## Overview

The MazelProtocol application now supports dynamic theme switching between light and dark modes, with an additional "system" option that follows the user's operating system preference.

## Features

- **Dark Mode**: The default theme, optimized for the lottery application's visual design
- **Light Mode**: A polished premium light theme with navy-tinted surfaces, deeper emerald/gold for contrast, and brand-consistent personality
- **System Theme**: Automatically follows the user's OS theme preference
- **Persistent Preference**: Theme choice is saved in `localStorage`
- **Dynamic Meta Tags**: Updates `theme-color` and `color-scheme` meta tags
- **Accessible Controls**: Keyboard-accessible theme toggle with proper ARIA labels

## Implementation Details

### Theme Provider

The theme system is built around a React context provider (`ThemeProvider`) that manages theme state and applies it to the document. Key components:

1. **Theme Context** (`/src/lib/theme.tsx`):
   - Manages theme state (`light`, `dark`, or `system`)
   - Handles persistence in `localStorage`
   - Applies theme classes to the document root
   - Updates meta tags dynamically

2. **Theme Toggle Components** (`/src/components/ThemeToggle.tsx`):
   - `ThemeToggle`: Full-featured toggle with switch and system button
   - `ThemeToggleCompact`: Compact version for header integration

### CSS Custom Properties

The theme system uses CSS custom properties (CSS variables) defined in `/src/styles.css`:

- **Light Mode Variables**: Defined under `:root` selector
- **Dark Mode Variables**: Defined under `.dark` selector
- **Theme Integration**: Variables are mapped to Tailwind theme colors via `@theme` directive

### Integration Points

1. **Root Document** (`/src/routes/__root.tsx`):
   - Wraps the entire app with `ThemeProvider`
   - Sets `color-scheme: "dark light"` meta tag to indicate dual theme support
   - Removes hardcoded `dark` class from `<html>` element

2. **Header Component** (`/src/components/Header.tsx`):
   - Includes `ThemeToggleCompact` in both desktop and mobile views
   - Positioned in the top-right navigation area

## Usage

### For Users

1. **Toggle Theme**: Click the theme toggle button in the header (moon/sun icon)
2. **Switch Modes**: Use the toggle switch to switch between light and dark
3. **System Theme**: Click the monitor icon to use system preference
4. **Persistence**: Theme choice is automatically saved

### For Developers

#### Adding Theme-Aware Styles

Use CSS custom properties for theme-aware styling:

```css
.my-component {
  background-color: var(--background);
  color: var(--foreground);
  border-color: var(--border);
}
```

#### Using Theme Hooks

Import and use the `useTheme` hook in React components:

```tsx
import { useTheme } from "@/lib/theme";

function MyComponent() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  
  return (
    <div className={`bg-${resolvedTheme === 'dark' ? 'gray-900' : 'gray-100'}`}>
      Current theme: {theme}
    </div>
  );
}
```

#### Creating Theme-Aware Components

Use Tailwind classes that reference theme variables:

```tsx
function ThemeAwareCard() {
  return (
    <div className="bg-card text-foreground border-border rounded-lg p-4">
      This card adapts to the current theme
    </div>
  );
}
```

## Theme Variables

### Core Colors
- `--background`: Main background color
- `--foreground`: Main text color
- `--card`: Card background color
- `--card-foreground`: Card text color
- `--primary`: Primary brand color (emerald)
- `--primary-foreground`: Text on primary color
- `--border`: Border colors
- `--input`: Input field backgrounds

### Custom Lottery Colors
- `--emerald`, `--emerald-light`, `--emerald-dark`: Emerald gradient colors
- `--gold`, `--gold-light`, `--gold-dark`: Gold gradient colors
- `--navy`, `--navy-light`, `--navy-deep`: Navy gradient colors

## Technical Notes

### Server-Side Rendering (SSR)
- The theme system is client-side only
- Defaults to dark mode on server render
- Hydrates with user's preference on client mount

### Performance
- Theme changes are applied via CSS class toggling (no re-renders)
- localStorage operations are debounced
- System theme listener is properly cleaned up

### Accessibility
- Theme toggle is keyboard accessible
- Proper ARIA labels for screen readers
- High contrast maintained in both themes

## Testing

To test theme functionality:

1. Toggle between light and dark modes
2. Switch to system theme and change OS theme preference
3. Verify localStorage persistence
4. Check meta tag updates in browser devtools
5. Test keyboard navigation of theme controls

## Future Enhancements

Potential improvements for the theme system:

1. **Theme-Specific Images**: Different images for light/dark modes
2. **Reduced Motion**: Respect `prefers-reduced-motion`
3. **High Contrast**: Additional high-contrast theme option
4. **Custom Themes**: User-defined color schemes
5. **Theme Transitions**: Smooth transitions between themes

## Summary

I've successfully implemented a comprehensive theme system for the MazelProtocol application with the following features:

### 1. **Theme Context & Provider** (`/src/lib/theme.tsx`)
- Manages theme state (light/dark/system)
- Handles localStorage persistence
- Applies theme classes to document root
- Updates meta tags dynamically
- Listens to system theme changes

### 2. **Theme Toggle Components** (`/src/components/ThemeToggle.tsx`)
- `ThemeToggle`: Full toggle with switch and system button
- `ThemeToggleCompact`: Compact version for header integration
- Accessible with proper ARIA labels
- Visual feedback for current theme

### 3. **CSS Updates** (`/src/styles.css`)
- Updated to use CSS custom properties
- Theme-aware utility classes
- Dynamic scrollbar colors
- Fixed alpha value syntax for compatibility

### 4. **Integration**
- Updated root component to use `ThemeProvider`
- Added theme toggle to header (desktop and mobile)
- Updated meta tags for theme support
- Removed hardcoded `dark` class from HTML

### 5. **Key Features**
- **Three theme options**: Light, Dark, and System
- **Persistence**: Saves user preference in localStorage
- **Dynamic meta tags**: Updates `theme-color` and `color-scheme`
- **System theme sync**: Automatically follows OS preference changes
- **Accessibility**: Keyboard navigation and screen reader support

The implementation maintains the app's existing dark-first design while providing full light mode support. All existing components will automatically adapt to the selected theme through CSS custom properties and Tailwind's theme integration.