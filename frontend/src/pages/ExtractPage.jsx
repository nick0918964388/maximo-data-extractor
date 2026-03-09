import React, { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Square, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'
import { listProfiles, runExtract, getExtractStatus } from '../api/index.js'

function StatusBadge({ status }) {
  const map = {
    idle: { color: 'bg-gray-100 text-gray-600', label: '待機' },
    running: { color: 'bg-blue-100 text-blue-700', label: '執行中' },
    success: { color: 'bg-green-100 text-green-700', label: '成功' },
    failed: { color: 'bg-red-100 text-red-700', label: '失敗' },
  }
  const { color, label } = map[status] || map.idle
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
}

function ProfileRunner({ profile }) {
  const [status, setStatus] = useState('idle')
  const [records, setRecords] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [historyId, setHistoryId] = useState(null)
  const intervalRef = useRef(null)

  const pollStatus = async () => {
    try {
      const s = await getExtractStatus(profile.id)
      setStatus(s.status)
      setRecords(s.records || 0)
      setElapsed(s.elapsed || 0)
      if (s.history_id) setHistoryId(s.history_id)
      if (s.status !== 'running') {
        clearInterval(intervalRef.current)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleRun = async () => {
    setStatus('running')
    setRecords(0)
    setElapsed(0)
    try {
      await runExtract(profile.id)
      intervalRef.current = setInterval(pollStatus, 1500)
    } catch (e) {
      setStatus('failed')
      alert('啟動失敗：' + (e.response?.data?.detail || e.message))
    }
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base">{profile.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{profile.object_structure}</span>
            <span className="text-xs text-gray-400">{profile.export_format?.toUpperCase()}</span>
            {profile.schedule_cron && <span className="text-xs text-amber-600 flex items-center gap-0.5"><Clock className="w-3 h-3" />{profile.schedule_cron}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          {status === 'running' ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span>{records} 筆 / {elapsed}s</span>
            </div>
          ) : (
            <button
              onClick={handleRun}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              <Play className="w-4 h-4" /> 執行
            </button>
          )}
        </div>
      </div>

      {/* Progress bar for running */}
      {status === 'running' && (
        <div className="mt-3">
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <p className="text-xs text-gray-500 mt-1">正在從 Maximo 抽取資料...</p>
        </div>
      )}

      {/* Result */}
      {status === 'success' && (
        <div className="mt-3 flex items-center gap-2 text-green-700 text-sm">
          <CheckCircle className="w-4 h-4" />
          <span>成功抽取 {records} 筆資料</span>
          {historyId && (
            <a href={`/api/extract/download/${historyId}`} target="_blank"
              className="ml-2 text-blue-600 hover:underline">下載檔案</a>
          )}
        </div>
      )}
      {status === 'failed' && (
        <div className="mt-3 flex items-center gap-2 text-red-700 text-sm">
          <XCircle className="w-4 h-4" />
          <span>執行失敗，請查看執行歷史</span>
        </div>
      )}

      {/* Profile details */}
      {profile.where_clause && (
        <p className="mt-2 text-xs text-gray-400 font-mono">WHERE: {profile.where_clause}</p>
      )}
    </div>
  )
}

export default function ExtractPage() {
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: listProfiles,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">執行抽取</h2>
        <p className="text-gray-500 text-sm mt-1">選擇設定檔並立即執行資料抽取</p>
      </div>

      {profiles.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400">
          <p className="text-lg">尚無抽取設定</p>
          <p className="text-sm mt-1">請先至「抽取設定」頁面新增設定</p>
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map(p => <ProfileRunner key={p.id} profile={p} />)}
        </div>
      )}
    </div>
  )
}
