import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, ChevronDown, Download } from 'lucide-react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

const SIZES = {
  square: { label: 'Square', dims: '1024×1024' },
  landscape: { label: 'Landscape', dims: '1536×1024' },
  portrait: { label: 'Portrait', dims: '1024×1536' },
}

const EXAMPLES = [
  'A greenhouse abandoned mid-harvest, vines through the glass roof',
  'A corgi astronaut planting a flag on a slice of cheese',
  'Neon jellyfish drifting through a rainy city street at night',
]

function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'image'
  )
}

let nextId = 1
function makeId() {
  return nextId++
}

function TypingDots() {
  return (
    <div className="typing">
      {[0, 0.15, 0.3].map((delay) => (
        <motion.span
          key={delay}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay }}
        />
      ))}
    </div>
  )
}

function AssistantBubble({ message, onDownload }) {
  if (message.kind === 'loading') {
    return (
      <div className="bubble assistant">
        <TypingDots />
      </div>
    )
  }

  if (message.kind === 'error') {
    return (
      <div className="bubble assistant error">
        <p>Couldn&rsquo;t generate that.</p>
        <p className="error-detail">{message.text}</p>
      </div>
    )
  }

  return (
    <div className="bubble assistant image-bubble">
      <motion.img
        src={message.src}
        alt={message.prompt}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
      <div className="image-meta">
        <span>{SIZES[message.size].dims}</span>
        <span className="meta-sep">&middot;</span>
        <span>{message.seconds}s</span>
        <button
          type="button"
          className="download-btn"
          onClick={() => onDownload(message)}
          aria-label="Download image"
          title="Download image"
        >
          <Download size={14} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}

function App() {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('square')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([])

  const textareaRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed || loading) return

    const userId = makeId()
    const assistantId = makeId()

    setMessages((m) => [
      ...m,
      { id: userId, role: 'user', kind: 'text', text: trimmed },
      { id: assistantId, role: 'assistant', kind: 'loading' },
    ])
    setPrompt('')
    setLoading(true)
    requestAnimationFrame(autoResize)

    const startedAt = Date.now()

    try {
      const res = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed, size }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Request failed (${res.status})`)
      }

      const data = await res.json()
      const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))

      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                kind: 'image',
                src: `data:image/png;base64,${data.image_base64}`,
                prompt: trimmed,
                size,
                seconds,
              }
            : msg
        )
      )
    } catch (err) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, kind: 'error', text: err.message || 'Something went wrong.' }
            : msg
        )
      )
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  function handleDownload(message) {
    const a = document.createElement('a')
    a.href = message.src
    a.download = `${slugify(message.prompt)}-${message.id}.png`
    a.click()
  }

  const isIdle = messages.length === 0

  const composerForm = (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer-row">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value)
            autoResize()
          }}
          onKeyDown={handleKeyDown}
          placeholder="Describe an image to generate..."
          rows={1}
        />
        <div className="size-select">
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            aria-label="Image size"
          >
            {Object.entries(SIZES).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="size-select-icon" aria-hidden="true" />
        </div>
        <button type="submit" className="send-btn" disabled={loading || !prompt.trim()} aria-label="Send">
          <ArrowUp size={18} strokeWidth={2.5} />
        </button>
      </div>
    </form>
  )

  return (
    <div className="chat-app">
      <header className="chat-header">
        <span className="chat-brand">Latent</span>
        <span className="chat-sub">AI image generator</span>
      </header>

      {isIdle ? (
        <div className="idle-center">
          <div className="empty-state">
            <h1>What should we make?</h1>
            <p>Describe an image and Latent will generate it for you.</p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex} onClick={() => setPrompt(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
          {composerForm}
        </div>
      ) : (
        <>
          <div className="chat-scroll">
            <div className="chat-list">
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    className={`row ${message.role}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {message.role === 'user' ? (
                      <div className="bubble user">{message.text}</div>
                    ) : (
                      <AssistantBubble message={message} onDownload={handleDownload} />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              <div ref={bottomRef} />
            </div>
          </div>

          {composerForm}
        </>
      )}
    </div>
  )
}

export default App
