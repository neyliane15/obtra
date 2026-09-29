import { Building2 } from 'lucide-react'
import { useSessao } from '@/lib/sessao'
import { Selecao, Vazio } from './ui'

/** Master sem empresa em contexto: pede para escolher uma. */
export function PrecisaEmpresa({ oque }: { oque: string }) {
  const { empresas, trocarEmpresa } = useSessao()
  return (
    <Vazio
      titulo="Escolha uma empresa"
      descricao={`Para gerenciar ${oque}, entre no contexto de uma empresa.`}
      icone={<Building2 className="size-3.5" />}
      acao={
        <Selecao className="!w-64" defaultValue="" onChange={(e) => e.target.value && trocarEmpresa(e.target.value)} aria-label="Empresa">
          <option value="">Selecione a empresa…</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </Selecao>
      }
    />
  )
}
