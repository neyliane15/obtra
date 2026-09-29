/** Senha legível para ditar/enviar: sem caracteres ambíguos (0/O, 1/l/I). */
export function gerarSenha(tamanho = 10, aleatorio: (n: number) => number = aleatorioSeguro): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz'
  const maiusc = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digitos = '23456789'
  const todos = letras + maiusc + digitos
  const t = Math.max(6, tamanho)
  const saida: string[] = [
    maiusc[aleatorio(maiusc.length)]!,
    digitos[aleatorio(digitos.length)]!,
  ]
  while (saida.length < t) saida.push(todos[aleatorio(todos.length)]!)
  // embaralha
  for (let i = saida.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1)
    ;[saida[i], saida[j]] = [saida[j]!, saida[i]!]
  }
  return saida.join('')
}

function aleatorioSeguro(n: number): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0]! % n
}

/** Texto do "acesso único" para enviar ao cliente/usuário. */
export function textoDeAcesso(p: { nome: string; email: string; senha: string; url: string; empresa?: string | null }): string {
  const primeiro = p.nome.trim().split(/\s+/)[0] ?? p.nome
  return [
    `Olá, ${primeiro}!`,
    p.empresa ? `A ${p.empresa} liberou seu acesso ao Obtra para acompanhar a obra.` : 'Seu acesso ao Obtra foi liberado.',
    '',
    `Endereço: ${p.url}`,
    `E-mail: ${p.email}`,
    `Senha: ${p.senha}`,
    '',
    'Recomendamos trocar a senha no primeiro acesso.',
  ].join('\n')
}
