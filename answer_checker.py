"""答案判断模块 - 使用DeepSeek API智能判断"""
from openai import OpenAI


class AnswerChecker:
    """答案判断器"""

    def __init__(self, api_key: str):
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com"
        )

    def check(self, recognized_text: str) -> dict:
        """判断听写对错"""
        prompt = f"""你是一个英文听写作业批改助手。请分析以下识别出的作业内容，判断每个单词/短语的听写是否正确。

作业内容：
{recognized_text}

请严格按照以下JSON格式输出，不要有任何其他文字：
{{
  "items": [
    {{"english": "单词", "chinese": "中文", "status": "correct/wrong/unknown", "error": "错误说明（如果有）"}}
  ],
  "summary": {{"total": 总数, "correct": 正确数, "wrong": 错误数}}
}}"""

        message = self.client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024
        )

        import json
        result_text = message.choices[0].message.content
        try:
            result_json = json.loads(result_text)
        except:
            result_json = {"items": [], "summary": {"total": 0, "correct": 0, "wrong": 0}}

        return {
            "result": result_json,
            "usage": message.usage
        }
