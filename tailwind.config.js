module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base':        'var(--bg-base)',
        'bg-sidebar':     'var(--bg-sidebar)',
        'bg-card':        'var(--bg-card)',
        'bg-card-hover':  'var(--bg-card-hover)',
        'bg-card-active': 'var(--bg-card-active)',
        'border-default': 'var(--border)',
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted':     'var(--text-muted)',
        'accent':         'var(--accent-blue)',
        'status-working': 'var(--status-working)',
        'status-confirm': 'var(--status-confirm)',
        'status-waiting': 'var(--status-waiting)',
      },
      animation: {
        'pulse-fast':    'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-confirm': 'pulse-confirm 1s ease-in-out infinite',
      },
      keyframes: {
        'pulse-confirm': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':       { opacity: '0.3', transform: 'scale(0.8)' },
        }
      }
    }
  },
  plugins: []
}
