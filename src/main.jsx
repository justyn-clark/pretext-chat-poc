import React from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { App } from './app.jsx';
import './styles.css';

const router = createHashRouter([
  { path: '/', element: <App /> },
  { path: '/:sessionId', element: <App /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
