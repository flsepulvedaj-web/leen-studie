import { useEffect, useRef, useState } from 'react'
import { ServicioError } from './transcriber'

/**
 * Ejecuta `fn` ahora y la repite cada `intervalo(dato)` ms. Si el intervalo
 * devuelve null, deja de repetir. Se detiene sola al salir de la pantalla.
 */
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalo: (dato: T | undefined) => number | null,
  deps: unknown[],
) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<ServicioError | null>(null)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  const intRef = useRef(intervalo)
  fnRef.current = fn
  intRef.current = intervalo

  useEffect(() => {
    let vivo = true
    let timer: number | undefined
    let ultimo: T | undefined

    const correr = async () => {
      let espera: number | null
      try {
        const d = await fnRef.current()
        if (!vivo) return
        ultimo = d
        setData(d)
        setError(null)
        espera = intRef.current(ultimo)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof ServicioError ? e : new ServicioError(String(e), true))
        // Con error reintentamos más despacio.
        espera = Math.max(5_000, intRef.current(ultimo) ?? 5_000)
      }
      if (vivo && espera !== null) timer = window.setTimeout(correr, espera)
    }
    void correr()

    return () => {
      vivo = false
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, error, recargar: () => setTick((t) => t + 1) }
}
