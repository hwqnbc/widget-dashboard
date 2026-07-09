import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { BrowserRouter } from 'react-router-dom'
import { persistor, store } from './app/store'
import AppThemeProvider from './theme/AppThemeProvider'
import App from './App'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

// Vite's BASE_URL is '/widget-dashboard/' in the Pages build and '/' in dev.
// react-router wants a basename without a trailing slash (except root).
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

createRoot(rootElement).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <AppThemeProvider>
          {/* basename lets react-router work under the GitHub Pages subpath. */}
          <BrowserRouter basename={basename}>
            <App />
          </BrowserRouter>
        </AppThemeProvider>
      </PersistGate>
    </Provider>
  </StrictMode>,
)
