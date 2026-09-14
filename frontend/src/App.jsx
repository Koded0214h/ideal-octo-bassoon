import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, ChevronDown, Download, FileText, Paperclip, X } from 'lucide-react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

const MAX_IMAGES = 4
const MAX_DOCS = 4
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_DOC_BYTES = 15 * 1024 * 1024

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const DOC_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const DOC_EXTENSIONS = ['.pdf', '.txt', '.md', '.csv', '.json', '.docx']
const ACCEPT_ATTR = [...IMAGE_TYPES, ...DOC_TYPES, ...DOC_EXTENSIONS].join(',')

function classifyFile(file) {
  if (IMAGE_TYPES.includes(file.type)) return 'image'
  if (DOC_TYPES.includes(file.type)) return 'document'
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (DOC_EXTENSIONS.includes(ext)) return 'document'
  return null
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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

function UserBubble({ message }) {
  return (
    <div className="bubble user">
      {message.attachments?.length > 0 && (
        <div className="attachment-strip">
          {message.attachments.map((att, i) =>
            att.kind === 'image' ? (
              <img key={i} src={att.previewUrl} alt="" className="attachment-thumb" />
            ) : (
              <div key={i} className="doc-chip">
                <FileText size={14} strokeWidth={2} />
                <span>{att.file.name}</span>
              </div>
            )
          )}
        </div>
      )}
      {message.text}
    </div>
  )
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
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([])
  const [attachments, setAttachments] = useState([])
  const [attachError, setAttachError] = useState('')

  const textareaRef = useRef(null)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    fetch(`${API_URL}/api/models`)
      .then((res) => res.json())
      .then((data) => {
        setModels(data.models || [])
        setModel(data.default || data.models?.[0]?.id || '')
      })
      .catch(() => {})
  }, [])

  function addFiles(fileList) {
    const incoming = Array.from(fileList || [])
    if (incoming.length === 0) return

    setAttachError('')
    const accepted = []
    for (const file of incoming) {
      const kind = classifyFile(file)
      if (!kind) {
        setAttachError(`${file.name}: unsupported file type.`)
        continue
      }
      const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES
      if (file.size > limit) {
        setAttachError(`${file.name} is over the ${formatFileSize(limit)} limit.`)
        continue
      }
      accepted.push({
        file,
        kind,
        previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
      })
    }

    setAttachments((prev) => {
      let combined = [...prev, ...accepted]
      const imageCount = combined.filter((a) => a.kind === 'image').length
      const docCount = combined.filter((a) => a.kind === 'document').length

      if (imageCount > MAX_IMAGES) {
        setAttachError(`You can attach up to ${MAX_IMAGES} images.`)
        let seen = 0
        combined = combined.filter((a) => {
          if (a.kind !== 'image') return true
          seen += 1
          if (seen > MAX_IMAGES) {
            if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
            return false
          }
          return true
        })
      }
      if (docCount > MAX_DOCS) {
        setAttachError(`You can attach up to ${MAX_DOCS} documents.`)
        let seen = 0
        combined = combined.filter((a) => {
          if (a.kind !== 'document') return true
          seen += 1
          return seen <= MAX_DOCS
        })
      }
      return combined
    })
  }

  function removeAttachment(index) {
    setAttachments((prev) => {
      const next = [...prev]
      const [removed] = next.splice(index, 1)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return next
    })
  }

  function handleFileInputChange(e) {
    addFiles(e.target.files)
    e.target.value = ''
  }

  function handlePaste(e) {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length > 0) addFiles(files)
  }

  function handleDrop(e) {
    e.preventDefault()
    addFiles(e.dataTransfer?.files)
  }

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
    const pendingAttachments = attachments

    setMessages((m) => [
      ...m,
      { id: userId, role: 'user', kind: 'text', text: trimmed, attachments: pendingAttachments },
      { id: assistantId, role: 'assistant', kind: 'loading' },
    ])
    setPrompt('')
    setAttachments([])
    setAttachError('')
    setLoading(true)
    requestAnimationFrame(autoResize)

    const startedAt = Date.now()

    try {
      const formData = new FormData()
      formData.append('prompt', trimmed)
      formData.append('size', size)
      formData.append('model', model)
      pendingAttachments.forEach((att) =>
        formData.append(att.kind === 'image' ? 'images' : 'documents', att.file)
      )

      const res = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        body: formData,
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
    <form
      className="composer"
      onSubmit={handleSubmit}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="attachment-preview-row">
          {attachments.map((att, i) => (
            <div key={i} className={att.kind === 'image' ? 'attachment-preview' : 'attachment-preview doc'}>
              {att.kind === 'image' ? (
                <img src={att.previewUrl} alt="" />
              ) : (
                <div className="doc-chip">
                  <FileText size={14} strokeWidth={2} />
                  <span>{att.file.name}</span>
                </div>
              )}
              <button
                type="button"
                className="attachment-remove"
                onClick={() => removeAttachment(i)}
                aria-label="Remove attachment"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}
      {attachError && <div className="attach-error">{attachError}</div>}
      <div className="composer-row">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          hidden
          onChange={handleFileInputChange}
        />
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach files"
          title="Attach images or documents"
        >
          <Paperclip size={17} strokeWidth={2.25} />
        </button>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value)
            autoResize()
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            attachments.length > 0
              ? 'Describe how to use these files...'
              : 'Describe an image to generate...'
          }
          rows={1}
        />
        {models.length > 0 && (
          <div className="size-select">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="Image model"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="size-select-icon" aria-hidden="true" />
          </div>
        )}
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
                      <UserBubble message={message} />
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
