import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, FileText, Database, ChevronLeft, ChevronRight, RefreshCw, Table2, Copy, Check, ArrowUp, ArrowDown, ArrowUpDown, Filter, X, GripVertical, RotateCcw } from 'lucide-react'
import { listHistory, previewCsv, listDbTables, previewDbTable } from '../api/index.js'
import { useTenant } from '../App.jsx'

function Pagination({ page, totalPages, onPageChange }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-1.5 rounded border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm text-gray-600">
        第 {page} / {totalPages} 頁
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-1.5 rounded border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

function SortIcon({ field, sortBy, sortOrder }) {
  if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 text-gray-300" />
  return sortOrder === 'asc'
    ? <ArrowUp className="w-3 h-3 text-blue-600" />
    : <ArrowDown className="w-3 h-3 text-blue-600" />
}

function DataTable({ headers, rows, isLoading, fieldTitles, sortBy, sortOrder, onSort, columnFilters, onFilterChange, onColumnReorder }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!headers || headers.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Table2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>沒有資料</p>
      </div>
    )
  }

  const handleSort = (field) => {
    if (!onSort) return
    if (sortBy === field) {
      onSort(field, sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(field, 'asc')
    }
  }

  const handleDragStart = (e, index) => {
    if (!onColumnReorder) return
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e, index) => {
    if (!onColumnReorder || dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    if (!onColumnReorder || dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const newHeaders = [...headers]
    const [moved] = newHeaders.splice(dragIndex, 1)
    newHeaders.splice(dropIndex, 0, moved)
    onColumnReorder(newHeaders)
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div>
      <table className="min-w-max text-sm">
        <thead className="bg-gray-50 border-b sticky top-0 z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">#</th>
            {headers.map((h, i) => (
              <th
                key={h}
                draggable={!!onColumnReorder}
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                className={`text-left px-3 py-2 font-medium text-gray-600 text-xs whitespace-nowrap transition-all
                  ${onSort ? 'cursor-pointer select-none hover:bg-gray-100' : ''}
                  ${dragIndex === i ? 'opacity-40' : ''}
                  ${dragOverIndex === i && dragIndex !== i ? 'border-l-2 border-blue-500' : ''}
                `}
                onClick={() => handleSort(h)}
              >
                <div className="flex items-center gap-1">
                  {onColumnReorder && (
                    <GripVertical
                      className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-grab flex-shrink-0"
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  )}
                  <span>{h}</span>
                  {onSort && <SortIcon field={h} sortBy={sortBy} sortOrder={sortOrder} />}
                </div>
                {fieldTitles && fieldTitles[h] && (
                  <div className="text-gray-400 font-normal">{fieldTitles[h]}</div>
                )}
              </th>
            ))}
          </tr>
          {onFilterChange && (
            <tr className="bg-gray-50 border-b">
              <th className="px-3 py-1">
                <Filter className="w-3 h-3 text-gray-400" />
              </th>
              {headers.map((h) => (
                <th key={h} className="px-1 py-1">
                  <input
                    type="text"
                    value={columnFilters?.[h] || ''}
                    onChange={(e) => onFilterChange(h, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="篩選..."
                    className="w-full min-w-[60px] px-2 py-1 text-xs font-normal border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400"
                  />
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows && rows.length > 0 ? (
            rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400 text-xs">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 whitespace-nowrap max-w-xs truncate" title={cell}>
                    {cell || <span className="text-gray-300">-</span>}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length + 1} className="text-center py-8 text-gray-400">
                沒有符合篩選條件的資料
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function CsvPreview() {
  const { tenantId } = useTenant()
  const [selectedHistory, setSelectedHistory] = useState(null)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['history-for-preview', tenantId],
    queryFn: () => listHistory(50, tenantId),
  })

  const successHistory = history.filter(h => h.status === 'success' && h.file_path)

  const { data: csvData, isLoading: csvLoading, refetch } = useQuery({
    queryKey: ['csv-preview', selectedHistory, page, sortBy, sortOrder],
    queryFn: () => previewCsv(selectedHistory, page, 100, sortBy, sortOrder),
    enabled: !!selectedHistory,
  })

  const handleHistoryChange = (e) => {
    const id = e.target.value ? parseInt(e.target.value) : null
    setSelectedHistory(id)
    setPage(1)
    setSortBy(null)
    setSortOrder('asc')
  }

  const handleSort = (field, order) => {
    setSortBy(field)
    setSortOrder(order)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-500" />
          <select
            value={selectedHistory || ''}
            onChange={handleHistoryChange}
            className="border rounded-lg px-3 py-2 text-sm min-w-[300px]"
            disabled={historyLoading}
          >
            <option value="">-- 選擇 CSV 檔案 --</option>
            {successHistory.map(h => (
              <option key={h.id} value={h.id}>
                {h.profile_name} - {new Date(h.started_at).toLocaleString('zh-TW')} ({h.records_count}筆)
              </option>
            ))}
          </select>
        </div>
        {csvData && (
          <>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Pagination page={page} totalPages={csvData.total_pages} onPageChange={setPage} />
            <span className="text-sm text-gray-500">
              共 {csvData.total_rows?.toLocaleString()} 筆
            </span>
          </>
        )}
      </div>

      {selectedHistory && (
        <div className="bg-white rounded-xl shadow max-h-[500px] overflow-auto">
          <DataTable
            headers={csvData?.headers || []}
            rows={csvData?.rows || []}
            isLoading={csvLoading}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </div>
      )}

      {!selectedHistory && (
        <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>請選擇一個 CSV 檔案來預覽</p>
        </div>
      )}
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={handleCopy}
      title="複製表名稱"
      className={`p-1.5 rounded transition-colors ${copied ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

// localStorage 存取欄位順序
const COLUMN_ORDER_KEY = 'db-preview-column-order'

function loadColumnOrder(tableName) {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY) || '{}')
    return all[tableName] || null
  } catch { return null }
}

function saveColumnOrder(tableName, order) {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY) || '{}')
    all[tableName] = order
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

function clearColumnOrder(tableName) {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY) || '{}')
    delete all[tableName]
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

function DbPreview() {
  const { tenantId } = useTenant()
  const [selectedTable, setSelectedTable] = useState(null)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')
  const [columnFilterInputs, setColumnFilterInputs] = useState({})
  const [appliedFilters, setAppliedFilters] = useState({})
  const [columnOrder, setColumnOrder] = useState(null) // null = 使用原始順序
  const debounceRef = useRef(null)

  const { data: tablesData, isLoading: tablesLoading, error: tablesError } = useQuery({
    queryKey: ['db-tables', tenantId],
    queryFn: () => listDbTables(tenantId),
  })

  // 只傳有值的 filters
  const activeFilters = Object.fromEntries(
    Object.entries(appliedFilters).filter(([, v]) => v && v.trim())
  )
  const hasFilters = Object.keys(activeFilters).length > 0

  const { data: tableData, isLoading: tableLoading, refetch } = useQuery({
    queryKey: ['db-table-preview', selectedTable, page, sortBy, sortOrder, activeFilters],
    queryFn: () => previewDbTable(selectedTable, page, 100, sortBy, sortOrder, hasFilters ? activeFilters : null),
    enabled: !!selectedTable,
  })

  // 載入已存的欄位順序
  useEffect(() => {
    if (selectedTable) {
      const saved = loadColumnOrder(selectedTable)
      setColumnOrder(saved)
    }
  }, [selectedTable])

  // 根據 columnOrder 重新排列 headers 和 rows
  const { orderedHeaders, orderedRows, isReordered } = useMemo(() => {
    const originalHeaders = tableData?.headers || []
    const originalRows = tableData?.rows || []

    if (!columnOrder || originalHeaders.length === 0) {
      return { orderedHeaders: originalHeaders, orderedRows: originalRows, isReordered: false }
    }

    // 過濾掉已不存在的欄位，並補上新增的欄位
    const validOrder = columnOrder.filter(h => originalHeaders.includes(h))
    const newHeaders = originalHeaders.filter(h => !validOrder.includes(h))
    const finalOrder = [...validOrder, ...newHeaders]

    // 如果順序和原始一樣，不算 reordered
    const isSame = finalOrder.length === originalHeaders.length &&
      finalOrder.every((h, i) => h === originalHeaders[i])
    if (isSame) {
      return { orderedHeaders: originalHeaders, orderedRows: originalRows, isReordered: false }
    }

    // 建立索引對映
    const indexMap = finalOrder.map(h => originalHeaders.indexOf(h))

    const reorderedRows = originalRows.map(row =>
      indexMap.map(idx => idx >= 0 && idx < row.length ? row[idx] : '')
    )

    return { orderedHeaders: finalOrder, orderedRows: reorderedRows, isReordered: true }
  }, [tableData, columnOrder])

  const handleTableChange = (e) => {
    setSelectedTable(e.target.value || null)
    setPage(1)
    setSortBy(null)
    setSortOrder('asc')
    setColumnFilterInputs({})
    setAppliedFilters({})
    setColumnOrder(null)
  }

  const handleSort = (field, order) => {
    setSortBy(field)
    setSortOrder(order)
    setPage(1)
  }

  const handleFilterChange = useCallback((field, value) => {
    setColumnFilterInputs(prev => ({ ...prev, [field]: value }))

    // debounce 500ms 自動套用
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setAppliedFilters(prev => ({ ...prev, [field]: value }))
      setPage(1)
    }, 500)
  }, [])

  const handleClearFilters = () => {
    setColumnFilterInputs({})
    setAppliedFilters({})
    setPage(1)
  }

  const handleColumnReorder = useCallback((newHeaders) => {
    setColumnOrder(newHeaders)
    if (selectedTable) {
      saveColumnOrder(selectedTable, newHeaders)
    }
  }, [selectedTable])

  const handleResetColumnOrder = () => {
    setColumnOrder(null)
    if (selectedTable) {
      clearColumnOrder(selectedTable)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-gray-500" />
          <select
            value={selectedTable || ''}
            onChange={handleTableChange}
            className="border rounded-lg px-3 py-2 text-sm min-w-[300px]"
            disabled={tablesLoading}
          >
            <option value="">-- 選擇資料表 --</option>
            {tablesData?.tables?.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {selectedTable && <CopyButton text={selectedTable} />}
        </div>
        {tableData && (
          <>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Pagination page={page} totalPages={tableData.total_pages} onPageChange={setPage} />
            <span className="text-sm text-gray-500">
              共 {tableData.total_rows?.toLocaleString()} 筆
            </span>
            {hasFilters && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100"
              >
                <X className="w-4 h-4" />
                清除篩選
              </button>
            )}
            {isReordered && (
              <button
                onClick={handleResetColumnOrder}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100"
                title="恢復預設欄位順序"
              >
                <RotateCcw className="w-4 h-4" />
                重置欄位順序
              </button>
            )}
          </>
        )}
      </div>

      {tablesError && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
          無法連線至資料庫: {tablesError.message}
        </div>
      )}

      {selectedTable && (
        <div className="bg-white rounded-xl shadow max-h-[500px] overflow-auto">
          <DataTable
            headers={orderedHeaders}
            rows={orderedRows}
            isLoading={tableLoading}
            fieldTitles={tableData?.field_titles}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            columnFilters={columnFilterInputs}
            onFilterChange={handleFilterChange}
            onColumnReorder={handleColumnReorder}
          />
        </div>
      )}

      {!selectedTable && !tablesError && (
        <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400">
          <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>請選擇一個 maximo_* 資料表來預覽</p>
        </div>
      )}
    </div>
  )
}

export default function PreviewPage() {
  const [activeTab, setActiveTab] = useState('csv')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">資料預覽</h2>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('csv')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'csv'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          CSV 檔案
        </button>
        <button
          onClick={() => setActiveTab('db')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'db'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Database className="w-4 h-4" />
          資料庫表
        </button>
      </div>

      {activeTab === 'csv' && <CsvPreview />}
      {activeTab === 'db' && <DbPreview />}
    </div>
  )
}
