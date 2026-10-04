import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { bootCatalog } from './data/live.js';
import App from './App.jsx';

bootCatalog(); // the last live catalog from this device, before the first render (no flash of old prices)
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
