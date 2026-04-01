"""图片识别模块 - 支持OCR和AI视觉识别"""
import base64
import requests
from abc import ABC, abstractmethod


class ImageRecognizer(ABC):
    """图片识别基类"""

    @abstractmethod
    def recognize(self, image_path: str) -> str:
        """识别图片中的文字"""
        pass


class BaiduOCRRecognizer(ImageRecognizer):
    """百度OCR识别 - 支持多种识别模式"""

    OCR_MODES = {
        "general": "general_basic",  # 通用文字识别（标准版）
        "accurate": "accurate_basic",  # 通用文字识别（高精度版）
        "handwriting": "handwriting",  # 手写文字识别
        "webimage": "webimage",  # 网络图片文字识别
    }

    def __init__(self, api_key: str, secret_key: str, mode: str = "handwriting"):
        self.api_key = api_key
        self.secret_key = secret_key
        self.mode = mode
        self.access_token = self._get_access_token()

    def _get_access_token(self) -> str:
        url = "https://aip.baidubce.com/oauth/2.0/token"
        params = {
            "grant_type": "client_credentials",
            "client_id": self.api_key,
            "client_secret": self.secret_key
        }
        response = requests.post(url, params=params)
        return response.json()["access_token"]

    def recognize(self, image_path: str) -> str:
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode()

        ocr_type = self.OCR_MODES.get(self.mode, "handwriting")
        url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/{ocr_type}?access_token={self.access_token}"
        response = requests.post(url, data={"image": image_data})
        result = response.json()

        if "words_result" in result:
            return "\n".join([item["words"] for item in result["words_result"]])
        return ""


class AIVisionRecognizer(ImageRecognizer):
    """DeepSeek视觉识别"""

    def __init__(self, api_key: str):
        from openai import OpenAI
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com"
        )

    def recognize(self, image_path: str) -> str:
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode()

        prompt = f"""请识别这张英文听写作业图片中的所有内容。

图片（base64编码）：
{image_data[:100]}...

请提取图片中的：
1. 英文单词/短语
2. 对应的中文翻译

按原格式输出，保持英文和中文的对应关系。"""

        response = self.client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024
        )
        return response.choices[0].message.content
