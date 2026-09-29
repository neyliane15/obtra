import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, MailCheck } from 'lucide-react'
import { z } from 'zod'
import { Logo } from '@/componentes/Logo'
import { Botao, Campo, Entrada } from '@/componentes/ui'
import { CampoSenha, validarNovaSenha } from '@/componentes/TrocarSenha'
import { supabase, mensagemDeErro } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { rotaInicial } from '@/lib/permissoes'

/* Desenho técnico do painel de entrada: fachada em linhas de prancha. */
function ArteBlueprint() {
  return (
    <svg viewBox="0 0 520 360" className="w-full max-w-[520px]" fill="none" aria-hidden>
      <g stroke="#9DB6E8" strokeOpacity="0.55" strokeWidth="1">
        {/* solo */}
        <path d="M10 300h500" />
        <path d="M10 306h500" strokeDasharray="2 6" strokeOpacity="0.35" />
        {/* torre */}
        <rect x="70" y="70" width="150" height="230" />
        {Array.from({ length: 8 }).map((_, i) => (
          <g key={i}>
            <path d={`M70 ${98 + i * 26}h150`} strokeOpacity="0.25" />
            <rect x="84" y={78 + i * 26} width="22" height="14" strokeOpacity="0.6" />
            <rect x="134" y={78 + i * 26} width="22" height="14" strokeOpacity="0.6" />
            <rect x="184" y={78 + i * 26} width="22" height="14" strokeOpacity="0.6" />
          </g>
        ))}
        {/* bloco em construção */}
        <path d="M240 300V150h170v150" />
        <path d="M240 190h170M240 230h170M240 270h170" strokeOpacity="0.3" />
        <path d="M268 150v150M325 150v150M382 150v150" strokeOpacity="0.3" />
        <path d="M240 150l40-40h130v40" strokeDasharray="4 4" strokeOpacity="0.5" />
        {/* grua */}
        <path d="M455 300V40" />
        <path d="M449 300V40" strokeOpacity="0.5" />
        <path d="M300 40h210" />
        <path d="M300 46h210" strokeOpacity="0.4" />
        {Array.from({ length: 14 }).map((_, i) => (
          <path key={i} d={`M${300 + i * 15} 40l7.5 6l7.5-6`} strokeOpacity="0.4" />
        ))}
        <path d="M452 40l-20-26h40z" />
        <path d="M340 46v70" strokeDasharray="3 3" />
        {/* cotas */}
        <path d="M70 330h150M70 325v10M220 325v10" />
        <path d="M40 70v230M35 70h10M35 300h10" />
      </g>
      <rect x="333" y="116" width="14" height="14" rx="2" fill="#F29A2E" />
      <g fill="#9DB6E8" fillOpacity="0.8" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="1.5">
        <text x="120" y="346">15,00 m</text>
        <text x="16" y="190" transform="rotate(-90 16 190)">28,40 m</text>
        <text x="248" y="174">PAV. 04 · EM EXECUÇÃO</text>
      </g>
      <circle cx="340" cy="123" r="16" stroke="#F29A2E" strokeOpacity="0.6" strokeDasharray="2 3" />
    </svg>
  )
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="blueprint relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-6 border border-marinho-300/15" />
        <div className="pointer-events-none absolute inset-6 [--cor-cantoneira:#F29A2E] cantoneiras" />
        <div className="relative flex items-center justify-between">
          <Logo claro tamanho={40} comLegenda />
          <span className="font-mono text-[10px] tracking-[0.3em] text-marinho-300/60">FOLHA 01/01</span>
        </div>
        <div className="relative my-10 flex justify-center">
          <ArteBlueprint />
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-[26px] leading-tight font-extrabold text-white">
            O canteiro inteiro, <span className="text-ambar-400">registrado dia a dia.</span>
          </h2>
          <p className="mt-3 text-[13px] text-marinho-200/80">
            Relatórios diários, fotos e documentos da obra num só lugar — e um acesso único para o seu cliente acompanhar tudo.
          </p>
          <div className="mt-6 grid grid-cols-3 border-t border-dashed border-marinho-300/25 pt-4 font-mono text-[10px] tracking-wider text-marinho-300/70 uppercase">
            <span>RDO digital</span>
            <span>Fotos leves</span>
            <span>PDF na hora</span>
          </div>
        </div>
      </aside>
      <div className="milimetrado relative flex flex-col">
        <div className="blueprint flex items-center justify-between px-5 py-5 lg:hidden">
          <Logo claro tamanho={30} comLegenda />
          <span className="font-mono text-[9px] tracking-[0.3em] text-marinho-300/60">RDO</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
          <div className="cantoneiras anim-subir w-full max-w-[380px] rounded-xl border border-linha bg-white p-7 shadow-cartao sm:p-8">
            {children}
          </div>
        </div>
        <p className="pb-6 text-center font-mono text-[10px] tracking-widest text-tinta-fraca uppercase">© {new Date().getFullYear()} Obtra · diário de obra</p>
      </div>
    </div>
  )
}

const esquemaEntrada = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
})

