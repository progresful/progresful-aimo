import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import App from './App.tsx';
import { Provider } from './components/ui/provider';
import { Toaster } from './components/ui/toaster';


const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Provider>
          <App />
          <Toaster />
        </Provider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
