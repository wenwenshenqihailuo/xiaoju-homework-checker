"""数据库模型 - 错题记忆"""
import sqlite3
from datetime import datetime
import json


class WrongAnswerDB:
    """错题数据库"""

    def __init__(self, db_path="wrong_answers.db"):
        self.db_path = db_path
        self.init_db()

    def init_db(self):
        """初始化数据库"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS wrong_answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                english TEXT NOT NULL,
                chinese TEXT NOT NULL,
                error_detail TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                review_count INTEGER DEFAULT 0,
                mastered BOOLEAN DEFAULT 0
            )
        """)
        conn.commit()
        conn.close()

    def add_wrong_answer(self, english, chinese, error_detail):
        """添加错题"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO wrong_answers (english, chinese, error_detail)
            VALUES (?, ?, ?)
        """, (english, chinese, error_detail))
        conn.commit()
        conn.close()

    def get_all_wrong_answers(self):
        """获取所有错题"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM wrong_answers WHERE mastered = 0 ORDER BY created_at DESC")
        rows = cursor.fetchall()
        conn.close()
        return rows

    def mark_as_mastered(self, answer_id):
        """标记为已掌握"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("UPDATE wrong_answers SET mastered = 1 WHERE id = ?", (answer_id,))
        conn.commit()
        conn.close()
