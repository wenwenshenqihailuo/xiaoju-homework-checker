"""Web版后端API"""
import os
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from image_recognizer import BaiduOCRRecognizer
from answer_checker import AnswerChecker

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

        recognizer = BaiduOCRRecognizer(
            os.getenv("BAIDU_OCR_API_KEY"),
            os.getenv("BAIDU_OCR_SECRET_KEY")
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


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
