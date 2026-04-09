# 🤖 AI英语作业检查小程序

一个基于微信小程序的AI英语作业检查工具，通过OCR识别和AI分析技术，智能检查英语作业的正确性。

## 🌟 项目特色

- **智能识别**: 准确识别手写英语内容
- **AI分析**: 深度分析英语语法和正确性  
- **实时反馈**: 即时显示分析进度和结果
- **历史追踪**: 完整的分析记录管理
- **用户友好**: 简洁的界面和操作流程

## 📱 功能演示

### 核心功能
- ✅ 上传英语作业图片（支持相册选择和相机拍摄）
- ✅ OCR文字识别（百度手写体识别API）
- ✅ AI智能分析（DeepSeek API）
- ✅ 错误标注和正确建议
- ✅ 历史记录管理
- ✅ 微信用户登录

### 技术亮点
- 🚀 微信小程序云开发架构
- 🔄 异步任务处理和进度实时更新
- 📊 批量AI分析（每批3个分段）
- ⚡ 50秒执行限制优化
- 🔒 用户权限和数据安全

## 🏗️ 技术架构

### 前端技术
- **框架**: 微信小程序原生开发
- **UI组件**: TDesign MiniProgram（腾讯设计体系）
- **状态管理**: 小程序原生数据绑定
- **图片处理**: 微信图片API和压缩算法

### 后端技术  
- **云服务**: 微信云开发（CloudBase）
- **数据库**: 云数据库（user_analysis_history, ai_analysis_results）
- **云函数**: 
  - `login` - 用户登录处理
  - `ocr-recognition` - 百度OCR文字识别
  - `ai-analysis` - DeepSeek AI分析引擎
  - `segment` - 文本分段处理
  - `result-save` - 结果保存（已修复删除权限问题）

### 第三方API
- **OCR识别**: 百度手写体文字识别API
- **AI分析**: DeepSeek Chat Completions API

## 📁 项目结构

```
xiaoju-homework-checker/
├── cloudfunctions/          # 云函数代码
│   ├── ai-analysis/       # AI分析引擎（DeepSeek API）
│   ├── ocr-recognition/   # OCR文字识别（百度API）
│   ├── result-save/       # 结果保存和历史记录管理
│   ├── login/             # 微信用户登录
│   └── segment/           # 文本分段处理
├── miniprogram/           # 小程序前端代码
│   ├── pages/             # 页面代码
│   │   ├── upload/        # 上传页面（首页）
│   │   ├── result/        # 结果展示页面
│   │   ├── history/       # 历史记录页面
│   │   ├── login/         # 登录页面
│   │   └── profile/       # 个人中心页面
│   ├── components/        # 自定义组件
│   ├── images/            # 图片资源
│   └── app.js/json/wxss   # 小程序全局配置
├── docs/                  # 项目文档
└── README.md             # 项目说明
```

## 🚀 快速开始

### 环境要求
- 微信开发者工具
- 微信小程序账号
- 云开发环境

### 安装步骤

1. **克隆项目**
```bash
git clone https://github.com/wenwenshenqihailuo/xiaoju-homework-checker.git
```

2. **导入微信开发者工具**
- 打开微信开发者工具
- 选择"导入项目"
- 选择项目目录
- 填写小程序AppID

3. **配置云开发环境**
- 开通云开发服务
- 创建云开发环境
- 在`app.js`中配置环境ID

4. **配置API密钥**
在相应的云函数中配置API密钥：
- `ocr-recognition/index.js` - 百度OCR API配置
- `ai-analysis/index.js` - DeepSeek API配置

5. **部署云函数**
- 在云函数目录右键"上传并部署：云端安装依赖"

## 🔧 核心代码示例

### OCR文字识别
```javascript
// 百度手写体OCR识别
const result = await axios.post(
  'https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting',
  params,
  { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
);
```

### AI智能分析
```javascript
// DeepSeek AI分析
const response = await axios.post(DEEPSEEK_API_URL, {
  model: "deepseek-chat",
  messages: [
    { role: "system", content: "你是一个英语作业检查专家..." },
    { role: "user", content: analysisPrompt }
  ],
  temperature: 0.3
}, {
  headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` }
});
```

### 异步任务处理
```javascript
// 实时进度更新
const interval = setInterval(async () => {
  const progress = await checkTaskStatus(taskId);
  this.setData({ progress });
  if (progress.status === 'completed') {
    clearInterval(interval);
  }
}, 1000);
```

## 📊 性能优化

- **图片压缩**: 自动压缩超过4MB的图片
- **批量处理**: 每批处理3个分段，提高成功率
- **超时处理**: 50秒执行限制，支持自调用续传
- **错误重试**: 智能错误处理和重试机制
- **缓存优化**: 合理的缓存策略减少API调用

## 🔒 安全考虑

- **API密钥保护**: 所有API密钥存储在云函数环境中
- **用户权限**: 用户只能删除自己的历史记录
- **数据验证**: 输入数据验证和清理
- **错误处理**: 完善的错误处理机制

## 🐛 已知问题

- ✅ 已修复：历史记录删除权限问题
- 🔄 待优化：大文件处理性能
- 📝 待完善：更多英语语法检查规则

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📝 更新日志

### v1.0.0 (2024-04)
- ✨ 初始版本发布
- ✅ 基础OCR识别功能
- ✅ AI智能分析功能  
- ✅ 历史记录管理
- ✅ 微信用户登录
- 🔧 修复删除权限问题

## 📞 联系方式

- 📧 邮箱：support@example.com
- 💬 微信：AIEnglishSupport
- 🐛 Issue：请使用GitHub Issues反馈问题

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

⭐ 如果这个项目对你有帮助，请给个Star支持一下！

**Made with ❤️ by AI English Checker Team**