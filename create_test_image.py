"""创建测试图片"""
from PIL import Image, ImageDraw, ImageFont

# 创建白色背景图片
img = Image.new('RGB', (800, 600), color='white')
draw = ImageDraw.Draw(img)

# 模拟听写作业内容
text = """English Dictation Test

1. apple - 苹果
2. book - 书
3. cat - 猫
4. dog - 狗
5. hello - 你好
"""

# 绘制文字
draw.text((50, 50), text, fill='black')

# 保存图片
img.save('test_homework.jpg')
print("测试图片已创建: test_homework.jpg")
