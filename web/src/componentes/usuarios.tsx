import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Check, Copy, KeyRound, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import type { Papel } from '@/tipos/banco'
import { supabase } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { useObras } from '@/lib/consultas'
import { gerarSenha, textoDeAcesso } from '@/lib/senha'
import { telefoneWhatsApp } from '@/lib/formato'
import { PAPEL } from '@/lib/rotulos'
import { Botao, Campo, CampoTexto, Entrada, Modal, Selecao } from './ui'
import { useAvisos } from './avisos'

export interface AcessoGerado {
  nome: string
  email: string
  senha: string
  telefone?: string | null
  empresa?: string | null
}

/* ------------------------------------------------------- Acesso único -- */
export function CartaoAcesso({ acesso }: { acesso: AcessoGerado }) {
  const avisos = useAvisos()
  const [copiado, setCopiado] = useState<string | null>(null)
  const url = window.location.origin
  const texto = textoDeAcesso({ ...acesso, url })
  const copiar = async (valor: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(chave)
      setTimeout(() => setCopiado(null), 1600)
    } catch {
      avisos.erro('Não foi possível copiar. Selecione o texto manualmente.')
    }
  }
  const tel = telefoneWhatsApp(acesso.telefone)
  const wa = `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
  const Linha = ({ rotulo, valor, chave, mono }: { rotulo: string; valor: string; chave: string; mono?: boolean }) => (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-marinho-300/25 py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="font-mono text-[9.5px] tracking-[0.18em] text-marinho-300 uppercase">{rotulo}</p>
        <p className={clsx('truncate text-[13.5px] text-white', mono && 'font-mono tracking-wide')}>{valor}</p>
      </div>
      <button onClick={() => void copiar(valor, chave)} className="flex size-8 shrink-0 items-center justify-center rounded-md text-marinho-200 hover:bg-white/10 hover:text-white" aria-label={`Copiar ${rotulo}`}>
        {copiado === chave ? <Check className="size-4 text-ambar-400" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
  return (
    <div>
      <div className="blueprint cantoneiras relative rounded-lg p-4 [--cor-cantoneira:#F29A2E]">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="size-4 text-ambar-400" />
          <p className="font-display text-[13px] font-bold text-white">Acesso único</p>
          <span className="ml-auto font-mono text-[9px] tracking-widest text-marinho-300/70">GUARDE COM SEGURANÇA</span>
        </div>
        <Linha rotulo="Endereço" valor={url} chave="url" />
        <Linha rotulo="E-mail" valor={acesso.email} chave="email" />
        <Linha rotulo="Senha" valor={acesso.senha} chave="senha" mono />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Botao variante="secundario" icone={copiado === 'tudo' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={() => void copiar(texto, 'tudo')}>
          Copiar mensagem
        </Botao>
        <a href={wa} target="_blank" rel="noopener" className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded-md bg-[#1FAF5A] px-3.5 text-[12.5px] font-medium text-white hover:brightness-105">
          <MessageCircle className="size-3.5" /> Enviar por WhatsApp
        </a>
      </div>
      <p className="mt-2 text-[11px] text-tinta-fraca">A senha não fica visível depois que esta janela for fechada. Se perder, redefina.</p>
    </div>
  )
}

/* ---------------------------------------------------- Novo usuário -- */
const esquema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.'),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  senha: z.string().min(6, 'Mínimo de 6 caracteres.'),
})

export function ModalNovoUsuario({
  aberto, aoFechar, papeis, papelInicial, empresaIdFixa, obrasIniciais = [],
}: {
  aberto: boolean
  aoFechar: () => void
  papeis: Papel[]
  papelInicial?: Papel
  /** empresa já definida (admin, ou master em contexto) */
  empresaIdFixa?: string | null
  obrasIniciais?: string[]
}) {
  const { empresas, ehMaster } = useSessao()
  const avisos = useAvisos()
  const qc = useQueryClient()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState(gerarSenha())
  const [telefone, setTelefone] = useState('')
  const [cargo, setCargo] = useState('')
  const [papel, setPapel] = useState<Papel>(papelInicial ?? papeis[0] ?? 'colaborador')
  const [empresaId, setEmpresaId] = useState(empresaIdFixa ?? '')
  const [obrasSel, setObrasSel] = useState<string[]>(obrasIniciais)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [criado, setCriado] = useState<AcessoGerado | null>(null)
  const obras = useObras()
  const obrasDaEmpresa = (obras.data ?? []).filter((o) => o.empresa_id === empresaId)

  useEffect(() => {
    if (aberto) {
      setNome('')
      setEmail('')
      setSenha(gerarSenha())
      setTelefone('')
      setCargo('')
      setPapel(papelInicial ?? papeis[0] ?? 'colaborador')
      setEmpresaId(empresaIdFixa ?? '')
      setObrasSel(obrasIniciais)
      setErros({})
      setCriado(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const r = esquema.safeParse({ nome, email, senha })
    const novos: Record<string, string> = {}
    if (!r.success) for (const i of r.error.issues) novos[String(i.path[0])] = i.message
    if (!empresaId) novos.empresa = 'Escolha a empresa.'
    setErros(novos)
    if (Object.keys(novos).length || !r.success) return
    setSalvando(true)
    const { error } = await supabase.rpc('admin_criar_usuario', {
      p_email: r.data.email,
      p_senha: r.data.senha,
      p_nome: r.data.nome,
      p_papel: papel,
      p_empresa_id: empresaId,
      p_obras: papel === 'cliente' ? obrasSel : [],
      p_telefone: telefone.trim() || null,
      p_cargo: cargo.trim() || null,
    })
    setSalvando(false)
    if (error) {
      if (/já cadastrado/i.test(error.message)) setErros({ email: 'E-mail já cadastrado.' })
      else avisos.erro(error)
      return
    }
    void qc.invalidateQueries({ queryKey: ['perfis'] })
    void qc.invalidateQueries({ queryKey: ['vinculos'] })
    avisos.sucesso(`${PAPEL[papel]} criado.`)
    setCriado({
      nome: r.data.nome,
      email: r.data.email,
      senha: r.data.senha,
      telefone,
      empresa: empresas.find((x) => x.id === empresaId)?.nome,
    })
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={criado ? 'Acesso criado' : papeis.length === 1 && papeis[0] === 'cliente' ? 'Novo cliente' : 'Novo usuário'}
      descricao={criado ? `Envie os dados abaixo para ${criado.nome}.` : 'O acesso já nasce confirmado — não depende de e-mail.'}
      codigo="USUÁRIO · CADASTRO"
      largura="md"
      rodape={
        criado ? (
          <Botao onClick={aoFechar}>Concluir</Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
            <Botao type="submit" form="form-usuario" carregando={salvando}>Criar acesso</Botao>
          </>
        )
      }
    >
      {criado ? (
        <CartaoAcesso acesso={criado} />
      ) : (
        <form id="form-usuario" onSubmit={salvar} className="grid gap-3.5 sm:grid-cols-2" noValidate>
          {ehMaster && !empresaIdFixa && (
            <Campo rotulo="Empresa" obrigatorio erro={erros.empresa} className="sm:col-span-2" htmlFor="nu-emp">
              <Selecao id="nu-emp" value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setObrasSel([]) }}>
                <option value="">Selecione…</option>
                {empresas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </Selecao>
            </Campo>
          )}
          {papeis.length > 1 && (
            <Campo rotulo="Papel" className="sm:col-span-2">
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
                {papeis.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={papel === p}
                    onClick={() => setPapel(p)}
                    className={clsx(
                      'h-9 rounded-md border text-[12px] font-medium transition-colors',
                      papel === p ? 'border-marinho-900 bg-marinho-900 text-white' : 'border-linha-forte text-tinta-suave hover:border-marinho-300',
                    )}
                  >
                    {PAPEL[p]}
                  </button>
                ))}
              </div>
            </Campo>
          )}
          <CampoTexto rotulo="Nome completo" obrigatorio value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.nome} className="sm:col-span-2" />
          <CampoTexto rotulo="E-mail" obrigatorio type="email" value={email} onChange={(e) => setEmail(e.target.value)} erro={erros.email} className="sm:col-span-2" autoComplete="off" />
          <Campo rotulo="Senha inicial" erro={erros.senha} htmlFor="nu-senha" dica="Gerada automaticamente — você pode alterar.">
            <div className="flex gap-1.5">
              <Entrada id="nu-senha" value={senha} onChange={(e) => setSenha(e.target.value)} className="font-mono" invalido={!!erros.senha} autoComplete="off" />
              <Botao variante="secundario" apenasIcone icone={<RefreshCw className="size-3.5" />} onClick={() => setSenha(gerarSenha())} aria-label="Gerar outra senha" />
            </div>
          </Campo>
          <CampoTexto rotulo="Telefone / WhatsApp" type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 90000-0000" />
          {papel !== 'cliente' && <CampoTexto rotulo="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} className="sm:col-span-2" placeholder="Engenheiro de campo" />}
          {papel === 'cliente' && (
            <Campo rotulo="Obras que poderá acompanhar" className="sm:col-span-2">
              <SeletorObras obras={obrasDaEmpresa.map((o) => ({ id: o.id, nome: o.nome }))} selecionadas={obrasSel} aoMudar={setObrasSel} />
            </Campo>
          )}
        </form>
      )}
    </Modal>
  )
}

export function SeletorObras({
  obras, selecionadas, aoMudar,
}: {
  obras: { id: string; nome: string }[]
  selecionadas: string[]
  aoMudar: (ids: string[]) => void
}) {
  if (!obras.length) return <p className="rounded-md border border-dashed border-linha-forte px-3 py-3 text-xs text-tinta-fraca">Nenhuma obra cadastrada nesta empresa.</p>
  return (
    <ul className="rolagem-fina max-h-52 divide-y divide-linha overflow-y-auto rounded-md border border-linha-forte">
      {obras.map((o) => {
        const sel = selecionadas.includes(o.id)
        return (
          <li key={o.id}>
            <label className={clsx('flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[12.5px]', sel ? 'bg-marinho-50' : 'hover:bg-papel')}>
              <input
                type="checkbox"
                checked={sel}
                onChange={() => aoMudar(sel ? selecionadas.filter((x) => x !== o.id) : [...selecionadas, o.id])}
                className="size-3.5 accent-marinho-800"
              />
              {o.nome}
            </label>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------- Redefinir senha -- */
export function ModalRedefinirSenha({
  usuario, aoFechar,
}: {
  usuario: { id: string; nome: string; email: string; telefone: string | null } | null
  aoFechar: () => void
}) {
  const avisos = useAvisos()
  const { empresa } = useSessao()
  const [senha, setSenha] = useState(gerarSenha())
  const [salvando, setSalvando] = useState(false)
  const [feito, setFeito] = useState(false)
  useEffect(() => {
    if (usuario) {
      setSenha(gerarSenha())
      setFeito(false)
    }
  }, [usuario])
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (senha.length < 6) return avisos.erro('Mínimo de 6 caracteres.')
    setSalvando(true)
    const { error } = await supabase.rpc('admin_redefinir_senha', { p_usuario: usuario!.id, p_senha: senha })
    setSalvando(false)
    if (error) return avisos.erro(error)
    setFeito(true)
  }
  return (
    <Modal
      aberto={!!usuario}
      aoFechar={aoFechar}
      titulo="Redefinir senha"
      descricao={usuario?.nome}
      largura="sm"
      codigo="USUÁRIO · SENHA"
      rodape={
        feito ? <Botao onClick={aoFechar}>Concluir</Botao> : (
          <>
            <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
            <Botao type="submit" form="form-redef" carregando={salvando} icone={<KeyRound className="size-3.5" />}>Redefinir</Botao>
          </>
        )
      }
    >
      {feito && usuario ? (
        <CartaoAcesso acesso={{ nome: usuario.nome, email: usuario.email, senha, telefone: usuario.telefone, empresa: empresa?.nome }} />
      ) : (
        <form id="form-redef" onSubmit={salvar}>
          <Campo rotulo="Nova senha" htmlFor="rs" dica="Depois, envie a nova senha à pessoa.">
            <div className="flex gap-1.5">
              <Entrada id="rs" value={senha} onChange={(e) => setSenha(e.target.value)} className="font-mono" />
              <Botao variante="secundario" apenasIcone icone={<RefreshCw className="size-3.5" />} onClick={() => setSenha(gerarSenha())} aria-label="Gerar outra senha" />
            </div>
          </Campo>
        </form>
      )}
    </Modal>
  )
}
