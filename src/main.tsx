import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTheme } from './state/theme';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

// Before the first render, so a forced theme never flashes the system one.
initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
