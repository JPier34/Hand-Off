import { useState, useCallback } from 'react'

type Theme = 'dark' | 'light'

function getStoredTheme(): Theme {
  const stored = localStorage.getItem('hoff-theme')
  return stored === 'light' ? 'light' : 'dark'
}

function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem('hoff-theme', theme)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next)
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setThemeState(next)
  }, [theme])

  return { theme, setTheme, toggle }
}
