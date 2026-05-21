'use client'
import { useEffect, useState } from 'react'

export default function DashboardClock() {
  const [time, setTime] = useState('--:-- --')

  useEffect(() => {
    function tick() {
      setTime(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata',
        })
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="text-gray-500 text-sm font-mono tabular-nums">{time}</span>
  )
}
