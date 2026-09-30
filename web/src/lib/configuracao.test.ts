import { describe, expect, it } from 'vitest'
import { normalizarChave, normalizarUrlSupabase } from './configuracao'

describe('normalizarUrlSupabase', () => {
  it.each([
    ['https://abc.supabase.co', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/rest/v1/', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/rest/v1', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/auth/v1/', 'https://abc.supabase.co'],
    [' "https://abc.supabase.co" ', 'https://abc.supabase.co'],
    ['abc.supabase.co', 'https://abc.supabase.co'],
    ['http://127.0.0.1:54321', 'http://127.0.0.1:54321'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarUrlSupabase(entrada)).toBe(esperado)
  })
  it('vazio vira undefined', () => {
    expect(normalizarUrlSupabase('  ')).toBeUndefined()
    expect(normalizarUrlSupabase(undefined)).toBeUndefined()
  })
})

describe('normalizarChave', () => {
  it('tira aspas, espaços e quebras de linha', () => {
    expect(normalizarChave(' "eyJabc.def\n.ghi" ')).toBe('eyJabc.def.ghi')
    expect(normalizarChave('')).toBeUndefined()
  })
})
