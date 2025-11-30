import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import GameRoom from './GameRoom'
import './Lobby.css'

function Lobby() {
  const [playerName, setPlayerName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [roomId, setRoomId] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [joinRoomId, setJoinRoomId] = useState('')
  const [availableRooms, setAvailableRooms] = useState([])
  const [error, setError] = useState('')

  // 利用可能なルームを取得
  useEffect(() => {
    loadAvailableRooms()

    // Realtime購読
    const channel = supabase
      .channel('rooms')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'rooms' },
        () => {
          loadAvailableRooms()
        }
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
        .select('*')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setAvailableRooms(data || [])
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

      // ルームを作成
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name: roomName,
          status: 'waiting'
        })
        .select()
        .single()

      if (roomError) throw roomError

      // プレイヤーを作成（ホスト）
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: roomData.id,
          name: playerName,
          is_host: true,
          is_ready: false
        })
        .select()
        .single()

      if (playerError) throw playerError

      // ルームのhost_idを更新
      await supabase
        .from('rooms')
        .update({ host_id: playerData.id })
        .eq('id', roomData.id)

      setRoomId(roomData.id)
      setPlayerId(playerData.id)
      setIsHost(true)
    } catch (err) {
      console.error('Error creating room:', err)
      setError(err.message || 'ルームの作成に失敗しました')
    }
  }

  const joinRoom = async (targetRoomId = null) => {
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

      // ルームが存在するか確認
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomToJoin)
        .single()

      if (roomError || !roomData) {
        throw new Error('ルームが見つかりません')
      }

      if (roomData.status !== 'waiting') {
        throw new Error('このルームは既に開始されています')
      }

      // プレイヤーを追加
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: roomToJoin,
          name: playerName,
          is_host: false,
          is_ready: false
        })
        .select()
        .single()

      if (playerError) throw playerError

      setRoomId(roomToJoin)
      setPlayerId(playerData.id)
      setIsHost(false)
    } catch (err) {
      console.error('Error joining room:', err)
      setError(err.message || 'ルームへの参加に失敗しました')
    }
  }

  if (roomId && playerId) {
    return <GameRoom roomId={roomId} playerId={playerId} isHost={isHost} playerName={playerName} />
  }

  return (
    <div className="lobby">
      <div className="lobby-container">
        <h1>🎲 チンチロオンライン</h1>
        
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
            <button onClick={createRoom}>ルームを作成</button>
          </div>

          <div className="join-room">
            <h2>ルームに参加</h2>
            <label>
              ルームID:
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="ルームIDを入力"
              />
            </label>
            <button onClick={() => joinRoom()}>参加</button>
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
                    <span className="room-id">ID: {room.id.substring(0, 8)}...</span>
                  </div>
                  <button onClick={() => joinRoom(room.id)}>参加</button>
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

