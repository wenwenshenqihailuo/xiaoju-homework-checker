# 云函数密钥配置

为了避免把真实密钥直接写进代码仓库，项目里的敏感配置已经改成从云函数环境变量读取。

需要配置的环境变量：

- `DEEPSEEK_API_KEY`
- `BAIDU_API_KEY`
- `BAIDU_SECRET_KEY`
- `ADMIN_CLEAR_KEY`

建议：

- 在微信云开发控制台里分别给对应云函数配置环境变量。
- `DEEPSEEK_API_KEY` 配到 `ai-analysis` 云函数。
- `BAIDU_API_KEY` 和 `BAIDU_SECRET_KEY` 配到 `ocr-recognition` 云函数。
- `ADMIN_CLEAR_KEY` 配到 `ai-analysis` 云函数。
- 不要把真实密钥写回 `index.js`、`config.json`、测试截图或提交记录里。

重要：

- 如果这些 key 之前已经提交到仓库里，必须去对应平台执行“重新生成/轮换”。
- 仅仅把代码里的明文删掉，并不能让已经泄露的旧 key 自动失效。
