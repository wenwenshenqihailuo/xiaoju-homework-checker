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
    """百度OCR识别"""

    def __init__(self, api_key: str, secret_key: str):
        self.api_key = api_key
        self.secret_key = secret_key
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

        url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token={self.access_token}"
        response = requests.post(url, data={"image": image_data})
        result = response.json()

        if "words_result" in result:
            return "\n".join([item["words"] for item in result["words_result"]])
        return ""


class AIVisionRecognizer(ImageRecognizer):
    """AI视觉识别（预留接口）"""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def recognize(self, image_path: str) -> str:
        # TODO: 实现AI视觉识别
        raise NotImplementedError("AI视觉识别功能待实现")
