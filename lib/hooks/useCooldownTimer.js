'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useCooldownTimer() {
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const intervalRef = useRef(null)

  const clearCooldownInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const start = useCallback((seconds) => {
    clearCooldownInterval()
    setSecondsRemaining(seconds)
    intervalRef.current = setInterval(() => {
      setSecondsRemaining((previous) => {
        if (previous <= 1) {
          clearCooldownInterval()
          return 0
        }
        return previous - 1
      })
    }, 1000)
  }, [clearCooldownInterval])

  useEffect(() => clearCooldownInterval, [clearCooldownInterval])

  return {
    secondsRemaining,
    isActive: secondsRemaining > 0,
    start,
  }
}
