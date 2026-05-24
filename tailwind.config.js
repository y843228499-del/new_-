
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",           // Root files (App.tsx, MainShell.tsx)
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./eip/**/*.{js,ts,jsx,tsx}",    // EIP module
    "./modbus/**/*.{js,ts,jsx,tsx}"  // Modbus module
  ],
  safelist: [
    // Ensure dynamic colors used in Help/Chaos panels are always generated
    {
      pattern: /bg-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate)-(50|100|500|600|800|900)/,
      variants: ['hover', 'group-hover'],
    },
    {
      pattern: /text-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate)-(400|500|600|700)/,
      variants: ['hover', 'group-hover'],
    },
    {
      pattern: /border-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate)-(100|200|400|500)/,
      variants: ['hover'],
    },
    {
      pattern: /ring-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate)-(200|400)/,
    }
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a', // slate-900
        secondary: '#334155', // slate-700
        accent: '#0ea5e9', // sky-500
        success: '#10b981', // emerald-500
        warning: '#f59e0b', // amber-500
        danger: '#ef4444', // red-500
      }
    },
  },
  plugins: [],
}
