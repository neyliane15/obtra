import { useEffect } from 'react'

const MARCA = 'Obtra'

/** Título da aba: "Obras · Obtra". Sem título, só a marca. */
export function useTitulo(titulo: string | null | undefined) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · ${MARCA}` : `${MARCA} · Diário de Obra`
  }, [titulo])
}
