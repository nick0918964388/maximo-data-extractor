import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Tenants
export const listTenants = () => api.get('/tenants').then(r => r.data)
export const getTenant = (id) => api.get(`/tenants/${id}`).then(r => r.data)
export const createTenant = (data) => api.post('/tenants', data).then(r => r.data)
export const updateTenant = (id, data) => api.put(`/tenants/${id}`, data).then(r => r.data)
export const deleteTenant = (id) => api.delete(`/tenants/${id}`).then(r => r.data)

// Connection
export const getConnection = (tenant_id) => 
  api.get('/connection', { params: { tenant_id } }).then(r => r.data)
export const listConnections = (tenant_id) =>
  api.get('/connection/list', { params: { tenant_id } }).then(r => r.data)
export const saveConnection = (data) => api.post('/connection', data).then(r => r.data)
export const updateConnection = (id, data) => api.put(`/connection/${id}`, data).then(r => r.data)
export const deleteConnection = (id) => api.delete(`/connection/${id}`).then(r => r.data)
export const testConnection = (data) => api.post('/connection/test', data).then(r => r.data)
export const getObjectStructures = (tenant_id) => 
  api.get('/connection/object-structures', { params: { tenant_id } }).then(r => r.data)
export const getFields = (os, tenant_id) => 
  api.get(`/connection/fields/${os}`, { params: { tenant_id } }).then(r => r.data)

// Profiles
export const listProfiles = (params) => 
  api.get('/profiles', { params }).then(r => r.data)
export const getProfile = (id) => api.get(`/profiles/${id}`).then(r => r.data)
export const createProfile = (data) => api.post('/profiles', data).then(r => r.data)
export const updateProfile = (id, data) => api.put(`/profiles/${id}`, data).then(r => r.data)
export const deleteProfile = (id) => api.delete(`/profiles/${id}`).then(r => r.data)
export const getTransferConfig = (id) => api.get(`/profiles/${id}/transfer`).then(r => r.data)
export const saveTransferConfig = (id, data) => api.post(`/profiles/${id}/transfer`, data).then(r => r.data)
export const testTransferConfig = (id, data) => api.post(`/profiles/${id}/transfer/test`, data).then(r => r.data)

// Extract
export const runExtract = (profile_id) => api.post('/extract/run', { profile_id }).then(r => r.data)
export const getExtractStatus = (profile_id) => api.get(`/extract/status/${profile_id}`).then(r => r.data)

// History
export const listHistory = (limit = 50) => api.get(`/history?limit=${limit}`).then(r => r.data)
export const getHistory = (id) => api.get(`/history/${id}`).then(r => r.data)
export const deleteHistory = (id) => api.delete(`/history/${id}`).then(r => r.data)
export const clearHistory = () => api.delete('/history').then(r => r.data)
export const downloadFile = (history_id) => `/api/extract/download/${history_id}`

// Preview
export const previewCsv = (history_id, page = 1, page_size = 100) =>
  api.get(`/preview/csv/${history_id}`, { params: { page, page_size } }).then(r => r.data)
export const listDbTables = () => api.get('/preview/db/tables').then(r => r.data)
export const previewDbTable = (table_name, page = 1, page_size = 100) =>
  api.get(`/preview/db/${table_name}`, { params: { page, page_size } }).then(r => r.data)
