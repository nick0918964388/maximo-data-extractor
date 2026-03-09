import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Edit2, Trash2, Loader2, ChevronDown, ChevronUp, X, Save, CheckCircle, XCircle } from 'lucide-react'
import {
  listProfiles, createProfile, updateProfile, deleteProfile,
  getObjectStructures, getFields, getTransferConfig, saveTransferConfig, testTransferConfig,
  listConnections
} from '../api/index.js'
import { useTenant } from '../App.jsx'

const COMMON_OS = ['MXWO', 'MXASSET', 'MXINVENTORY', 'MXPERSON', 'MXSR', 'MXPO', 'MXPR', 'MXITEM', 'MXLOCATION']

function ProfileForm({ profile, onClose, onSaved, tenantId }) {
  const qc = useQueryClient()
  const isEdit = !!profile

  // 取得該租戶下的連線
  const { data: connections = [] } = useQuery({
    queryKey: ['connections', tenantId],
    queryFn: () => listConnections(tenantId),
  })

  const { register, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm({
    defaultValues: isEdit ? {
      name: profile.name,
      object_structure: profile.object_structure,
      fields: (profile.fields || []).join(', '),
      where_clause: profile.where_clause || '',
      order_by: profile.order_by || '',
      page_size: profile.page_size || 500,
      export_format: profile.export_format || 'csv',
      schedule_cron: profile.schedule_cron || '',
      connection_id: profile.connection_id || '',
    } : {
      name: '',
      object_structure: 'MXWO',
      fields: '',
      where_clause: '',
      order_by: '',
      page_size: 500,
      export_format: 'csv',
      schedule_cron: '',
      connection_id: connections.length > 0 ? connections[0].id : '',
    }
  })

  const selectedOS = watch('object_structure')
  const [fetchingFields, setFetchingFields] = useState(false)
  const [availableFields, setAvailableFields] = useState([])
  const [selectedFields, setSelectedFields] = useState(
    isEdit ? (profile.fields || []) : []
  )

  const fetchFields = async () => {
    setFetchingFields(true)
    try {
      const fields = await getFields(selectedOS, tenantId)
      setAvailableFields(fields)
    } catch (e) {
      alert('無法取得欄位：' + e.message)
    }
    setFetchingFields(false)
  }

  const toggleField = (fieldName) => {
    setSelectedFields(prev =>
      prev.includes(fieldName)
        ? prev.filter(f => f !== fieldName)
        : [...prev, fieldName]
    )
  }

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        fields: selectedFields.length > 0 ? selectedFields : (data.fields ? data.fields.split(',').map(s => s.trim()).filter(Boolean) : []),
        page_size: parseInt(data.page_size),
        connection_id: data.connection_id ? parseInt(data.connection_id) : null,
      }
      return isEdit ? updateProfile(profile.id, payload) : createProfile(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      onSaved()
    }
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-bold">{isEdit ? '編輯抽取設定' : '新增抽取設定'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">設定名稱 <span className="text-red-500">*</span></label>
              <input {...register('name', { required: true })}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例：工單每日抽取" />
            </div>

            {/* 連線選擇 */}
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">使用連線</label>
              <select {...register('connection_id')}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- 請選擇連線 --</option>
                {connections.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.base_url})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Object Structure <span className="text-red-500">*</span></label>
              <select {...register('object_structure', { required: true })}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {COMMON_OS.map(os => <option key={os} value={os}>{os}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">匯出格式</label>
              <select {...register('export_format')}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>
          </div>

          {/* Fields selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium">抽取欄位</label>
              <button type="button" onClick={fetchFields} disabled={fetchingFields}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                {fetchingFields && <Loader2 className="w-3 h-3 animate-spin" />}
                從 Maximo 載入欄位
              </button>
            </div>

            {availableFields.length > 0 ? (
              <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-2 gap-1">
                  {availableFields.map(f => (
                    <label key={f.name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                      <input type="checkbox" checked={selectedFields.includes(f.name)} onChange={() => toggleField(f.name)} />
                      <span className="font-mono">{f.name}</span>
                      <span className="text-gray-400 text-xs">({f.type})</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <input {...register('fields')}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="欄位名稱用逗號分隔，留空表示取全部欄位" />
                {selectedFields.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedFields.map(f => (
                      <span key={f} className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                        {f}
                        <button type="button" onClick={() => toggleField(f)}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">篩選條件 (oslc.where)</label>
            <input {...register('where_clause')}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder='例：status="APPR" and siteid="BEDFORD"' />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">排序 (oslc.orderBy)</label>
              <input {...register('order_by')}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="例：-changedate" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">每頁筆數</label>
              <input {...register('page_size')} type="number"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1" max="1000" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">排程 (Cron Expression)</label>
            <input {...register('schedule_cron')}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="留空表示僅手動執行，例：0 2 * * * (每天凌晨2點)" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              取消
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              儲存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TransferModal({ profile, onClose }) {
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  const { data: config } = useQuery({
    queryKey: ['transfer', profile.id],
    queryFn: () => getTransferConfig(profile.id),
  })

  const defaultValues = {
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    write_mode: 'APPEND',
    upsert_key: '',
    enabled: false,
  }

  const { register, handleSubmit, getValues, watch } = useForm({
    values: config || defaultValues,
  })

  const writeMode = watch('write_mode')

  const mutation = useMutation({
    mutationFn: (data) => saveTransferConfig(profile.id, { ...data, port: parseInt(data.port) }),
    onSuccess: onClose,
  })

  const onTest = async () => {
    setTesting(true)
    setTestResult(null)
    const values = getValues()
    const result = await testTransferConfig(profile.id, { ...values, port: parseInt(values.port) })
    setTestResult(result)
    setTesting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-bold">PostgreSQL 推送設定 - {profile.name}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-5 space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...register('enabled')} />
            <span className="text-sm font-medium">抽取後自動寫入 PostgreSQL</span>
          </label>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">主機 (Host)</label>
              <input {...register('host')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="localhost" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Port</label>
              <input {...register('port')} type="number" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="5432" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">資料庫名稱 (Database)</label>
            <input {...register('database')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="database_name" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">帳號 (User)</label>
              <input {...register('username')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">密碼 (Password)</label>
              <input {...register('password')} type="password" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">寫入模式</label>
            <select {...register('write_mode')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="APPEND">APPEND — 新增（保留原有資料）</option>
              <option value="REPLACE">REPLACE — 取代（清空後寫入）</option>
              <option value="UPSERT">UPSERT — 依主鍵更新或新增</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">資料表名稱：maximo_{profile.object_structure?.toLowerCase()}</p>
          </div>

          {writeMode === 'UPSERT' && (
            <div>
              <label className="block text-sm font-medium mb-1">UPSERT 主鍵欄位</label>
              <input {...register('upsert_key')} className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例：wonum" />
              <p className="text-xs text-gray-400 mt-1">衝突時依此欄位判斷是否更新</p>
            </div>
          )}

          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.status === 'success'
                ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                : <XCircle className="w-4 h-4 flex-shrink-0" />}
              {testResult.status === 'success' ? 'PostgreSQL 連線成功！' : `連線失敗：${testResult.error}`}
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t">
            <button type="button" onClick={onTest} disabled={testing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm transition-colors">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              測試連線
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">取消</button>
              <button type="submit" disabled={mutation.isPending}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
                {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                儲存
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProfilesPage() {
  const qc = useQueryClient()
  const { tenantId } = useTenant()
  const [showForm, setShowForm] = useState(false)
  const [editProfile, setEditProfile] = useState(null)
  const [transferProfile, setTransferProfile] = useState(null)

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['profiles', tenantId],
    queryFn: () => listProfiles({ tenant_id: tenantId }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] })
  })

  const handleEdit = (p) => { setEditProfile(p); setShowForm(true) }
  const handleClose = () => { setShowForm(false); setEditProfile(null) }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">抽取設定</h2>
        <button onClick={() => { setEditProfile(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> 新增設定
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400">
          <p className="text-lg">尚無抽取設定</p>
          <p className="text-sm mt-1">點擊右上角新增設定</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map(p => (
            <div key={p.id} className="bg-white rounded-xl shadow p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg">{p.name}</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-mono">{p.object_structure}</span>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{p.export_format.toUpperCase()}</span>
                    {p.schedule_cron && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">排程: {p.schedule_cron}</span>}
                    {p.where_clause && <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-mono truncate max-w-xs">WHERE: {p.where_clause}</span>}
                  </div>
                  {p.fields && p.fields.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">欄位: {p.fields.join(', ')}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setTransferProfile(p)}
                    className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="推送設定">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </button>
                  <button onClick={() => handleEdit(p)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => confirm('確定刪除此設定？') && deleteMutation.mutate(p.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <ProfileForm profile={editProfile} onClose={handleClose} onSaved={handleClose} tenantId={tenantId} />}
      {transferProfile && <TransferModal profile={transferProfile} onClose={() => setTransferProfile(null)} />}
    </div>
  )
}
