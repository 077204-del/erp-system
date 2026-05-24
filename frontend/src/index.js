import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { initMobileBoot } from './mobileBoot';
import { initNativeWebCache } from './nativeWebCache';
import { initOfflineBootstrap } from './offline/offlineBootstrap';
import { initWebViewSocketBridge } from './services/adminNotificationSocket';

initMobileBoot();
void initNativeWebCache();
initOfflineBootstrap();
initWebViewSocketBridge();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();
