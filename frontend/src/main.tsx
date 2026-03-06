import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@arco-design/web-react/dist/css/arco.css';
import './index.css';
import App from './App';
import { AppStoreProvider } from './contexts/AppStoreContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppStoreProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AppStoreProvider>,
);
