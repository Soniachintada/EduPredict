"""FastAPI application for the EduPredict full-stack AIML demo."""

from pathlib import Path
import sqlite3
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.ml_model import get_model_summary, predict_student

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(
    title="EduPredict API",
    description="A demonstration API that predicts student performance using a Random Forest model.",
    version="1.0.0",
)

DB_PATH = BASE_DIR / "edupredict_tasks.db"

def db_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection

def init_task_db():
    with db_connection() as connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
            category TEXT NOT NULL CHECK(category IN ('Immediate','Short-term','Medium-term','Long-term')),
            start_at TEXT, due_at TEXT, reminder_minutes INTEGER DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','skipped','paused')),
            created_at TEXT NOT NULL)""")

init_task_db()

class TaskInput(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default='', max_length=1000)
    category: str = Field(..., pattern='^(Immediate|Short-term|Medium-term|Long-term)$')
    start_at: str = ''
    due_at: str = ''
    reminder_minutes: int = Field(default=0, ge=0, le=10080)

class TaskStatusInput(BaseModel):
    status: str = Field(..., pattern='^(pending|completed|skipped|paused)$')

def task_dict(row):
    return dict(row)

@app.get('/api/tasks')
def list_tasks():
    with db_connection() as connection:
        rows = connection.execute("SELECT * FROM tasks ORDER BY CASE category WHEN 'Immediate' THEN 1 WHEN 'Short-term' THEN 2 WHEN 'Medium-term' THEN 3 ELSE 4 END, id").fetchall()
    return [task_dict(row) for row in rows]

@app.post('/api/tasks')
def create_task(payload: TaskInput):
    with db_connection() as connection:
        cursor = connection.execute("INSERT INTO tasks (title,description,category,start_at,due_at,reminder_minutes,created_at) VALUES (?,?,?,?,?,?,?)",
            (payload.title.strip(), payload.description, payload.category, payload.start_at, payload.due_at, payload.reminder_minutes, datetime.now().isoformat(timespec='seconds')))
        row = connection.execute('SELECT * FROM tasks WHERE id=?', (cursor.lastrowid,)).fetchone()
    return task_dict(row)

@app.patch('/api/tasks/{task_id}')
def update_task(task_id: int, payload: TaskInput):
    with db_connection() as connection:
        cursor = connection.execute("UPDATE tasks SET title=?,description=?,category=?,start_at=?,due_at=?,reminder_minutes=? WHERE id=?",
            (payload.title.strip(),payload.description,payload.category,payload.start_at,payload.due_at,payload.reminder_minutes,task_id))
        if not cursor.rowcount: raise HTTPException(status_code=404, detail='Task not found')
        row = connection.execute('SELECT * FROM tasks WHERE id=?',(task_id,)).fetchone()
    return task_dict(row)

@app.patch('/api/tasks/{task_id}/status')
def update_task_status(task_id: int, payload: TaskStatusInput):
    with db_connection() as connection:
        cursor = connection.execute('UPDATE tasks SET status=? WHERE id=?',(payload.status,task_id))
        if not cursor.rowcount: raise HTTPException(status_code=404, detail='Task not found')
        row = connection.execute('SELECT * FROM tasks WHERE id=?',(task_id,)).fetchone()
    return task_dict(row)

@app.delete('/api/tasks/{task_id}')
def delete_task(task_id: int):
    with db_connection() as connection:
        cursor = connection.execute('DELETE FROM tasks WHERE id=?',(task_id,))
        if not cursor.rowcount: raise HTTPException(status_code=404, detail='Task not found')
    return {'deleted': True}


class StudentInput(BaseModel):
    study_hours: float = Field(..., ge=0, le=12, description="Average focused study hours per day")
    attendance: float = Field(..., ge=0, le=100, description="Attendance percentage")
    previous_score: float = Field(..., ge=0, le=100, description="Previous exam score percentage")
    assignments_completed: float = Field(..., ge=0, le=10, description="Assignments completed out of 10")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "message": "EduPredict API is running"}


@app.get("/api/model-info")
def model_info() -> dict[str, Any]:
    return get_model_summary()


@app.post("/api/predict")
def predict(payload: StudentInput) -> dict[str, Any]:
    try:
        return predict_student(
            study_hours=payload.study_hours,
            attendance=payload.attendance,
            previous_score=payload.previous_score,
            assignments_completed=payload.assignments_completed,
        )
    except Exception as exc:  # Keep unexpected errors from exposing internals to the browser.
        raise HTTPException(status_code=500, detail="Prediction could not be completed.") from exc


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


# Serve the frontend from the same local server, so no separate frontend server is needed.
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