export function Entrar() {
  const { sessao, perfil, carregando } = useSessao()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erros, setErros] = useState<Partial<Record<'email' | 'senha' | 'geral', string>>>({})
  const [enviando, setEnviando] = useState(false)

  if (!carregando && sessao && perfil) return <Navigate to={rotaInicial(perfil.papel)} replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    const r = esquemaEntrada.safeParse({ email, senha })
    if (!r.success) {
      const f = r.error.flatten().fieldErrors
      setErros({ email: f.email?.[0], senha: f.senha?.[0] })
      return
    }
    setErros({})
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: r.data.email, password: r.data.senha })
    setEnviando(false)
    if (error) setErros({ geral: mensagemDeErro(error) })
  }

  return (
    <Moldura>
      <p className="rotulo text-marinho-500">Acesso</p>
      <h1 className="mt-1 font-display text-[22px] font-extrabold text-marinho-900">Entrar no Obtra</h1>
      <p className="mt-1 text-[12.5px] text-tinta-suave">Construtoras, equipes de campo e clientes usam o mesmo acesso.</p>
      <div className="cota my-5" aria-hidden />
      <form onSubmit={entrar} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="E-mail" htmlFor="email" erro={erros.email}>
          <Entrada id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} invalido={!!erros.email} placeholder="voce@empresa.com.br" autoFocus />
        </Campo>
        <Campo rotulo="Senha" htmlFor="senha" erro={erros.senha}>
          <CampoSenha id="senha" valor={senha} aoMudar={setSenha} autoComplete="current-password" invalido={!!erros.senha} placeholder="••••••••" />
        </Campo>
        {erros.geral && (
          <p className="rounded-md border border-perigo-600/25 bg-perigo-50 px-3 py-2 text-[12px] text-perigo-600" role="alert">
            {erros.geral}
          </p>
        )}
        <Botao type="submit" tamanho="g" carregando={enviando} className="mt-1 w-full">
          Entrar <ArrowRight className="size-4" />
        </Botao>
        <Link to="/esqueci-senha" className="self-center text-[12px] font-medium text-marinho-600 hover:text-marinho-900 hover:underline">
          Esqueci minha senha
        </Link>
      </form>
    </Moldura>
  )
}

export function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const r = z.string().trim().email().safeParse(email)
    if (!r.success) return setErro('Informe um e-mail válido.')
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(r.data, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setEnviando(false)
    if (error) return setErro(mensagemDeErro(error))
    setEnviado(true)
  }

  return (
    <Moldura>
      <Link to="/entrar" className="mb-4 inline-flex items-center gap-1 text-[12px] text-tinta-suave hover:text-marinho-900">
        <ArrowLeft className="size-3.5" /> Voltar
      </Link>
      {enviado ? (
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-marinho-50 text-marinho-700 ring-1 ring-marinho-200">
            <MailCheck className="size-5" />
          </span>
          <h1 className="mt-4 font-display text-[19px] font-extrabold text-marinho-900">Confira seu e-mail</h1>
          <p className="mt-2 text-[12.5px] text-tinta-suave">
            Se <strong>{email}</strong> estiver cadastrado, você receberá um link para criar uma nova senha.
          </p>
        </div>
      ) : (
        <>
          <p className="rotulo text-marinho-500">Recuperação</p>
          <h1 className="mt-1 font-display text-[20px] font-extrabold text-marinho-900">Esqueceu a senha?</h1>
          <p className="mt-1 text-[12.5px] text-tinta-suave">Enviaremos um link para você definir uma nova.</p>
          <div className="cota my-5" aria-hidden />
          <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
            <Campo rotulo="E-mail" htmlFor="email-rec" erro={erro}>
              <Entrada id="email-rec" type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalido={!!erro} autoFocus autoComplete="email" />
            </Campo>
            <Botao type="submit" tamanho="g" carregando={enviando} className="w-full">
              Enviar link
            </Botao>
          </form>
        </>
      )}
    </Moldura>
  )
}

export function RedefinirSenha() {
  const { sessao, perfil, concluirRecuperacao } = useSessao()
  const navegar = useNavigate()
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const v = validarNovaSenha(senha, conf)
    if (v) return setErro(v)
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) return setErro(mensagemDeErro(error))
    concluirRecuperacao()
    navegar(rotaInicial(perfil?.papel), { replace: true })
  }

  return (
    <Moldura>
      <p className="rotulo text-marinho-500">Nova senha</p>
      <h1 className="mt-1 font-display text-[20px] font-extrabold text-marinho-900">Defina sua nova senha</h1>
      {!sessao ? (
        <p className="mt-3 text-[12.5px] text-tinta-suave">
          Este link expirou ou já foi usado. <Link to="/esqueci-senha" className="font-semibold text-marinho-600 underline">Peça outro</Link>.
        </p>
      ) : (
        <>
          <div className="cota my-5" aria-hidden />
          <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
            <Campo rotulo="Nova senha" htmlFor="n1">
              <CampoSenha id="n1" valor={senha} aoMudar={setSenha} invalido={!!erro} />
            </Campo>
            <Campo rotulo="Confirmar" htmlFor="n2" erro={erro}>
              <CampoSenha id="n2" valor={conf} aoMudar={setConf} invalido={!!erro} />
            </Campo>
            <Botao type="submit" tamanho="g" carregando={salvando} className="w-full">
              Salvar e entrar
            </Botao>
          </form>
        </>
      )}
    </Moldura>
  )
}
