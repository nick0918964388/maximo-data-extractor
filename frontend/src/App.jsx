import React, { useState, createContext, useContext } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Database, Settings, Play, History, Server, Eye, Building2, Plus, Loader2 } from 'lucide-react'
import ConnectionPage from './pages/ConnectionPage.jsx'
import ProfilesPage from './pages/ProfilesPage.jsx'
import ExtractPage from './pages/ExtractPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import PreviewPage from './pages/PreviewPage.jsx'
import { listTenants, createTenant } from './api/index.js'

// Tenant Context
const TenantContext = createContext()

export function useTenant() {
  return useContext(TenantContext)
}

function TenantSelector() {
  const qc = useQueryClient()
  const { tenantId, setTenantId } = useTenant()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
  })

  const createMutation = useMutation({
    mutationFn: createTenant,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setTenantId(data.id)
      setNewName('')
      setShowCreate(false)
    },
  })

  const handleCreate = (e) => {
    e.preventDefault()
    if (newName.trim()) {
      createMutation.mutate({ name: newName.trim() })
    }
  }

  if (isLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-white/70" />
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-white/70" />
      <select
        value={tenantId || ''}
        onChange={(e) => setTenantId(e.target.value ? parseInt(e.target.value) : null)}
        className="bg-blue-600 text-white border border-white/30 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
      >
        <option value="">全部租戶</option>
        {tenants.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      
      {showCreate ? (
        <form onSubmit={handleCreate} className="flex items-center gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="租戶名稱"
            className="bg-white/10 border border-white/30 rounded px-2 py-1 text-sm text-white placeholder-white/50 w-24 focus:outline-none focus:ring-2 focus:ring-white/50"
            autoFocus
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs"
          >
            {createMutation.isPending ? '...' : '建立'}
          </button>
          <button
            type="button"
            onClick={() => { setShowCreate(false); setNewName('') }}
            className="px-2 py-1 hover:bg-white/20 rounded text-xs"
          >
            取消
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="p-1 hover:bg-white/20 rounded"
          title="新增租戶"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

const tabs = [
  { id: 'connection', label: '連線設定', icon: Server },
  { id: 'profiles', label: '抽取設定', icon: Settings },
  { id: 'extract', label: '執行抽取', icon: Play },
  { id: 'history', label: '執行歷史', icon: History },
  { id: 'preview', label: '資料預覽', icon: Eye },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('connection')
  const [tenantId, setTenantId] = useState(null)

  return (
    <TenantContext.Provider value={{ tenantId, setTenantId }}>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-blue-700 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-6 h-6" />
              <h1 className="text-xl font-bold tracking-wide">Maximo Data Extractor</h1>
            </div>
            <TenantSelector />
          </div>
        </header>

        {/* Nav Tabs */}
        <nav className="bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 flex gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
          {activeTab === 'connection' && <ConnectionPage />}
          {activeTab === 'profiles' && <ProfilesPage />}
          {activeTab === 'extract' && <ExtractPage />}
          {activeTab === 'history' && <HistoryPage />}
          {activeTab === 'preview' && <PreviewPage />}
        </main>
      </div>
    </TenantContext.Provider>
  )
}
