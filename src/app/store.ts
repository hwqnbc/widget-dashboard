import { combineReducers, configureStore } from '@reduxjs/toolkit'
import {
  persistReducer,
  persistStore,
  FLUSH,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  REHYDRATE,
} from 'redux-persist'
import widgetsReducer from '../features/widgets/widgetsSlice'
import uiReducer from '../features/ui/uiSlice'

/**
 * Self-contained localStorage engine for redux-persist.
 *
 * We deliberately avoid `import storage from 'redux-persist/lib/storage'`:
 * that module is CommonJS, and in the minified production bundle its default
 * export resolves to the module namespace rather than the storage object,
 * yielding "getItem is not a function" at runtime. Implementing the tiny
 * async interface ourselves sidesteps the interop issue entirely.
 */
const hasWindow = typeof window !== 'undefined'
const storage = {
  getItem(key: string): Promise<string | null> {
    return Promise.resolve(hasWindow ? window.localStorage.getItem(key) : null)
  },
  setItem(key: string, value: string): Promise<void> {
    if (hasWindow) window.localStorage.setItem(key, value)
    return Promise.resolve()
  },
  removeItem(key: string): Promise<void> {
    if (hasWindow) window.localStorage.removeItem(key)
    return Promise.resolve()
  },
}

const rootReducer = combineReducers({
  widgets: widgetsReducer,
  ui: uiReducer,
})

const persistConfig = {
  key: 'testsite',
  version: 1,
  storage,
  whitelist: ['widgets', 'ui'],
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // redux-persist dispatches these non-serializable lifecycle actions.
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
