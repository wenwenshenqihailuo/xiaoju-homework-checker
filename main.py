"""英文作业自动批改系统 - 主程序"""
import os
import argparse
from dotenv import load_dotenv
from image_recognizer import BaiduOCRRecognizer, AIVisionRecognizer
from answer_checker import AnswerChecker


def main():
    load_dotenv()

    parser = argparse.ArgumentParser(description="英文作业自动批改")
    parser.add_argument("--image", required=True, help="作业图片路径")
    parser.add_argument("--mode", default="ocr", choices=["ocr", "ai"], help="识别模式")
    args = parser.parse_args()

    if not os.path.exists(args.image):
        print(f"错误：图片文件不存在 {args.image}")
        return

    print("正在识别图片...")
    if args.mode == "ocr":
        recognizer = BaiduOCRRecognizer(
            os.getenv("BAIDU_OCR_API_KEY"),
            os.getenv("BAIDU_OCR_SECRET_KEY")
        )
    else:
        recognizer = AIVisionRecognizer(os.getenv("DEEPSEEK_API_KEY"))

    recognized_text = recognizer.recognize(args.image)
    print(f"\n识别结果：\n{recognized_text}\n")

    print("正在批改作业...")
    checker = AnswerChecker(os.getenv("DEEPSEEK_API_KEY"))
    result = checker.check(recognized_text)

    print("=" * 50)
    print("批改结果：")
    print("=" * 50)
    print(result["result"])
    print("\n完成！")


if __name__ == "__main__":
    main()
