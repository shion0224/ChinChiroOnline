import { useState, useEffect } from 'react'
import { signInAnonymously } from './lib/auth'
import Lobby from './components/Lobby'
import './App.css'
import type { User } from '@supabase/supabase-js'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    initAuth()
  }, [])

  const initAuth = async () => {
    try {
      const { user } = await signInAnonymously()
      setUser(user)
    } catch (err) {
      console.error('Auth error:', err)
      setError('認証に失敗しました。ページを再読み込みしてください。')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <h2>読み込み中...</h2>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-screen">
        <h2>{error}</h2>
        <button onClick={() => window.location.reload()}>再読み込み</button>
      </div>
    )
  }

  return <Lobby user={user} />
}

export default App
