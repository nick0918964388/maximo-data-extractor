import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Edit2, Trash2, Loader2, ChevronDown, ChevronUp, X, Save, CheckCircle, XCircle, CloudUpload, Search } from 'lucide-react'
import {
  listProfiles, createProfile, updateProfile, deleteProfile,
  getObjectStructures, getFields, getChildFields, getTransferConfig, saveTransferConfig,
  listConnections,
} from '../api/index.js'
import { useTenant } from '../App.jsx'

function ProfileForm({ profile, onClose, onSaved, tenantId }) {
  const qc = useQueryClient()
  const isEdit = !!profile

  // 取得該租戶下的連線
  const { data: connections = [] } = useQuery({
    queryKey: ['connections', tenantId],
    queryFn: () => listConnections(tenantId),
  })

  // 動態取得 Object Structure 列表
  const { data: objectStructures = [], isLoading: osLoading } = useQuery({
    queryKey: ['objectStructures', tenantId],
    queryFn: () => getObjectStructures(tenantId),
  })
  const [osFilter, setOsFilter] = useState('')
  const [osOpen, setOsOpen] = useState(false)

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
  const [fieldFilter, setFieldFilter] = useState('')
  const [fieldLang, setFieldLang] = useState('ZH_TW')
  const [selectedFields, setSelectedFields] = useState(
    isEdit ? (profile.fields || []) : []
  )
  const [selectedChildFields, setSelectedChildFields] = useState(
    isEdit ? (profile.child_fields || {}) : {}
  )
  const [expandedChildren, setExpandedChildren] = useState({})
  const [childFieldsData, setChildFieldsData] = useState({})
  const [loadingChild, setLoadingChild] = useState({})

  const fetchFields = async (refresh = false) => {
    setFetchingFields(true)
    try {
      const fields = await getFields(selectedOS, tenantId, refresh, fieldLang)
      setAvailableFields(fields)
    } catch (e) {
      alert('無法取得欄位：' + e.message)
    }
    setFetchingFields(false)
  }

  const [childFieldsError, setChildFieldsError] = useState({})

  const fetchChildFields = async (childName) => {
    setLoadingChild(prev => ({ ...prev, [childName]: true }))
    setChildFieldsError(prev => ({ ...prev, [childName]: null }))
    try {
      const connId = getValues('connection_id')
      const fields = await getChildFields(selectedOS, childName, tenantId, false, fieldLang, connId || null)
      setChildFieldsData(prev => ({ ...prev, [childName]: fields }))
    } catch (e) {
      console.error('Failed to load child fields:', e)
      const msg = e.response?.data?.detail || e.message || '未知錯誤'
      setChildFieldsError(prev => ({ ...prev, [childName]: msg }))
    }
    setLoadingChild(prev => ({ ...prev, [childName]: false }))
  }

  const toggleExpandChild = (childName) => {
    setExpandedChildren(prev => {
      const next = { ...prev, [childName]: !prev[childName] }
      // Load child fields on first expand
      if (next[childName] && !childFieldsData[childName]) {
        fetchChildFields(childName)
      }
      return next
    })
  }

  const toggleChildField = (childName, fieldName) => {
    setSelectedChildFields(prev => {
      const current = prev[childName] || []
      const next = current.includes(fieldName)
        ? current.filter(f => f !== fieldName)
        : [...current, fieldName]
      if (next.length === 0) {
        const { [childName]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [childName]: next }
    })
  }

  const selectAllChildFields = (childName) => {
    const fields = childFieldsData[childName] || []
    setSelectedChildFields(prev => ({
      ...prev,
      [childName]: fields.map(f => f.name)
    }))
  }

  const deselectAllChildFields = (childName) => {
    setSelectedChildFields(prev => {
      const { [childName]: _, ...rest } = prev
      return rest
    })
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
        child_fields: Object.keys(selectedChildFields).length > 0 ? selectedChildFields : null,
        page_size: parseInt(data.page_size),
        connection_id: data.connection_id ? parseInt(data.connection_id) : null,
      }
      return isEdit ? updateProfile(profile.id, payload) : createProfile(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      onSaved()
    },
    onError: (err) => {
      alert('儲存失敗：' + (err.response?.data?.detail || err.message))
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
              {osLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> 載入中...
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOsOpen(!osOpen)}
                    className="w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <span className={selectedOS ? 'font-mono font-medium' : 'text-gray-400'}>
                      {selectedOS || '請選擇物件結構'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${osOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {osOpen && (
                    <div className="absolute z-10 w-full mt-1 border rounded-lg bg-white shadow-lg">
                      <div className="flex items-center border-b px-3 py-2">
                        <Search className="w-4 h-4 text-gray-400 mr-2" />
                        <input
                          type="text"
                          value={osFilter}
                          onChange={(e) => setOsFilter(e.target.value.toUpperCase())}
                          placeholder="搜尋物件結構..."
                          className="w-full focus:outline-none text-sm"
                          autoFocus
                        />
                        {osFilter && (
                          <button type="button" onClick={() => setOsFilter('')} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {objectStructures
                          .filter(os => !osFilter || os.toUpperCase().includes(osFilter))
                          .map(os => (
                            <button
                              key={os}
                              type="button"
                              onClick={() => { setValue('object_structure', os, { shouldValidate: true }); setOsFilter(''); setOsOpen(false); setAvailableFields([]); setSelectedFields([]); setSelectedChildFields({}); setExpandedChildren({}); setChildFieldsData({}) }}
                              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 transition-colors ${
                                selectedOS === os ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700'
                              }`}
                            >
                              {os}
                            </button>
                          ))
                        }
                        {objectStructures.filter(os => !osFilter || os.toUpperCase().includes(osFilter)).length === 0 && (
                          <div className="px-3 py-2 text-sm text-gray-400">找不到符合的物件結構</div>
                        )}
                      </div>
                    </div>
                  )}
                  <input type="hidden" {...register('object_structure', { required: true })} />
                </div>
              )}
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
              <div className="flex items-center gap-2">
                <select value={fieldLang} onChange={e => setFieldLang(e.target.value)}
                  className="text-xs border rounded px-1.5 py-0.5 text-gray-600">
                  <option value="ZH_TW">繁體中文</option>
                  <option value="ZH_CN">简体中文</option>
                  <option value="EN">English</option>
                  <option value="JA">日本語</option>
                </select>
                <button type="button" onClick={() => fetchFields(false)} disabled={fetchingFields}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  {fetchingFields && <Loader2 className="w-3 h-3 animate-spin" />}
                  載入欄位
                </button>
                <button type="button" onClick={() => fetchFields(true)} disabled={fetchingFields}
                  className="text-xs text-gray-500 hover:text-blue-600 hover:underline" title="從 Maximo 重新抓取並更新快取">
                  重新抓取
                </button>
              </div>
            </div>

            {availableFields.length > 0 ? (
              <div className="border rounded-lg">
                {/* Search + actions bar */}
                <div className="flex items-center gap-2 p-2 border-b bg-gray-50 rounded-t-lg">
                  <input
                    type="text"
                    value={fieldFilter}
                    onChange={(e) => setFieldFilter(e.target.value)}
                    placeholder="搜尋欄位..."
                    className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button" onClick={() => {
                    const matchFilter = (f) => !fieldFilter || f.name.toLowerCase().includes(fieldFilter.toLowerCase()) || (f.title && f.title.toLowerCase().includes(fieldFilter.toLowerCase()))
                    const filtered = availableFields.filter(matchFilter).map(f => f.name)
                    setSelectedFields(prev => [...new Set([...prev, ...filtered])])
                  }} className="text-xs text-blue-600 hover:underline whitespace-nowrap">全選</button>
                  <button type="button" onClick={() => {
                    if (fieldFilter) {
                      const matchFilter = (f) => f.name.toLowerCase().includes(fieldFilter.toLowerCase()) || (f.title && f.title.toLowerCase().includes(fieldFilter.toLowerCase()))
                      const filtered = new Set(availableFields.filter(matchFilter).map(f => f.name))
                      setSelectedFields(prev => prev.filter(f => !filtered.has(f)))
                    } else {
                      setSelectedFields([])
                    }
                  }} className="text-xs text-red-500 hover:underline whitespace-nowrap">取消全選</button>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{selectedFields.length}/{availableFields.length}</span>
                </div>
                {/* Field list */}
                <div className="p-3 max-h-60 overflow-y-auto">
                  <div className="space-y-0.5">
                    {availableFields
                      .filter(f => !fieldFilter || f.name.toLowerCase().includes(fieldFilter.toLowerCase()) || (f.title && f.title.toLowerCase().includes(fieldFilter.toLowerCase())))
                      .map(f => f.type === 'list' ? (
                        <div key={f.name} className="border rounded bg-amber-50/50">
                          <div className="flex items-center gap-2 px-2 py-1">
                            <button type="button" onClick={() => toggleExpandChild(f.name)} className="text-gray-400 hover:text-gray-600">
                              {expandedChildren[f.name] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <input type="checkbox" checked={selectedFields.includes(f.name)} onChange={() => toggleField(f.name)} />
                            <span className="font-mono text-sm">{f.name}</span>
                            <span className="bg-amber-200 text-amber-800 text-xs px-1.5 py-0.5 rounded">子表</span>
                            {f.title && <span className="text-gray-500 text-xs truncate">{f.title}</span>}
                            {selectedChildFields[f.name] && (
                              <span className="text-xs text-blue-600 ml-auto">{selectedChildFields[f.name].length} 個子欄位</span>
                            )}
                          </div>
                          {expandedChildren[f.name] && (
                            <div className="border-t bg-white px-4 py-2">
                              {loadingChild[f.name] ? (
                                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                                  <Loader2 className="w-4 h-4 animate-spin" /> 載入子欄位中...
                                </div>
                              ) : childFieldsData[f.name] && childFieldsData[f.name].length > 0 ? (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <button type="button" onClick={() => selectAllChildFields(f.name)} className="text-xs text-blue-600 hover:underline">全選</button>
                                    <button type="button" onClick={() => deselectAllChildFields(f.name)} className="text-xs text-red-500 hover:underline">取消全選</button>
                                    <span className="text-xs text-gray-400">{(selectedChildFields[f.name] || []).length}/{childFieldsData[f.name].length}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                                    {childFieldsData[f.name].map(cf => (
                                      <label key={cf.name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                                        <input type="checkbox"
                                          checked={(selectedChildFields[f.name] || []).includes(cf.name)}
                                          onChange={() => toggleChildField(f.name, cf.name)} />
                                        <span className="font-mono text-xs">{cf.name}</span>
                                        {cf.title && <span className="text-gray-400 text-xs truncate" title={cf.title}>{cf.title}</span>}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-red-500 py-1">{childFieldsError[f.name] || '無法取得子欄位或此欄位無子結構'}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <label key={f.name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                          <input type="checkbox" checked={selectedFields.includes(f.name)} onChange={() => toggleField(f.name)} />
                          <span className="font-mono">{f.name}</span>
                          {f.title && <span className="text-gray-500 text-xs truncate" title={f.title}>{f.title}</span>}
                          <span className="text-gray-400 text-xs">({f.type})</span>
                        </label>
                      ))}
                  </div>
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
              placeholder='例：status="APPR" and changedate>="${YESTERDAY}"' />
            <p className="text-xs text-gray-400 mt-1">
              支援日期變數：<code className="bg-gray-100 px-1 rounded">${'{TODAY}'}</code> <code className="bg-gray-100 px-1 rounded">${'{YESTERDAY}'}</code> <code className="bg-gray-100 px-1 rounded">${'{THIS_MONTH}'}</code> <code className="bg-gray-100 px-1 rounded">${'{LAST_MONTH}'}</code> <code className="bg-gray-100 px-1 rounded">${'{THIS_YEAR}'}</code> <code className="bg-gray-100 px-1 rounded">${'{DAYS_AGO_7}'}</code> <code className="bg-gray-100 px-1 rounded">${'{DAYS_AGO_30}'}</code>
            </p>
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
  const { data: config } = useQuery({
    queryKey: ['transfer', profile.id],
    queryFn: () => getTransferConfig(profile.id),
  })

  const defaultValues = {
    write_mode: 'APPEND',
    upsert_key: '',
    enabled: false,
  }

  const { register, handleSubmit, watch } = useForm({
    values: config || defaultValues,
  })

  const writeMode = watch('write_mode')

  const mutation = useMutation({
    mutationFn: (data) => saveTransferConfig(profile.id, data),
    onSuccess: onClose,
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-bold">推送設定 - {profile.name}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-5 space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...register('enabled')} />
            <span className="text-sm font-medium">抽取後自動寫入 PostgreSQL</span>
          </label>

          <p className="text-xs text-gray-400">PostgreSQL 連線資訊請至「連線設定」頁面統一設定</p>

          <div>
            <label className="block text-sm font-medium mb-1">寫入模式</label>
            <select {...register('write_mode')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="APPEND">APPEND — 新增（保留原有資料）</option>
              <option value="REPLACE">REPLACE — 取代（清空後寫入）</option>
              <option value="UPSERT">UPSERT — 依主鍵更新或新增</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">資料表名稱：{profile.object_structure?.toLowerCase()}</p>
          </div>

          {writeMode === 'UPSERT' && (
            <div>
              <label className="block text-sm font-medium mb-1">UPSERT 主鍵欄位</label>
              <input {...register('upsert_key')} className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例：wonum" />
              <p className="text-xs text-gray-400 mt-1">衝突時依此欄位判斷是否更新</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">取消</button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              儲存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProfileCard({ profile: p, tenantId, onEdit, onDelete, onTransfer }) {
  const [showFields, setShowFields] = useState(false)

  const { data: fieldMeta = [] } = useQuery({
    queryKey: ['fields', p.object_structure, tenantId],
    queryFn: () => getFields(p.object_structure, tenantId, false, 'ZH_TW'),
    enabled: showFields && p.fields && p.fields.length > 0,
  })

  // Build a name->title map
  const titleMap = {}
  fieldMeta.forEach(f => { if (f.title) titleMap[f.name] = f.title })

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg">{p.name}</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-mono">{p.object_structure}</span>
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{p.export_format.toUpperCase()}</span>
            {p.schedule_cron && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">排程: {p.schedule_cron}</span>}
            {p.where_clause && <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-mono truncate max-w-xs">WHERE: {p.where_clause}</span>}
          </div>
          {p.fields && p.fields.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowFields(!showFields)}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                {showFields ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                欄位 ({p.fields.length})
              </button>
              {showFields && (
                <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1 font-medium text-gray-500">欄位代號</th>
                        <th className="text-left px-2 py-1 font-medium text-gray-500">標題</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {p.fields.map(f => (
                        <tr key={f} className="hover:bg-gray-50">
                          <td className="px-2 py-1 font-mono text-gray-700">{f}</td>
                          <td className="px-2 py-1 text-gray-500">{titleMap[f] || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {p.child_fields && Object.keys(p.child_fields).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(p.child_fields).map(([name, fields]) => (
                <span key={name} className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                  {name} ({fields.length} 欄位)
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onTransfer}
            className={`p-2 rounded-lg transition-colors ${p.transfer_enabled ? 'text-green-500 hover:text-green-700 hover:bg-green-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`} title={p.transfer_enabled ? '已啟用自動推送' : '推送設定'}>
            <CloudUpload className="w-4 h-4" />
          </button>
          <button onClick={onEdit}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
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
            <ProfileCard key={p.id} profile={p} tenantId={tenantId}
              onEdit={() => handleEdit(p)}
              onDelete={() => confirm('確定刪除此設定？') && deleteMutation.mutate(p.id)}
              onTransfer={() => setTransferProfile(p)}
            />
          ))}
        </div>
      )}

      {showForm && <ProfileForm profile={editProfile} onClose={handleClose} onSaved={handleClose} tenantId={tenantId} />}
      {transferProfile && <TransferModal profile={transferProfile} onClose={() => { setTransferProfile(null); qc.invalidateQueries({ queryKey: ['profiles'] }) }} />}
    </div>
  )
}
