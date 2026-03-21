/* ============================================================
   NŪFIK DESIGN SYSTEM — tailwind.config.js
   CSS 변수 ↔ Tailwind 유틸리티 매핑입니다.
   토큰 추가/삭제 시에만 수정하세요.
   ============================================================ */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {

      /* ── Color ── */
      colors: {
        ink:    'var(--color-bg)',
        line:   'var(--color-line)',
        txt:    'var(--color-txt)',
        point:  'var(--color-point)',
        accent: 'var(--color-accent)',
      },

      /* ── Font family ── */
      fontFamily: {
        display: 'var(--font-display)',
        mono:    'var(--font-mono)',
      },

      /* ── Font size ── */
      fontSize: {
        'h1':      'var(--text-h1)',
        'h2':      'var(--text-h2)',
        'nav':     'var(--text-nav)',
        'label':   'var(--text-label)',
        'caption': 'var(--text-caption)',
        'body':    'var(--text-body)',
        'tag':     'var(--text-tag)',
      },

      /* ── Letter spacing ── */
      letterSpacing: {
        wide:  'var(--tracking-wide)',
        nav:   'var(--tracking-nav)',
        mono:  'var(--tracking-mono)',
        body:  'var(--tracking-body)',
      },

      /* ── Line height ── */
      lineHeight: {
        tight: 'var(--leading-tight)',
        body:  'var(--leading-body)',
      },

      /* ── Spacing ── */
      spacing: {
        panel:       'var(--panel-width)',
        'panel-y':   'var(--panel-padding-y)',
        'nav-x':     'var(--nav-padding-x)',
        'nav-x-mob': 'var(--nav-padding-x-mob)',
        'gallery':   'var(--gallery-inset)',
      },

      /* ── Z-index ── */
      zIndex: {
        gallery:   'var(--z-gallery)',
        grid:      'var(--z-grid)',
        center:    'var(--z-center)',
        panel:     'var(--z-panel)',
        nav:       'var(--z-nav)',
        preloader: 'var(--z-preloader)',
      },

      /* ── Transition timing ── */
      transitionTimingFunction: {
        snap:   'var(--ease-snap)',
        out:    'var(--ease-out)',
        in:     'var(--ease-in)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        fast:  'var(--dur-fast)',
        mid:   'var(--dur-mid)',
        slow:  'var(--dur-slow)',
        intro: 'var(--dur-intro)',
      },

    },
  },
  plugins: [],
};
