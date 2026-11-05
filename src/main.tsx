import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootstrapRuntimeEnvironment } from './app/bootstrap';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemen #root tidak ditemukan pada index.html');
}

const runtime = bootstrapRuntimeEnvironment();

createRoot(rootElement).render(
  <StrictMode>
    <App runtime={runtime} />
  </StrictMode>,
);

