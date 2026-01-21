import React from 'react'
import ReactDOM from 'react-dom/client'
import { LoginPage } from './components/LoginPage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LoginPage onLogin={(user) => console.log('Logged in:', user)} />
  </React.StrictMode>
)
