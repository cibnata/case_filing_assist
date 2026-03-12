# OCR Server（Surya + FastAPI）

## 1) 安裝依賴

```bash
cd backend/ocr_server
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

> 若為 Linux 且需處理 PDF，請先安裝 Poppler：

```bash
sudo apt-get update && sudo apt-get install -y poppler-utils
```

## 2) 啟動服務

```bash
cd backend/ocr_server
source .venv/bin/activate
python suryaocr_Server.py
```

服務預設在 `http://0.0.0.0:8000`。

## 3) Poppler 跨平台設定

- Linux/macOS：預設使用 PATH 中的 `pdftoppm`。
- Windows：若 `pdftoppm` 不在 PATH，請設定 `POPPLER_PATH` 指向 Poppler 的 `bin` 目錄。

```bash
# Windows PowerShell
$env:POPPLER_PATH = "C:\\Program Files\\poppler\\Library\\bin"
```

```bash
# Linux/macOS（如需手動指定）
export POPPLER_PATH=/usr/bin
```
