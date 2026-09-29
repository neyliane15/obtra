import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ProvedorDeSessao } from './lib/sessao'
import { ProvedorDeAvisos } from './componentes/avisos'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/jetbrains-mono'
import './estilos.css'

const cliente = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 30_000, retry: 1 },
  },
})

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Elemento #raiz não encontrado')

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <ProvedorDeAvisos>
          <ProvedorDeSessao>
            <App />
          </ProvedorDeSessao>
        </ProvedorDeAvisos>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
