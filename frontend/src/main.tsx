import { PwaControls } from './components/PwaControls'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeLanguage } from './i18n'
import { installLatinNumericInputs } from './utils/latinNumericInputs'

initializeLanguage()
installLatinNumericInputs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaControls />
  </StrictMode>,
)
