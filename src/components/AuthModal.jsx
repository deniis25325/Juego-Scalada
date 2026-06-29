import { useState } from 'react'
import useGameStore from '../store/useGameStore'
import audioSystem from '../utils/audioSystem'

export default function AuthModal() {
  const isOpen = useGameStore(s => s.authModalOpen)
  const setOpen = useGameStore(s => s.setAuthModalOpen)
  const login = useGameStore(s => s.login)
  const register = useGameStore(s => s.register)
  const loading = useGameStore(s => s.authLoading)

  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    audioSystem.playSFX('ui')

    if (!email || !password || (mode === 'register' && !username)) {
      setErrorMsg('Por favor completa todos los campos')
      return
    }

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        const result = await register(email, username, password)
        if (result?.emailConfirmationRequired) {
          setSuccessMsg('Registro exitoso. Revisa tu correo para verificar tu cuenta (o confirma que la validación está inactiva en Supabase).')
        } else {
          setSuccessMsg('¡Usuario registrado e inicio de sesión correcto!')
        }
      }
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message || 'Ocurrió un error inesperado al procesar la solicitud')
    }
  }

  const handleClose = () => {
    audioSystem.playSFX('ui')
    setOpen(false)
    setErrorMsg('')
    setSuccessMsg('')
    setEmail('')
    setUsername('')
    setPassword('')
  }

  const toggleMode = () => {
    audioSystem.playSFX('ui')
    setMode(mode === 'login' ? 'register' : 'login')
    setErrorMsg('')
    setSuccessMsg('')
  }

  return (
    <div className="auth-overlay" onClick={handleClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={handleClose}>×</button>
        
        <h2 className="auth-title">
          {mode === 'login' ? 'INICIAR SESIÓN' : 'REGISTRARSE'}
        </h2>
        
        <p className="auth-subtitle">
          {mode === 'login' 
            ? 'Ingresa para guardar tus récords de altitud en la nube' 
            : 'Crea tu cuenta para competir en el leaderboard global'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input 
              type="email" 
              className="form-input" 
              placeholder="ejemplo@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Nombre de Usuario</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="EscaladorGalactico"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {errorMsg && <p className="auth-error">{errorMsg}</p>}
          {successMsg && <p className="auth-success">{successMsg}</p>}

          <button 
            type="submit" 
            className="btn-play auth-submit-btn" 
            disabled={loading}
          >
            {loading ? 'CARGANDO...' : mode === 'login' ? 'ENTRAR' : 'REGISTRARSE'}
          </button>
        </form>

        <p className="auth-switch-text">
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button className="auth-switch-btn" onClick={toggleMode}>
            {mode === 'login' ? 'Regístrate aquí' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  )
}
