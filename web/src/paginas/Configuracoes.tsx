import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ImagePlus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import type { Empresa } from '@/tipos/banco'
import { paraNumero } from '@/tipos/banco'
import { useEmpresa } from '@/lib/consultas'
import { useSessao } from '@/lib/sessao'
import { supabase, exigir } from '@/lib/supabase'
import { enviarLogo, removerArquivos } from '@/lib/armazenamento'
import { formatarBytes, percentualUso } from '@/lib/formato'
import { UFS } from '@/lib/rotulos'
import { Botao, CabecalhoPagina, Campo, CampoTexto, Cartao, CarregandoPagina, Progresso, Selecao } from '@/componentes/ui'
import { ImagemAssinada } from '@/componentes/midia'
import { useAvisos } from '@/componentes/avisos'
import { PrecisaEmpresa } from '@/componentes/PrecisaEmpresa'

const esquema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.'),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido.')]),
  uf: z.string(),
})

export default function Configuracoes() {
  const { empresaId } = useSessao()
  const empresa = useEmpresa(empresaId)
  if (!empresaId) return (<><CabecalhoPagina sobretitulo="Gestão" titulo="Empresa" /><PrecisaEmpresa oque="os dados da empresa" /></>)
  if (empresa.isLoading || !empresa.data) return <CarregandoPagina />
  return <FormEmpresa key={empresa.data.id} empresa={empresa.data} />
}

