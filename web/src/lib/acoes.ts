import { supabase } from './supabase'
import { removerPasta } from './armazenamento'

/** Exclui a obra (cascata no banco) e depois todos os arquivos dela no Storage. */
export async function excluirObraCompleta(obra: { id: string; empresa_id: string }) {
  const { error } = await supabase.from('obras').delete().eq('id', obra.id)
  if (error) throw error
  await removerPasta(`${obra.empresa_id}/${obra.id}`)
}
