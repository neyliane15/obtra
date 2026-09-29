import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Botao, Campo, Entrada, Modal } from './ui'
import { useAvisos } from './avisos'

export function validarNovaSenha(senha: string, confirmacao: string): string | null {
  if (senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (senha !== confirmacao) return 'As senhas não conferem.'
  return null
}

export function CampoSenha({
  id, valor, aoMudar, placeholder, autoComplete = 'new-password', invalido,
}: {
  id?: string
  valor: string
  aoMudar: (v: string) => void
  placeholder?: string
  autoComplete?: string
  invalido?: boolean
}) {
  const [ver, setVer] = useState(false)
  return (
    <div className="relative">
      <Entrada
        id={id}
        type={ver ? 'text' : 'password'}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        invalido={invalido}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-tinta-fraca hover:text-marinho-700"
        aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {ver ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  )
}

export function ModalTrocarSenha({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const avisos = useAvisos()
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const v = validarNovaSenha(senha, conf)
    setErro(v)
    if (v) return
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) return avisos.erro(error)
    avisos.sucesso('Senha alterada.')
    setSenha('')
    setConf('')
    aoFechar()
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Trocar senha"
      descricao="Use ao menos 6 caracteres. Você continuará conectado."
      largura="sm"
      codigo="CONTA · SENHA"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form="form-senha" carregando={salvando}>Salvar senha</Botao>
        </>
      }
    >
      <form id="form-senha" onSubmit={salvar} className="flex flex-col gap-3.5">
        <Campo rotulo="Nova senha" htmlFor="ns">
          <CampoSenha id="ns" valor={senha} aoMudar={setSenha} invalido={!!erro} />
        </Campo>
        <Campo rotulo="Confirmar senha" htmlFor="cs" erro={erro}>
          <CampoSenha id="cs" valor={conf} aoMudar={setConf} invalido={!!erro} />
        </Campo>
      </form>
    </Modal>
  )
}
