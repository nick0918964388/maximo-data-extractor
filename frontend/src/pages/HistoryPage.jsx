import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Download, Trash2, RefreshCw, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react'
import { listHistory, deleteHistory, clearHistory, downloadFile } from '../api/index.js'
import { useTenant } from '../App.jsx'

function StatusIcon({ status }) {
  if (status === 'success') return <CheckCircle className="w-4 h-4 text-green-500" />
  if (status === 'failed') return <XCircle className="w-4 h-4 text-red-500" />
  if (status === 'running') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
  return <Clock className="w-4 h-4 text-gray-400" />
}

function TransferBadge({ status }) {
  if (status === 'success') return <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">已推送</span>
  if (status === 'failed') return <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">推送失敗</span>
  if (status === 'none') return null
  return null
}

export default function HistoryPage() {
  const qc = useQueryClient()
  const { tenantId } = useTenant()
  const [expandedId, setExpandedId] = useState(null)

  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['history', tenantId],
    queryFn: () => listHistory(100, tenantId),
    refetchInterval: 5000,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteHistory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] })
  })

  const clearMutation = useMutation({
    mutationFn: clearHistory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] })
  })

  const formatDate = (s) => {
    if (!s) return '-'
    return new Date(s).toLocaleString('zh-TW', { hour12: false })
  }

  const formatSize = (kb) => {
    if (!kb) return '-'
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(1)} KB`
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">執行歷史</h2>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> 重新整理
          </button>
          {history.length > 0 && (
            <button onClick={() => confirm('確定清除所有歷史？') && clearMutation.mutate()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50">
              <Trash2 className="w-4 h-4" /> 清除全部
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400">
          <p className="text-lg">尚無執行記錄</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">狀態</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">設定名稱</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">開始時間</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">筆數</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">大小</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">耗時</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">推送</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map(h => (
                <React.Fragment key={h.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={h.status} />
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          h.status === 'success' ? 'bg-green-100 text-green-700' :
                          h.status === 'failed' ? 'bg-red-100 text-red-700' :
                          h.status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>{h.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{h.profile_name}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(h.started_at)}</td>
                    <td className="px-4 py-3 text-right">{h.records_count?.toLocaleString() || '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatSize(h.file_size)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{h.duration_seconds ? `${h.duration_seconds}s` : '-'}</td>
                    <td className="px-4 py-3 text-center"><TransferBadge status={h.transfer_status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {h.file_path && h.status === 'success' && (
                          <a href={downloadFile(h.id)} target="_blank" onClick={e => e.stopPropagation()}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        <button onClick={e => { e.stopPropagation(); deleteMutation.mutate(h.id) }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === h.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-4 py-3">
                        {h.error_message ? (
                          <div className="flex items-start gap-2 text-red-700">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <pre className="text-xs whitespace-pre-wrap font-mono">{h.error_message}</pre>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 space-y-1">
                            {h.file_path && <p>檔案路徑: <span className="font-mono">{h.file_path}</span></p>}
                            {h.completed_at && <p>完成時間: {formatDate(h.completed_at)}</p>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
