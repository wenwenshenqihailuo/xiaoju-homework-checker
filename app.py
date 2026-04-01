"""Web版后端API"""
import os
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from image_recognizer import BaiduOCRRecognizer
from answer_checker import AnswerChecker
from database import WrongAnswerDB

load_dotenv()

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/wrong-answers')
def wrong_answers_page():
    return render_template('wrong_answers.html')


@app.route('/api/check', methods=['POST'])
def check_homework():
    if 'file' not in request.files:
        return jsonify({'error': '没有上传文件'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '文件名为空'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': '只支持 PNG, JPG, JPEG 格式'}), 400

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        ocr_mode = request.form.get('mode', 'handwriting')
        recognizer = BaiduOCRRecognizer(
            os.getenv("BAIDU_OCR_API_KEY"),
            os.getenv("BAIDU_OCR_SECRET_KEY"),
            mode=ocr_mode
        )
        recognized_text = recognizer.recognize(filepath)

        checker = AnswerChecker(os.getenv("DEEPSEEK_API_KEY"))
        result = checker.check(recognized_text)

        os.remove(filepath)

        return jsonify({
            'recognized_text': recognized_text,
            'result': result['result']
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/confirm-result', methods=['POST'])
def confirm_result():
    """用户确认结果后保存错题"""
    try:
        data = request.json
        db = WrongAnswerDB()
        for item in data.get('items', []):
            if item.get('status') == 'wrong':
                db.add_wrong_answer(
                    item.get('english', ''),
                    item.get('chinese', ''),
                    item.get('error', '')
                )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/wrong-answers', methods=['GET'])
def get_wrong_answers():
    """获取错题列表"""
    try:
        db = WrongAnswerDB()
        rows = db.get_all_wrong_answers()
        items = []
        for row in rows:
            items.append({
                'id': row[0],
                'english': row[1],
                'chinese': row[2],
                'error_detail': row[3],
                'created_at': row[4]
            })
        return jsonify({'items': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/wrong-answers/<int:answer_id>/master', methods=['POST'])
def mark_mastered(answer_id):
    """标记为已掌握"""
    try:
        db = WrongAnswerDB()
        db.mark_as_mastered(answer_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
