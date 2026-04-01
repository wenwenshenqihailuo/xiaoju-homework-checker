# 英文作业自动批改系统

## 功能
- 识别作业图片中的英文听写内容
- 自动判断听写对错
- 输出批改结果

## 技术栈
- Python 3.8+
- 百度OCR API（可替换为AI视觉识别）
- Claude API（智能判断）

## 安装
```bash
pip install -r requirements.txt
```

## 配置
复制 `.env.example` 为 `.env`，填入API密钥

## 使用
```bash
python main.py --image 作业图片.jpg
```
