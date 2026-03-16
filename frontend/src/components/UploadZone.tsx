import { useRef, useState } from 'react'

interface Props {
  files: File[]
  existingNames: string[]
  onAddFiles: (files: File[]) => void
  onRemoveNew: (idx: number) => void
}

export default function UploadZone({ files, existingNames, onAddFiles, onRemoveNew }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const hasFiles = files.length > 0 || existingNames.length > 0

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const newFiles = Array.from(e.dataTransfer.files)
    if (newFiles.length > 0) onAddFiles(newFiles)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files || [])
    if (newFiles.length > 0) onAddFiles(newFiles)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <>
      <div
        className={`upload-zone${hasFiles ? ' has-file' : ''}${dragging ? ' drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="upload-icon">⬆</span>
        <div className="upload-text">Clique ou arraste arquivos aqui</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
      />

      {(existingNames.length > 0 || files.length > 0) && (
        <div className="file-list">
          {existingNames.map((name, idx) => (
            <div key={`existing-${idx}`} className="file-item">
              <span className="file-item-name" title={name}>{name}</span>
              <span className="file-item-badge saved">salvo</span>
            </div>
          ))}
          {files.map((f, idx) => (
            <div key={`new-${idx}`} className="file-item">
              <span className="file-item-name" title={f.name}>{f.name}</span>
              <span className="file-item-badge new">novo</span>
              <button
                type="button"
                className="file-item-remove"
                onClick={(e) => { e.stopPropagation(); onRemoveNew(idx) }}
                title="Remover"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
