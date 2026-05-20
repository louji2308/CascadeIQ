/**
 * CascadeIQ — Main Entry Point
 * ─────────────────────────────
 * Graph-native disaster cascade intelligence
 * Boot sequence: fonts → critical styles → React tree → performance mark
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ── Performance mark — measure time-to-interactive ─────────
performance.mark('cascadeiq-boot-start')

// ── Font preload strategy ───────────────────────────────────
// Inject preconnect hints so Google Fonts resolves faster
const injectFontPreconnect = () => {
  const existingPreconnect = document.querySelector('link[rel="preconnect"][href*="fonts.googleapis"]')
  if (!existingPreconnect) {
    const links = [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
    ]
    links.forEach(({ rel, href, crossOrigin }) => {
      const link = document.createElement('link')
      link.rel = rel
      link.href = href
      if (crossOrigin) link.crossOrigin = crossOrigin
      document.head.appendChild(link)
    })

    // Load fonts: Rajdhani (display) + DM Sans (body) + Share Tech Mono (data/mono)
    const fontLink = document.createElement('link')
    fontLink.rel = 'stylesheet'
    fontLink.href =
      'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&family=Share+Tech+Mono&display=swap'
    document.head.appendChild(fontLink)
  }
}

// ── Critical boot CSS ───────────────────────────────────────
// Prevents flash of unstyled content before index.css loads
// by applying the absolute baseline immediately
const injectCriticalStyles = () => {
  const id = 'cascadeiq-critical'
  if (document.getElementById(id)) return

  const style = document.createElement('style')
  style.id = id
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root {
      height: 100%;
      background: #030609;
      color: #F0F4FF;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    /* Hide root until React hydrates — eliminates layout shift flash */
    #root:empty { visibility: hidden; }
    /* Loading shimmer shown before React mounts */
    #root:empty::before {
      content: '';
      display: block;
      width: 100%;
      height: 100%;
      background:
        linear-gradient(
          135deg,
          rgba(255, 95, 31, 0.025) 0%,
          transparent 50%,
          rgba(0, 207, 255, 0.015) 100%
        ),
        #030609;
    }
  `
  document.head.appendChild(style)
}

// ── Document metadata ───────────────────────────────────────
const setDocumentMeta = () => {
  // Update title with indicator that app is initializing
  document.title = 'CascadeIQ — Disaster Cascade Intelligence'

  // Add theme-color for mobile browser chrome
  let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!themeColor) {
    themeColor = document.createElement('meta')
    themeColor.name = 'theme-color'
    document.head.appendChild(themeColor)
  }
  themeColor.content = '#030609'

  // Color scheme hint
  let colorScheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (!colorScheme) {
    colorScheme = document.createElement('meta')
    colorScheme.name = 'color-scheme'
    document.head.appendChild(colorScheme)
  }
  colorScheme.content = 'dark'
}

// ── Root element guard ──────────────────────────────────────
const getRootElement = (): HTMLElement => {
  const el = document.getElementById('root')
  if (!el) {
    // Should never happen — but fail loudly if it does
    const fallback = document.createElement('div')
    fallback.id = 'root'
    document.body.appendChild(fallback)
    console.error('[CascadeIQ] #root element not found — created fallback')
    return fallback
  }
  return el
}

// ── Execute boot sequence ───────────────────────────────────
injectCriticalStyles()
injectFontPreconnect()
setDocumentMeta()

// ── Mount React application ─────────────────────────────────
const root = createRoot(getRootElement())

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── Post-mount performance measurement ─────────────────────
// Measures how long the full JS parse + React mount took
if (typeof window !== 'undefined' && 'performance' in window) {
  // Use requestIdleCallback if available for non-blocking measurement
  const measure = () => {
    try {
      performance.mark('cascadeiq-boot-end')
      performance.measure(
        'cascadeiq-boot',
        'cascadeiq-boot-start',
        'cascadeiq-boot-end',
      )
      const [entry] = performance.getEntriesByName('cascadeiq-boot')
      if (entry && import.meta.env.DEV) {
        console.info(
          `%c⚡ CascadeIQ%c booted in ${entry.duration.toFixed(1)}ms`,
          'color: #FF5F1F; font-weight: 700; font-family: monospace',
          'color: #7B8FAB; font-family: monospace',
        )
      }
    } catch {
      // Measurement API unavailable — silently skip
    }
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(measure, { timeout: 2000 })
  } else {
    setTimeout(measure, 0)
  }
}