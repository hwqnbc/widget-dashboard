import { useAppSelector } from '../../app/hooks'

/**
 * Read one field from a widget instance's persisted `data`, with a fallback.
 *
 * By default the stored value is accepted only when its `typeof` matches the
 * fallback (covers strings and numbers). For richer validation/normalisation
 * (arrays, enums) pass `coerce`, which receives the raw value and returns the
 * value to use, or `undefined` to fall back.
 */
export function useWidgetField<T>(
  id: string,
  key: string,
  fallback: T,
  coerce?: (value: unknown) => T | undefined,
): T {
  return useAppSelector((state) => {
    const inst = state.widgets.instances.find((w) => w.id === id)
    const value = inst?.data[key]
    if (coerce) return coerce(value) ?? fallback
    return value != null && typeof value === typeof fallback
      ? (value as T)
      : fallback
  })
}
