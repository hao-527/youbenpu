/**
 * Store — API-driven with local cache fallback.
 *
 * Data flow:
 * 1. On app launch (after auth), fetch all data from API
 * 2. Store in React state + persist to local storage as cache
 * 3. On each mutation, call API first — on success, update local state
 * 4. If API fails, show error toast (no optimistic updates for simplicity)
 */
export { StoreProvider, useStore, useDispatch, useRefreshStore } from './context'
