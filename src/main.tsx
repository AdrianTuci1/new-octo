/*
** 2026 May 04
**
** The author disclaims copyright to this source code. In place of
** a legal notice, here is a blessing:
**
**    "Everything around you that you call life was made up by people
**    that were no smarter than you. And you can change it, you can
**    influence it... Once you learn that, you'll never be the same again."
**
*************************************************************************
** This file is part of Octomus.
*/

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ServiceLocator } from './services/ServiceLocator';
import './styles.css';

// Initialize the DI container before rendering
ServiceLocator.init();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
