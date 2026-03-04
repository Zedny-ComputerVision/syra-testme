import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', padding: '2rem', textAlign: 'center'
    }}>
      <div style={{ fontSize: '4rem', fontWeight: 700, color: 'var(--color-muted)', lineHeight: 1 }}>404</div>
      <p style={{ color: 'var(--color-muted)', margin: '0.75rem 0 1.5rem', fontSize: '0.95rem' }}>
        The page you're looking for doesn't exist.
      </p>
      <button
        onClick={() => navigate('/')}
        style={{
          padding: '0.65rem 1.5rem', border: 'none', borderRadius: '8px',
          background: 'var(--color-primary)', color: '#0b111d',
          fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
        }}
      >
        Go Home
      </button>
    </div>
  )
}
