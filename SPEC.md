# Maximo Data Extractor - 專案規格

## 專案概述

一個 Web UI 工具，透過 IBM Maximo OSLC API 抽取資料，並可推送到遠端伺服器。

## 技術棧

- **後端:** Python 3.11+ / FastAPI
- **前端:** React + Vite + TailwindCSS
- **資料庫:** SQLite (儲存設定)
- **環境:** Python 虛擬環境 (venv)，不使用 Docker

## 認證方式

使用 Maximo API Key (apikey) 認證：
- Header: `apikey: {api_key}`
- API Key: `5hif2ddabltd7e40ronku1facft2er9kn74v8vib`

## 核心功能

### 1. 連線設定
- 設定 Maximo Base URL
- 設定 API Key
- 測試連線功能

### 2. 資料表/欄位設定
- 列出可用的 Object Structures (透過 OSLC API)
- 選擇要抽取的 Object Structure
- 選擇要抽取的欄位
- 設定篩選條件 (oslc.where)
- 設定排序 (oslc.orderBy)
- 儲存多個抽取設定 (profiles)

### 3. 抽取執行
- 手動立即執行
- 定時排程執行 (使用 APScheduler)
- 顯示執行進度
- 匯出格式：CSV / JSON

### 4. 資料推送
- 設定目標伺服器 (SSH/SCP)
- 抽取完成後自動推送
- 推送狀態追蹤

### 5. 執行歷史
- 記錄每次執行結果
- 查看/下載歷史檔案
- 錯誤日誌

## API 規格

### Maximo OSLC API 格式

```
GET {base_url}/oslc/os/{object_structure}
Headers:
  apikey: {api_key}
  Accept: application/json

Query Parameters:
  oslc.select: field1,field2,field3
  oslc.where: status="APPR"
  oslc.orderBy: -changedate
  oslc.pageSize: 500
  lean: 1
```

### 常用 Object Structures
- MXWO: 工單
- MXASSET: 資產
- MXINVENTORY: 庫存
- MXPERSON: 人員
- MXSR: 服務請求

## 目錄結構

```
maximo-data-extractor/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI 入口
│   │   ├── config.py         # 設定管理
│   │   ├── database.py       # SQLite 連線
│   │   ├── models.py         # SQLAlchemy Models
│   │   ├── routers/
│   │   │   ├── connection.py # 連線設定 API
│   │   │   ├── profiles.py   # 抽取設定 API
│   │   │   ├── extract.py    # 執行抽取 API
│   │   │   └── history.py    # 歷史記錄 API
│   │   └── services/
│   │       ├── maximo.py     # Maximo OSLC Client
│   │       ├── scheduler.py  # 排程服務
│   │       └── transfer.py   # SCP 傳輸服務
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── api/
│   ├── package.json
│   └── vite.config.js
├── data/                     # SQLite + 匯出檔案
├── .env.example
├── start.bat                 # Windows 啟動腳本
└── README.md
```

## 部署方式

在 Windows 跳板機上：
1. 建立 Python 虛擬環境
2. 安裝後端依賴
3. 安裝前端依賴並 build
4. 執行 `start.bat` 啟動服務
5. 瀏覽器開啟 http://localhost:8000

## 資料目標

抽取的資料寫入 PostgreSQL (PCM 主機):
- **Host:** postgres.nickai.cc
- **Port:** 5432
- **Database:** finrecorder (或新建 maximo_data)
- **Username:** finrecorder
- **Password:** finrecorder123

### 資料寫入方式
1. 首次抽取：自動建立對應的資料表 (maximo_{object_structure})
2. 後續抽取：可選擇 APPEND (新增) 或 REPLACE (取代)
3. 支援 UPSERT (依主鍵更新)
