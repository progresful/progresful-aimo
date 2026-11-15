import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

// "The instrument": AI-MO as a piece of control hardware. Light first, with a dark option.
// Every colour the app uses lives here as a semantic token with a real `_light` and `_dark`
// value, so pages reach for `bg.panel`, `fg.muted`, `status.pending` etc. — never hex, never a
// raw palette shade. CSS strings (React Flow) use `var(--chakra-colors-<token-path>)`.
//
// Look: a cool off-white device shell with pure white modules on it, outlined in thin dark
// hairlines (graphite shell + near-black modules in dark). ONE signal colour — safety orange —
// for the primary key, the active state and the live path. Status reads as LEDs: green =
// passes / ordered on its own, amber = a person decides, red = blocked. Everything is flat:
// no gradients, no gloss; the only "light" is the tiny glow around an LED dot.
// Type: Space Grotesk for the interface, Geist Mono for labels, codes and money columns, and
// Doto — a dot-matrix display face — used sparingly for the big readouts (the home headline,
// a verdict word, an order total, counters). Figures are tabular everywhere.

const mode = (light: string, dark: string) => ({ value: { _light: light, _dark: dark } });

const config = defineConfig({
  globalCss: {
    'html, body, #root': {
      height: '100%',
    },
    html: {
      colorPalette: 'brand',
    },
    body: {
      bg: 'bg',
      color: 'fg',
      fontFamily: 'body',
      fontSize: '14px',
      lineHeight: '1.5',
      fontVariantNumeric: 'tabular-nums',
      textRendering: 'optimizeLegibility',
    },
    // Money, quantities and times line up in columns.
    '.tnum, [data-tnum]': { fontVariantNumeric: 'tabular-nums' },
    // One focus ring for hand-rolled buttons and links (Chakra's own controls bring theirs).
    'a:focus-visible, button:focus-visible, [role=button]:focus-visible': {
      outline: '2px solid var(--chakra-colors-brand-focus-ring)',
      outlineOffset: '2px',
      borderRadius: '3px',
    },
    '::selection': {
      bg: 'brand.500/25',
    },
    '*::-webkit-scrollbar': { width: '10px', height: '10px' },
    '*::-webkit-scrollbar-thumb': {
      bg: 'scrollbar',
      borderRadius: 'full',
      border: '3px solid transparent',
      backgroundClip: 'padding-box',
    },
    '*::-webkit-scrollbar-track': { bg: 'transparent' },
    // Motion is decoration: switch it off for people who ask.
    '*, *::before, *::after': {
      '@media (prefers-reduced-motion: reduce)': {
        animationDuration: '0.01ms !important',
        animationIterationCount: '1 !important',
        transitionDuration: '0.01ms !important',
        scrollBehavior: 'auto !important',
      },
    },
  },
  theme: {
    tokens: {
      fonts: {
        body: { value: "'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif" },
        heading: { value: "'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif" },
        // The dot-matrix display face: big readouts only.
        dot: { value: "'Doto Variable', 'Geist Mono Variable', ui-monospace, monospace" },
        mono: { value: "'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace" },
      },
      colors: {
        // The signal: safety orange.
        brand: {
          50: { value: '#fff3ee' },
          100: { value: '#ffe4d8' },
          200: { value: '#ffc6ad' },
          300: { value: '#ff9d76' },
          400: { value: '#ff7a45' },
          500: { value: '#ff5b1f' },
          600: { value: '#e8480d' },
          700: { value: '#c23c0a' },
          800: { value: '#99300b' },
          900: { value: '#7a290d' },
          950: { value: '#431204' },
        },
        // Dark mode: a graphite device with near-black modules.
        graphite: {
          950: { value: '#08090a' },
          900: { value: '#0c0d0f' },
          850: { value: '#111214' },
          800: { value: '#17181b' },
          750: { value: '#1d1f22' },
          700: { value: '#26282c' },
          600: { value: '#34373c' },
          500: { value: '#4c5057' },
          400: { value: '#7d828a' },
          300: { value: '#a3a7ae' },
          200: { value: '#c7cace' },
          100: { value: '#e3e5e7' },
          50: { value: '#f2f3f4' },
        },
        // Light mode: a cool off-white shell, white modules, near-black hairlines.
        shell: {
          0: { value: '#ffffff' },
          25: { value: '#fafaf9' },
          50: { value: '#f5f5f3' },
          100: { value: '#efefec' },
          150: { value: '#e8e8e4' },
          200: { value: '#dededa' },
          300: { value: '#c9c9c4' },
          400: { value: '#a6a6a0' },
          500: { value: '#84847f' },
          600: { value: '#6a6a66' },
          700: { value: '#4f4f4c' },
          900: { value: '#141414' },
        },
      },
      radii: {
        // Machined corners: small, consistent.
        l1: { value: '3px' },
        l2: { value: '6px' },
        l3: { value: '8px' },
      },
      letterSpacings: {
        title: { value: '-0.03em' },
        heading: { value: '-0.015em' },
        caps: { value: '0.1em' },
      },
      easings: {
        out: { value: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      },
    },
    recipes: {
      // Buttons are keycaps: a flat cap on a 2px "travel" edge; pressing pushes it down.
      button: {
        base: {
          fontWeight: '600',
          letterSpacing: '-0.005em',
          borderWidth: '1px',
          transitionProperty: 'background, border-color, color, box-shadow, transform',
          transitionDuration: '0.12s',
          _active: { transform: 'translateY(2px)', boxShadow: 'none' },
        },
        variants: {
          variant: {
            // The primary: the orange key.
            solid: {
              bg: 'colorPalette.solid',
              color: 'colorPalette.contrast',
              borderColor: 'key.edge',
              boxShadow: 'key',
              _hover: { bg: 'colorPalette.solidHover' },
              _expanded: { bg: 'colorPalette.solidHover' },
              _disabled: { opacity: 1, bg: 'bg.emphasized', color: 'fg.subtle', borderColor: 'border.emphasized', boxShadow: 'none' },
            },
            // Secondary: a white key with a hairline edge.
            outline: {
              color: 'fg',
              borderColor: 'border.strong',
              bg: 'bg.panel',
              boxShadow: 'keyLight',
              _hover: { bg: 'bg.muted' },
              _expanded: { bg: 'bg.muted' },
              _disabled: { opacity: 1, color: 'fg.subtle', bg: 'bg.muted', borderColor: 'border', boxShadow: 'none' },
            },
            ghost: { borderColor: 'transparent' },
            plain: { borderColor: 'transparent' },
            subtle: { borderColor: 'transparent' },
          },
        },
      },
    },
    keyframes: {
      // Graph edges on a predicted / live path (dash 5 + gap 4, twice).
      'flow-march': { to: { strokeDashoffset: '-18' } },
      // A trace being energised, start to end (stroke-dasharray = path length, set as 1 via pathLength).
      'ink-draw': { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
      // A pending LED: on, off, on.
      'led-blink': { '0%, 55%': { opacity: '1' }, '70%, 90%': { opacity: '0.25' }, '100%': { opacity: '1' } },
      // The text caret.
      caret: { '0%, 49%': { opacity: '1' }, '50%, 100%': { opacity: '0' } },
      // A readout lands: the dots light up.
      'readout-on': { from: { opacity: '0', filter: 'blur(2px)' }, to: { opacity: '1', filter: 'blur(0)' } },
    },
    // The type scale. The dot-matrix face is for readouts; the UI is Space Grotesk, tight.
    textStyles: {
      hero: { value: { fontFamily: 'dot', fontSize: '76px', fontWeight: '800', letterSpacing: '0', lineHeight: '0.95', textTransform: 'uppercase' } },
      display: { value: { fontSize: '34px', fontWeight: '550', letterSpacing: '-0.035em', lineHeight: '1.08' } },
      title: { value: { fontSize: '21px', fontWeight: '550', letterSpacing: '-0.025em', lineHeight: '1.2' } },
      heading: { value: { fontSize: '14.5px', fontWeight: '600', letterSpacing: '-0.012em', lineHeight: '1.4' } },
      // A small muted label in sentence case: field labels, list meta, table heads where needed.
      caps: { value: { fontSize: '12.5px', fontWeight: '500', letterSpacing: '-0.003em', lineHeight: '1.35' } },
      // The engraved panel caption: mono, uppercase, tiny. "01 INPUT".
      label: { value: { fontFamily: 'mono', fontSize: '10.5px', fontWeight: '500', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: '1.3' } },
      eyebrow: { value: { fontFamily: 'mono', fontSize: '11px', fontWeight: '500', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: '1.3' } },
      // A dot-matrix readout: verdict words, totals, counters (size set at the call site).
      readout: { value: { fontFamily: 'dot', fontWeight: '800', letterSpacing: '0.02em', lineHeight: '1', textTransform: 'uppercase' } },
      caption: { value: { fontSize: '12px', lineHeight: '1.45' } },
    },
    semanticTokens: {
      colors: {
        bg: {
          // The device shell; modules sit on it as white (near-black) panels (`bg.panel`).
          DEFAULT: mode('{colors.shell.100}', '{colors.graphite.850}'),
          canvas: mode('{colors.shell.100}', '{colors.graphite.850}'),
          sidebar: mode('{colors.shell.100}', '{colors.graphite.850}'),
          panel: mode('{colors.shell.0}', '{colors.graphite.900}'),
          subtle: mode('{colors.shell.25}', '{colors.graphite.900}'),
          muted: mode('{colors.shell.50}', '{colors.graphite.800}'),
          emphasized: mode('{colors.shell.150}', '{colors.graphite.700}'),
          raised: mode('{colors.shell.0}', '{colors.graphite.800}'),
          hover: mode('rgba(20,20,20,0.04)', 'rgba(242,243,244,0.05)'),
          selected: mode('{colors.shell.100}', 'rgba(242,243,244,0.07)'),
          inset: mode('{colors.shell.50}', 'rgba(242,243,244,0.03)'),
          tag: mode('{colors.shell.100}', 'rgba(242,243,244,0.06)'),
          code: mode('{colors.shell.50}', '{colors.graphite.950}'),
          inverted: mode('{colors.shell.900}', '{colors.graphite.50}'),
        },
        fg: {
          DEFAULT: mode('{colors.shell.900}', '{colors.graphite.50}'),
          muted: mode('{colors.shell.700}', '{colors.graphite.200}'),
          subtle: mode('{colors.shell.600}', '{colors.graphite.400}'),
          code: mode('{colors.shell.700}', '{colors.graphite.200}'),
          inverted: mode('{colors.shell.0}', '{colors.graphite.950}'),
        },
        border: {
          DEFAULT: mode('{colors.shell.200}', '{colors.graphite.700}'),
          muted: mode('{colors.shell.150}', '{colors.graphite.750}'),
          subtle: mode('{colors.shell.150}', '{colors.graphite.750}'),
          emphasized: mode('{colors.shell.300}', '{colors.graphite.600}'),
          // The module outline: a thin near-black hairline (a lighter graphite line in dark).
          strong: mode('#1c1c1c', '{colors.graphite.500}'),
        },
        scrollbar: mode('rgba(20,20,20,0.18)', 'rgba(242,243,244,0.14)'),
        // Legacy aliases used by the auth pages from the boilerplate.
        surface: mode('{colors.shell.0}', '{colors.graphite.900}'),
        primary: {
          DEFAULT: mode('{colors.brand.700}', '{colors.brand.400}'),
          fg: mode('#111111', '#111111'),
        },
        brand: {
          solid: mode('{colors.brand.500}', '{colors.brand.500}'),
          solidHover: mode('{colors.brand.600}', '{colors.brand.400}'),
          // Black legend on the orange key (white would fail contrast).
          contrast: mode('#111111', '#0c0d0f'),
          // Orange as text / icon colour (darkened in light mode to pass AA on white).
          fg: mode('{colors.brand.700}', '{colors.brand.400}'),
          // Orange as a line / ring / small fill.
          accent: mode('{colors.brand.500}', '{colors.brand.500}'),
          muted: mode('{colors.brand.100}', 'rgba(255,91,31,0.20)'),
          subtle: mode('{colors.brand.50}', 'rgba(255,91,31,0.10)'),
          emphasized: mode('{colors.brand.200}', 'rgba(255,91,31,0.28)'),
          border: mode('{colors.brand.300}', 'rgba(255,91,31,0.45)'),
          focusRing: mode('{colors.brand.500}', '{colors.brand.400}'),
        },
        // The keycap's travel edge.
        key: {
          edge: mode('#1c1c1c', '#000000'),
        },
        // Run / decision status — text inks (AA on white / near-black). Used by nodes, edges and the log.
        status: {
          auto: mode('#13803a', '#4ade80'),
          pending: mode('#a15c00', '#fbbf24'),
          blocked: mode('#d42a1e', '#ff6b5e'),
          running: mode('{colors.brand.700}', '{colors.brand.400}'),
          idle: mode('{colors.shell.500}', '{colors.graphite.400}'),
          // Text/icon colour on a filled status background.
          contrast: mode('white', '{colors.graphite.950}'),
        },
        // The LEDs themselves: brighter than the text inks, with a faint halo of the same colour.
        led: {
          auto: mode('#16c454', '#3ee07a'),
          pending: mode('#ffb000', '#ffc02e'),
          blocked: mode('#ff3b2f', '#ff4d40'),
          running: mode('{colors.brand.500}', '{colors.brand.500}'),
          idle: mode('{colors.shell.300}', '{colors.graphite.500}'),
        },
        // Node categories: used sparingly (an icon colour, never a fill).
        kind: {
          trigger: mode('{colors.shell.700}', '{colors.graphite.200}'),
          valio: mode('{colors.shell.700}', '{colors.graphite.200}'),
          rule: mode('{colors.shell.900}', '{colors.graphite.50}'),
          rank: mode('{colors.shell.700}', '{colors.graphite.200}'),
          policy: mode('{colors.brand.700}', '{colors.brand.400}'),
          human: mode('#a15c00', '#fbbf24'),
          action: mode('#13803a', '#4ade80'),
          audit: mode('{colors.shell.600}', '{colors.graphite.300}'),
        },
        // The board: a faint dot grid on the shell.
        canvas: {
          dot: mode('rgba(20,20,20,0.16)', 'rgba(242,243,244,0.10)'),
          // The rules lane: a rack of rule modules.
          lane: mode('{colors.shell.0}', '{colors.graphite.900}'),
          laneBorder: mode('#1c1c1c', '{colors.graphite.500}'),
        },
        node: {
          bg: mode('{colors.shell.0}', '{colors.graphite.900}'),
          border: mode('#1c1c1c', '{colors.graphite.500}'),
          handle: mode('{colors.shell.0}', '{colors.graphite.900}'),
        },
        // Traces on the board.
        edge: {
          idle: mode('{colors.shell.400}', '{colors.graphite.600}'),
          live: mode('{colors.brand.500}', '{colors.brand.500}'),
          labelFg: mode('{colors.shell.600}', '{colors.graphite.400}'),
          labelTakenFg: mode('{colors.shell.900}', '{colors.graphite.50}'),
        },
      },
      shadows: {
        // Modules are flat on the shell: the hairline does the work.
        panel: mode('none', 'none'),
        node: mode('0 1px 0 rgba(20,20,20,0.06)', '0 1px 0 rgba(0,0,0,0.4)'),
        // Floating panels, popovers, dialogs: a short, hard drop — a module lifted off the shell.
        float: mode(
          '0 1px 0 rgba(20,20,20,0.08), 0 14px 30px -14px rgba(20,20,20,0.28)',
          '0 1px 0 rgba(0,0,0,0.5), 0 16px 36px -14px rgba(0,0,0,0.85)'
        ),
        input: mode('none', 'none'),
        // Keycaps: the travel edge under the cap.
        key: mode('0 2px 0 0 #1c1c1c', '0 2px 0 0 #000000'),
        keyLight: mode('0 2px 0 0 #1c1c1c', '0 2px 0 0 {colors.graphite.500}'),
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