function FormEmpresa({ empresa }: { empresa: Empresa }) {
  const { recarregar } = useSessao()
  const avisos = useAvisos()
  const qc = useQueryClient()
  const [f, setF] = useState({
    nome: empresa.nome, cnpj: empresa.cnpj ?? '', email: empresa.email ?? '', telefone: empresa.telefone ?? '',
    endereco: empresa.endereco ?? '', cidade: empresa.cidade ?? '', uf: empresa.uf ?? '',
  })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const mudar = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  useEffect(() => setErros({}), [f])

  const uso = useQuery({
    queryKey: ['uso-detalhe', empresa.id],
    queryFn: async () => {
      const [fo, dc] = await Promise.all([
        supabase.from('fotos').select('bytes').eq('empresa_id', empresa.id),
        supabase.from('documentos').select('bytes').eq('empresa_id', empresa.id),
      ])
      const s = (l: { bytes: number | string }[]) => l.reduce((a, x) => a + Number(x.bytes || 0), 0)
      const fotos = exigir(fo) as { bytes: number }[]
      const docs = exigir(dc) as { bytes: number }[]
      return { fotos: s(fotos), nFotos: fotos.length, docs: s(docs), nDocs: docs.length }
    },
  })

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const r = esquema.safeParse(f)
    if (!r.success) {
      const n: Record<string, string> = {}
      for (const i of r.error.issues) n[String(i.path[0])] = i.message
      return setErros(n)
    }
    setSalvando(true)
    const n = (s: string) => s.trim() || null
    const { error } = await supabase.from('empresas').update({
      nome: f.nome.trim(), cnpj: n(f.cnpj), email: n(f.email), telefone: n(f.telefone), endereco: n(f.endereco), cidade: n(f.cidade), uf: n(f.uf),
    }).eq('id', empresa.id)
    setSalvando(false)
    if (error) return avisos.erro(error)
    avisos.sucesso('Dados da empresa salvos.')
    void qc.invalidateQueries({ queryKey: ['empresa', empresa.id] })
    void recarregar()
  }

  async function trocarLogo(arquivo: File) {
    setEnviandoLogo(true)
    try {
      const caminho = await enviarLogo(arquivo, empresa.id)
      const { error } = await supabase.from('empresas').update({ logo_path: caminho }).eq('id', empresa.id)
      if (error) {
        await removerArquivos([caminho])
        throw error
      }
      if (empresa.logo_path) await removerArquivos([empresa.logo_path])
      avisos.sucesso('Logo atualizada. Ela aparece no cabeçalho dos PDFs.')
      void qc.invalidateQueries({ queryKey: ['empresa', empresa.id] })
      void recarregar()
    } catch (e) {
      avisos.erro(e)
    } finally {
      setEnviandoLogo(false)
    }
  }
  async function tirarLogo() {
    const { error } = await supabase.from('empresas').update({ logo_path: null }).eq('id', empresa.id)
    if (error) return avisos.erro(error)
    await removerArquivos([empresa.logo_path])
    void qc.invalidateQueries({ queryKey: ['empresa', empresa.id] })
    void recarregar()
  }

  const usado = paraNumero(empresa.armazenamento_usado_bytes)
  const limite = empresa.limite_armazenamento_mb * 1048576
  const pct = percentualUso(usado, limite)

  return (
    <>
      <CabecalhoPagina sobretitulo="Gestão" titulo="Empresa" subtitulo="Dados que aparecem nos relatórios em PDF e no portal do cliente." />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Cartao titulo="Dados cadastrais" codigo="EMP-01" marcas>
          <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-6" noValidate>
            <CampoTexto rotulo="Razão social / nome" obrigatorio value={f.nome} onChange={(e) => mudar('nome', e.target.value)} erro={erros.nome} className="sm:col-span-4" />
            <CampoTexto rotulo="CNPJ" value={f.cnpj} onChange={(e) => mudar('cnpj', e.target.value)} className="sm:col-span-2" placeholder="00.000.000/0000-00" />
            <CampoTexto rotulo="E-mail" type="email" value={f.email} onChange={(e) => mudar('email', e.target.value)} erro={erros.email} className="sm:col-span-3" />
            <CampoTexto rotulo="Telefone" type="tel" value={f.telefone} onChange={(e) => mudar('telefone', e.target.value)} className="sm:col-span-3" />
            <CampoTexto rotulo="Endereço" value={f.endereco} onChange={(e) => mudar('endereco', e.target.value)} className="sm:col-span-6" />
            <CampoTexto rotulo="Cidade" value={f.cidade} onChange={(e) => mudar('cidade', e.target.value)} className="sm:col-span-4" />
            <Campo rotulo="UF" className="sm:col-span-2" htmlFor="emp-uf">
              <Selecao id="emp-uf" value={f.uf} onChange={(e) => mudar('uf', e.target.value)}>
                <option value="">—</option>
                {UFS.map((u) => <option key={u}>{u}</option>)}
              </Selecao>
            </Campo>
            <div className="flex justify-end sm:col-span-6">
              <Botao type="submit" carregando={salvando}>Salvar dados</Botao>
            </div>
          </form>
        </Cartao>

        <div className="flex flex-col gap-5">
          <Cartao titulo="Logomarca" codigo="EMP-02">
            <div className="flex items-center gap-4">
              <div className="milimetrado flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-linha">
                {empresa.logo_path ? (
                  <ImagemAssinada caminho={empresa.logo_path} alt="Logo da empresa" className="size-full bg-white" classeImg="!object-contain p-2" />
                ) : (
                  <Building2 className="size-8 text-marinho-300" strokeWidth={1.3} />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => { const a = e.target.files?.[0]; if (a) void trocarLogo(a); e.target.value = '' }} />
                <Botao variante="secundario" tamanho="p" icone={<ImagePlus className="size-3.5" />} carregando={enviandoLogo} onClick={() => entrada.current?.click()}>
                  {empresa.logo_path ? 'Trocar logo' : 'Enviar logo'}
                </Botao>
                {empresa.logo_path && <Botao variante="fantasma" tamanho="p" icone={<Trash2 className="size-3.5" />} onClick={() => void tirarLogo()}>Remover</Botao>}
                <p className="text-[11px] text-tinta-fraca">Reduzida para 512 px (WebP). Fundo branco fica melhor no PDF.</p>
              </div>
            </div>
          </Cartao>

          <Cartao titulo="Armazenamento" codigo="EMP-03">
            <div className="flex items-baseline justify-between">
              <p className="num font-display text-[26px] font-extrabold text-marinho-900">{formatarBytes(usado)}</p>
              <p className="num text-[12px] text-tinta-fraca">de {formatarBytes(limite, 0)}</p>
            </div>
            <Progresso valor={pct} tom={pct > 90 ? 'perigo' : pct > 70 ? 'ambar' : 'marinho'} className="mt-2" altura={8} rotuloAcessivel="Uso do armazenamento" />
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-dashed border-linha-forte pt-3 text-[12px]">
              <div>
                <dt className="rotulo">Fotos</dt>
                <dd className="num mt-0.5 font-semibold">{uso.data ? `${uso.data.nFotos} · ${formatarBytes(uso.data.fotos)}` : '—'}</dd>
              </div>
              <div>
                <dt className="rotulo">Documentos</dt>
                <dd className="num mt-0.5 font-semibold">{uso.data ? `${uso.data.nDocs} · ${formatarBytes(uso.data.docs)}` : '—'}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-tinta-fraca">Fotos são comprimidas no aparelho e os PDFs de relatório são gerados na hora — não ocupam espaço. Para ampliar o limite, fale com o suporte do Obtra.</p>
          </Cartao>
        </div>
      </div>
    </>
  )
}
