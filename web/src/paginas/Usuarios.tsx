import { useSearchParams } from 'react-router-dom'
import { UserRoundCheck, Users } from 'lucide-react'
import { useSessao } from '@/lib/sessao'
import { Abas, CabecalhoPagina } from '@/componentes/ui'
import Equipe from './Equipe'
import Clientes from './Clientes'

export default function Usuarios() {
  const [params, setParams] = useSearchParams()
  const { empresa } = useSessao()
  const aba = params.get('aba') === 'clientes' ? 'clientes' : 'equipe'
  return (
    <>
      <CabecalhoPagina sobretitulo="Gestão" titulo="Usuários & Clientes" subtitulo={`Quem acessa o Obtra${empresa ? ` pela ${empresa.nome}` : ''}: equipe interna e clientes com acesso único.`} />
      <Abas
        className="mb-5"
        atual={aba}
        aoMudar={(a) => setParams({ aba: a }, { replace: true })}
        abas={[
          { id: 'equipe', rotulo: 'Equipe', icone: <Users className="size-3.5" /> },
          { id: 'clientes', rotulo: 'Clientes', icone: <UserRoundCheck className="size-3.5" /> },
        ]}
      />
      <div key={aba} className="anim-aparecer">{aba === 'equipe' ? <Equipe embutido /> : <Clientes embutido />}</div>
    </>
  )
}
