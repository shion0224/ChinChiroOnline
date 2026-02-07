import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { createRoom as createRoomApi, joinRoom as joinRoomApi } from '../lib/gameApi'
import GameRoom from './GameRoom'
import type { User } from '@supabase/supabase-js'
import type { RoomWithPlayerCount } from '../types/database'
import './Lobby.css'

interface LobbyProps {
  user: User | null
}

function Lobby({ user }: LobbyProps) {
  const [playerName, setPlayerName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [joinRoomId, setJoinRoomId] = useState('')
  const [availableRooms, setAvailableRooms] = useState<RoomWithPlayerCount[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadAvailableRooms()

    const channel = supabase
      .channel('rooms')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        () => loadAvailableRooms()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadAvailableRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*, players:players(count)')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setAvailableRooms((data as RoomWithPlayerCount[]) || [])
    } catch (err) {
      console.error('Error loading rooms:', err)
    }
  }

  const createRoom = async () => {
    if (!playerName.trim()) {
      setError('プレイヤー名を入力してください')
      return
    }
    if (!roomName.trim()) {
      setError('ルーム名を入力してください')
      return
    }

    try {
      setError('')
      setLoading(true)

      const result = await createRoomApi(playerName.trim(), roomName.trim(), 4)

      setRoomId(result.roomId)
      setPlayerId(result.playerId)
      setIsHost(true)
    } catch (err) {
      console.error('Error creating room:', err)
      setError((err as Error).message || 'ルームの作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = async (targetRoomId: string | null = null) => {
    if (!playerName.trim()) {
      setError('プレイヤー名を入力してください')
      return
    }

    const roomToJoin = targetRoomId || joinRoomId
    if (!roomToJoin) {
      setError('ルームIDを入力してください')
      return
    }

    try {
      setError('')
      setLoading(true)

      const result = await joinRoomApi(playerName.trim(), roomToJoin)

      setRoomId(result.roomId)
      setPlayerId(result.playerId)
      setIsHost(false)
    } catch (err) {
      console.error('Error joining room:', err)
      setError((err as Error).message || 'ルームへの参加に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (roomId && playerId) {
    return (
      <GameRoom
        roomId={roomId}
        playerId={playerId}
        isHost={isHost}
        playerName={playerName}
        user={user}
      />
    )
  }

  return (
    <div className="lobby">
      <div className="lobby-container">
        <h1>チンチロオンライン</h1>

        <div className="player-name-section">
          <label>
            プレイヤー名:
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="あなたの名前"
              maxLength={20}
            />
          </label>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="room-actions">
          <div className="create-room">
            <h2>ルームを作成</h2>
            <label>
              ルーム名:
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="ルーム名"
                maxLength={30}
              />
            </label>
            <button onClick={createRoom} disabled={loading}>
              {loading ? '作成中...' : 'ルームを作成'}
            </button>
          </div>

          <div className="join-room">
            <h2>ルームに参加</h2>
            <label>
              ルームコード:
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                placeholder="6文字のコードを入力"
                maxLength={6}
                style={{ textTransform: 'uppercase' }}
              />
            </label>
            <button onClick={() => joinRoom()} disabled={loading}>
              {loading ? '参加中...' : '参加'}
            </button>
          </div>
        </div>

        <div className="available-rooms">
          <h2>利用可能なルーム</h2>
          {availableRooms.length === 0 ? (
            <p>利用可能なルームはありません</p>
          ) : (
            <div className="room-list">
              {availableRooms.map((room) => (
                <div key={room.id} className="room-item">
                  <div className="room-info">
                    <span className="room-name">{room.name}</span>
                    <span className="room-id">
                      ID: {room.room_code ?? room.id.substring(0, 8)}
                    </span>
                    <span className="room-player-count">
                      {room.players?.[0]?.count ?? 0}/{room.max_players}人
                    </span>
                  </div>
                  <button onClick={() => joinRoom(room.id)} disabled={loading}>
                    参加
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Lobby
