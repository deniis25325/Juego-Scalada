import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validamos si las credenciales son las correctas y no los marcadores de posición
export const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-supabase-project.supabase.co' && 
  supabaseAnonKey !== 'your-supabase-anon-key-here' &&
  !supabaseUrl.includes('your-supabase-project')

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null

if (!isSupabaseConfigured) {
  console.warn(
    'Scalada: Supabase no está configurado o contiene los valores por defecto en el archivo .env. Las funciones en línea estarán desactivadas (Modo Invitado Local).'
  )
}
