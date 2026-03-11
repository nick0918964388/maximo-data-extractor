import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, FileText, Database, ChevronLeft, ChevronRight, RefreshCw, Table2, Copy, Check, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
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

function DataTable({ headers, rows, isLoading, fieldTitles, sortBy, sortOrder, onSort }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!rows || rows.length === 0) {
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

  return (
    <div>
      <table className="min-w-max text-sm">
        <thead className="bg-gray-50 border-b sticky top-0">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">#</th>
            {headers.map((h, i) => (
              <th
                key={i}
                className={`text-left px-3 py-2 font-medium text-gray-600 text-xs whitespace-nowrap ${onSort ? 'cursor-pointer select-none hover:bg-gray-100' : ''}`}
                onClick={() => handleSort(h)}
              >
                <div className="flex items-center gap-1">
                  <span>{h}</span>
                  {onSort && <SortIcon field={h} sortBy={sortBy} sortOrder={sortOrder} />}
                </div>
                {fieldTitles && fieldTitles[h] && (
                  <div className="text-gray-400 font-normal">{fieldTitles[h]}</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-400 text-xs">{ri + 1}</td>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 whitespace-nowrap max-w-xs truncate" title={cell}>
                  {cell || <span className="text-gray-300">-</span>}
                </td>
              ))}
            </tr>
          ))}
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

function DbPreview() {
  const { tenantId } = useTenant()
  const [selectedTable, setSelectedTable] = useState(null)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')

  const { data: tablesData, isLoading: tablesLoading, error: tablesError } = useQuery({
    queryKey: ['db-tables', tenantId],
    queryFn: () => listDbTables(tenantId),
  })

  const { data: tableData, isLoading: tableLoading, refetch } = useQuery({
    queryKey: ['db-table-preview', selectedTable, page, sortBy, sortOrder],
    queryFn: () => previewDbTable(selectedTable, page, 100, sortBy, sortOrder),
    enabled: !!selectedTable,
  })

  const handleTableChange = (e) => {
    setSelectedTable(e.target.value || null)
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
            headers={tableData?.headers || []}
            rows={tableData?.rows || []}
            isLoading={tableLoading}
            fieldTitles={tableData?.field_titles}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
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
