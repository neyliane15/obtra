import { clsx } from 'clsx'

/**
 * Marca do Obtra.
 * O "O" é um anel de progresso a 3/4 — a obra em andamento — e o bloco
 * âmbar é a peça sendo assentada no quadrante que falta: construir é
 * completar o círculo. Funciona em 16 px (favicon) e em tamanho de capa.
 */
export function Simbolo({
  tamanho = 32,
  className,
  variante = 'solido',
}: {
  tamanho?: number
  className?: string
  variante?: 'solido' | 'contorno' | 'claro'
}) {
  const fundo = variante === 'solido' ? '#0B1F3A' : variante === 'claro' ? '#FFFFFF' : 'none'
  const anel = variante === 'claro' ? '#0B1F3A' : variante === 'contorno' ? '#0B1F3A' : '#FFFFFF'
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Obtra"
    >
      {variante !== 'contorno' && <rect width="64" height="64" rx="15" fill={fundo} />}
      {variante === 'solido' && (
        <rect x="0.5" y="0.5" width="63" height="63" rx="14.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.08" />
      )}
      <path d="M46 34 A15 15 0 1 1 31 19" fill="none" stroke={anel} strokeWidth="7.5" />
      <rect x="38" y="11" width="13" height="13" rx="2.5" fill="#F29A2E" />
    </svg>
  )
}

export function Logo({
  tamanho = 28,
  className,
  claro = false,
  comLegenda = false,
}: {
  tamanho?: number
  className?: string
  claro?: boolean
  comLegenda?: boolean
}) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <Simbolo tamanho={tamanho} variante={claro ? 'claro' : 'solido'} />
      <span className="flex flex-col leading-none">
        <span
          className={clsx('font-display font-extrabold tracking-[-0.04em]', claro ? 'text-white' : 'text-marinho-900')}
          style={{ fontSize: tamanho * 0.78 }}
        >
          obtra
        </span>
        {comLegenda && (
          <span
            className={clsx('mt-1 font-mono uppercase tracking-[0.22em]', claro ? 'text-marinho-300' : 'text-tinta-fraca')}
            style={{ fontSize: Math.max(8, tamanho * 0.24) }}
          >
            diário de obra
          </span>
        )}
      </span>
    </span>
  )
}
