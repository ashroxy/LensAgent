@echo off
echo Starting LensAgent FastAPI Backend on port 8000...
cd /d "%~dp0\.."
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
