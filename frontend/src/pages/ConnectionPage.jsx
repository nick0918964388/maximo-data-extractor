import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { CheckCircle, XCircle, Loader2, Trash2, Plus } from 'lucide-react'
import { getConnection, listConnections, saveConnection, updateConnection, deleteConnection, testConnection } from '../api/index.js'
import { useTenant } from '../App.jsx'

export default function ConnectionPage() {
  const qc = useQueryClient()
  const { tenantId } = useTenant()
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [selectedConnId, setSelectedConnId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['connections', tenantId],
    queryFn: () => listConnections(tenantId),
  })

  const selectedConn = connections.find(c => c.id === selectedConnId)

  const { register, handleSubmit, getValues, reset, formState: { errors } } = useForm({
    values: selectedConn 
      ? { name: selectedConn.name, base_url: selectedConn.base_url, api_key: selectedConn.api_key } 
      : { name: '', base_url: '', api_key: '' },
  })

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, tenant_id: tenantId }
      return selectedConnId 
        ? updateConnection(selectedConnId, payload) 
        : saveConnection(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] })
      setShowForm(false)
      setSelectedConnId(null)
      reset()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] })
      setSelectedConnId(null)
      setShowForm(false)
    },
  })

  const onTest = async () => {
    setTesting(true)
    setTestResult(null)
    const values = getValues()
    const result = await testConnection(values)
    setTestResult(result)
    setTesting(false)
  }

  const handleEdit = (conn) => {
    setSelectedConnId(conn.id)
    setShowForm(true)
    setTestResult(null)
  }

  const handleNew = () => {
    setSelectedConnId(null)
    reset({ name: '', base_url: '', api_key: '' })
    setShowForm(true)
    setTestResult(null)
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Maximo 連線設定</h2>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增連線
        </button>
      </div>

      {/* Connection List */}
      {connections.length > 0 && !showForm && (
        <div className="bg-white rounded-xl shadow overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">名稱</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Base URL</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {connections.map(conn => (
                <tr key={conn.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{conn.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{conn.base_url}</td>
                  <td className="px-4 py-3 text-center">
                    {conn.is_active ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">啟用中</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">未啟用</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleEdit(conn)}
                        className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => confirm('確定刪除此連線？') && deleteMutation.mutate(conn.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {connections.length === 0 && !showForm && (
        <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400 mb-6">
          <p className="text-lg mb-4">尚未設定任何連線</p>
          <button
            onClick={handleNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            新增第一個連線
          </button>
        </div>
      )}

      {/* Connection Form */}
      {showForm && (
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="bg-white rounded-xl shadow p-6 space-y-5">
          <h3 className="text-lg font-semibold">
            {selectedConnId ? '編輯連線' : '新增連線'}
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">連線名稱</label>
            <input
              {...register('name')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Default"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Maximo Base URL <span className="text-red-500">*</span></label>
            <input
              {...register('base_url', { required: 'Base URL 必填' })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://maximo.example.com"
            />
            {errors.base_url && <p className="text-red-500 text-sm mt-1">{errors.base_url.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key <span className="text-red-500">*</span></label>
            <input
              {...register('api_key', { required: 'API Key 必填' })}
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="apikey..."
            />
            {errors.api_key && <p className="text-red-500 text-sm mt-1">{errors.api_key.message}</p>}
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.success
                ? <CheckCircle className="w-5 h-5 flex-shrink-0" />
                : <XCircle className="w-5 h-5 flex-shrink-0" />}
              <span className="text-sm">
                {testResult.success ? '連線成功！' : `連線失敗：${testResult.error}`}
              </span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setSelectedConnId(null); setTestResult(null) }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              測試連線
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              儲存設定
            </button>
          </div>

          {saveMutation.isSuccess && (
            <p className="text-green-600 text-sm flex items-center gap-1">
              <CheckCircle className="w-4 h-4" /> 設定已儲存
            </p>
          )}
        </form>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-800 mb-2">認證說明</h3>
        <p className="text-sm text-blue-700">
          本工具使用 <code className="bg-blue-100 px-1 rounded">apikey</code> Header 認證方式連接 IBM Maximo OSLC API。
          請確保 API Key 具有存取所需 Object Structure 的權限。
        </p>
      </div>
    </div>
  )
}
