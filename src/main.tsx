import { createRoot } from 'react-dom/client'
import 'react-toastify/dist/ReactToastify.css'
import './index.css'
import './App.css'
import { applyTheme, getStoredTheme } from './lib/theme'
import App from './App.tsx'

applyTheme(getStoredTheme())
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import Store from './redux/Store.ts';
import "./i18n/index.ts";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <Provider store={Store}>
      <App />
    </Provider>
  </QueryClientProvider>
);

