import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Library } from './Library'
import './options.css'

function LibraryApp() {
  const [theme, setTheme] = useState(localStorage.getItem('ifs-theme') === 'light' ? 'light' : 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('ifs-theme', theme)
  }, [theme])
  return <div className="app">
    <header className="app-bar"><strong>Instagram Feed Sorter</strong><button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button></header>
    <Library />
  </div>
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<LibraryApp />)
