import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/admin.css';
import App from './App.jsx';
import { adoptPathRoute } from './lib/router.jsx';

adoptPathRoute();
createRoot(document.getElementById('admin-root')).render(<StrictMode><App /></StrictMode>);
