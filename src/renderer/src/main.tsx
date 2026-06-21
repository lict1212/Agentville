import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ConfirmDialogHost } from './components/ConfirmDialog'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <ConfirmDialogHost />
  </React.StrictMode>
)
