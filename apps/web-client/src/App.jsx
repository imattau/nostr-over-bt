import React, { useState, useRef, useMemo } from 'react'
import { Container, Row, Col, Card, Nav, Navbar, Badge, Button, Form, InputGroup } from 'react-bootstrap'
import { Activity, Radio, Search, Users, Zap, ShieldCheck, Paperclip, X, FileText, Share2 } from 'lucide-react'
import { useNostrBT } from './hooks/useNostrBT'

function App() {
  const { status, messages, peers, speed, identity, publish, swarmEvents, loadMore, isLoadingMore } = useNostrBT()
  const [inputText, setInputText] = useState('')
  const [attachedFiles, setAttachedFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [view, setView] = useState('global') // 'global' or 'bt-only'
  const fileInputRef = useRef(null)

  // Filter messages based on view
  const filteredMessages = useMemo(() => {
    if (view === 'bt-only') {
      return messages.filter(m => m.hasBT)
    }
    return messages
  }, [messages, view])

  const handlePost = (e) => {
    e.preventDefault()
    if (!inputText.trim() && attachedFiles.length === 0) return

    if (inputText.startsWith('/')) {
      const [cmd, ...args] = inputText.split(' ')
      const val = args.join(' ')
      
      if (cmd === '/follow') {
        // We need to expose bootstrapWoTP2P from the hook
        publish(inputText, [], 'command') 
      } else if (cmd === '/search') {
        publish(inputText, [], 'command')
      }
      setInputText('')
      return
    }

    publish(inputText, attachedFiles)
    setInputText('')
    setAttachedFiles([])
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    setAttachedFiles(prev => [...prev, ...files])
  }

  const removeFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div 
      className={`vh-100 d-flex flex-column bg-black text-light ${isDragging ? 'opacity-50' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); setAttachedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
    >
      {isDragging && (
        <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center z-3 pointer-events-none">
          <div className="p-5 border border-primary border-3 border-dashed rounded bg-dark bg-opacity-75">
            <Zap size={64} className="text-primary mb-3 animate-pulse" />
            <h2 className="text-white">Drop to seed via P2P</h2>
          </div>
        </div>
      )}

      <Navbar bg="dark" variant="dark" className="border-bottom border-secondary py-3">
        <Container fluid>
          <Navbar.Brand className="d-flex align-items-center gap-2">
            <Zap size={28} className="text-warning" fill="currentColor" />
            <span className="fw-bold tracking-tight">NOSTR-OVER-BT</span>
            <Badge bg={status === 'online' ? 'success' : 'warning'} className="ms-2 small">
              {status.toUpperCase()}
            </Badge>
          </Navbar.Brand>
          
          <Nav className="ms-auto gap-4 align-items-center">
            <div className="d-flex align-items-center gap-2 text-success fw-bold">
              <Users size={20} />
              <span>{peers} Peers</span>
            </div>
            <div className="d-flex align-items-center gap-2 text-info fw-bold">
              <Activity size={20} />
              <span>{speed}</span>
            </div>
          </Nav>
        </Container>
      </Navbar>

      <Container fluid className="flex-grow-1 overflow-hidden">
        <Row className="h-100">
          {/* Left: Identity & Nav */}
          <Col md={3} lg={2} className="py-4 border-end border-secondary d-none d-md-block">
            {identity && (
              <div className="mb-4 p-3 bg-dark rounded border border-secondary shadow-sm">
                <div className="small text-secondary mb-1">Your Identity</div>
                <div className="fw-bold text-truncate text-warning mb-2 small">{identity.pubkey.substring(0, 16)}...</div>
                <div className="small text-secondary mb-1">P2P Address</div>
                <div className="small text-truncate text-success font-monospace" style={{fontSize: '0.7rem'}}>{identity.p2p}</div>
              </div>
            )}
            
            <Nav className="flex-column gap-2">
              <Button 
                variant={view === 'global' ? 'primary' : 'outline-light'} 
                className="text-start d-flex align-items-center gap-2 border-0"
                onClick={() => setView('global')}
              >
                <Radio size={18} /> Global Feed
              </Button>
              <Button 
                variant={view === 'bt-only' ? 'warning' : 'outline-light'} 
                className={`text-start d-flex align-items-center gap-2 border-0 ${view === 'bt-only' ? 'text-dark' : ''}`}
                onClick={() => setView('bt-only')}
              >
                <Share2 size={18} /> Nostr-BT Feed
              </Button>
              <hr className="border-secondary my-2" />
              <Button variant="outline-light" className="text-start border-0 d-flex align-items-center gap-2 opacity-50">
                <Search size={18} /> Search
              </Button>
              <Button variant="outline-light" className="text-start border-0 d-flex align-items-center gap-2 opacity-50">
                <ShieldCheck size={18} /> Web of Trust
              </Button>
            </Nav>
          </Col>

          {/* Center: Scrollable Feed */}
          <Col md={6} lg={7} className="py-4 h-100 overflow-auto scrollbar-hide pb-5">
            <div className="d-flex flex-column gap-3">
              {filteredMessages.length === 0 ? (
                <div className="text-center py-5 text-secondary">
                  <Activity size={48} className="mb-3 opacity-25" />
                  <p>No events found for this view.</p>
                </div>
              ) : (
                filteredMessages.map((m, idx) => (
                  <Card key={`${m.id}-${idx}`} className="bg-dark border-secondary shadow-sm overflow-hidden">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="fw-bold text-warning font-monospace">{m.author}</span>
                        <div className="d-flex gap-2">
                          {m.hasBT && <Badge bg="warning" text="dark" className="small">P2P-ENABLED</Badge>}
                          <Badge bg={m.source === 'Hybrid' ? 'primary' : 'secondary'} className="small opacity-75">
                            {m.source}
                          </Badge>
                        </div>
                      </div>
                      <Card.Text className="fs-5">{m.content}</Card.Text>
                      
                      {m.files && m.files.length > 0 && (
                        <div className="d-flex flex-wrap gap-2 mt-3">
                          {m.files.map((file, fidx) => (
                            <div key={fidx} className="p-2 bg-black border border-secondary rounded d-flex align-items-center gap-2 small font-monospace">
                              <FileText size={14} className="text-primary" />
                              <span>{file}</span>
                              <Badge bg="success" className="ms-1">SEEDING</Badge>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="small text-secondary mt-3 font-monospace">
                        {new Date(m.ts * 1000).toLocaleTimeString()}
                      </div>
                    </Card.Body>
                  </Card>
                ))
              )}

              {view === 'global' && (
                <div className="d-grid mt-4 mb-5">
                  <Button 
                    variant="outline-secondary" 
                    onClick={loadMore} 
                    disabled={isLoadingMore}
                    className="py-3 border-dashed border-2"
                  >
                    {isLoadingMore ? 'FETCHING HISTORY...' : 'LOAD OLDER POSTS'}
                  </Button>
                </div>
              )}
            </div>
          </Col>

          {/* Right: Swarm Activity */}
          <Col md={3} lg={3} className="py-4 d-none d-md-block">
            <h6 className="text-secondary text-uppercase mb-3 fw-bold small">Swarm Activity</h6>
            <div className="bg-dark rounded border border-secondary p-0 font-monospace small text-secondary shadow-sm overflow-hidden" style={{maxHeight: '400px'}}>
              <div className="p-3 border-bottom border-secondary bg-black bg-opacity-25">
                <div className="text-success mb-1">● DHT Online</div>
                <div className="text-info">● {peers > 0 ? 'Active Swarm' : 'Listening...'}</div>
              </div>
              <div className="p-3 overflow-auto" style={{maxHeight: '300px'}}>
                {swarmEvents.length === 0 ? (
                  <div className="opacity-50 italic">Waiting for traffic...</div>
                ) : (
                  swarmEvents.map((e, i) => (
                    <div key={i} className={`mb-2 ${e.type === 'error' ? 'text-danger' : e.type === 'success' ? 'text-success' : ''}`}>
                      <span className="opacity-50">[{e.time}]</span> {e.msg}
                    </div>
                  ))
                )}
              </div>
            </div>
          </Col>
        </Row>
      </Container>

      {/* Fixed Footer Input */}
      <div className="bg-dark border-top border-secondary p-4 mt-auto shadow-lg">
        <Container>
          {attachedFiles.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mb-3">
              {attachedFiles.map((file, idx) => (
                <Badge key={idx} bg="secondary" className="p-2 d-flex align-items-center gap-2 fw-normal border border-light border-opacity-25">
                  <span className="text-truncate" style={{maxWidth: '150px'}}>{file.name}</span>
                  <X size={14} className="cursor-pointer" onClick={() => removeFile(idx)} />
                </Badge>
              ))}
            </div>
          )}

          <Form onSubmit={handlePost}>
            <InputGroup size="lg" className="shadow-lg">
              <Button 
                variant="dark" 
                className="border-secondary border-end-0 px-3"
                onClick={() => fileInputRef.current.click()}
              >
                <Paperclip size={20} className="text-secondary" />
              </Button>
              <Form.Control
                className={`bg-black border-secondary border-start-0 border-end-0 ${inputText.startsWith('/') ? 'text-info fw-bold' : 'text-white'}`}
                placeholder="Type a message or drag & drop files to seed..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setInputText('');
                    setAttachedFiles([]);
                  }
                }}
              />
              <Button variant="primary" type="submit" className="px-5 fw-bold">
                SEND
              </Button>
            </InputGroup>
            <input type="file" multiple ref={fileInputRef} className="d-none" onChange={handleFileChange} />
          </Form>
        </Container>
      </div>
    </div>
  )
}

export default App
