import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { onKey } from '../input/keyboard'
import { level, zoneAt } from '../lib/level'
import { media } from '../media/media'
import { getConnection } from '../net/session'
import { cameraState, local } from '../store/local'
import { useMedia } from '../store/media'
import { usePlayers } from '../store/players'
import { useProfile } from '../store/profile'

const UPDATE_INTERVAL = 0.1

/** Drives the media manager from the game loop and wires media hotkeys (M, V, push-to-talk). */
export function MediaSync() {
  const status = usePlayers((s) => s.status)
  const acc = useRef(0)
  const started = useRef(false)

  // Connect to LiveKit once the channel is joined; announce media state on every (re)join.
  useEffect(() => {
    if (status !== 'online') return
    const conn = getConnection()
    if (!conn) return
    if (!started.current) {
      started.current = true
      void media.connect(conn)
    }
    media.announce()
  }, [status])

  useEffect(
    () => () => {
      started.current = false
      media.disconnect()
    },
    [],
  )

  useEffect(() => {
    const offs = [
      onKey('KeyM', () => void media.setMic(!useMedia.getState().micOn)),
      onKey('KeyV', () => void media.setCam(!useMedia.getState().camOn)),
      onKey('Space', () => {
        if (!useProfile.getState().pushToTalk) return
        useMedia.setState({ pttActive: true })
        void media.setMic(true)
      }),
      onKey(
        'Space',
        () => {
          if (!useProfile.getState().pushToTalk) return
          useMedia.setState({ pttActive: false })
          void media.setMic(false)
        },
        'up',
      ),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < UPDATE_INTERVAL) return
    acc.current = 0
    const { x, z } = local.position
    media.update({ x, z, zoneId: zoneAt(level, x, z)?.id ?? null, yaw: cameraState.yaw })
  })

  return null
}
