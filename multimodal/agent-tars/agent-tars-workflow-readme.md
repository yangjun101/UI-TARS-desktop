# Agent-TARS 工作流程分析

## 概述

Agent-TARS 是一个多模态 AI Agent 框架，能够协调 LLM 和各种工具来完成复杂任务。本文档详细分析了当用户输入"介绍下H20和H100的价格以及性能参数"时，Agent 是如何协调 LLM 和 tools 一起工作的。

## 目录

1. [系统架构概览](#系统架构概览)
2. [CLI 参数配置](#cli-参数配置)
3. [初始化阶段](#初始化阶段)
4. [LLM 推理与工具选择](#llm-推理与工具选择)
5. [工具调用执行流程](#工具调用执行流程)
6. [浏览器工具协调](#浏览器工具协调)
7. [迭代执行循环](#迭代执行循环)
8. [信息整合与输出](#信息整合与输出)
9. [核心协调机制](#核心协调机制)
10. [代码示例](#代码示例)
11. [总结](#总结)

---

## 系统架构概览

Agent-TARS 采用分层架构设计，主要包含以下核心组件：

### 核心类层次结构
```
Agent (基础类)
  ↓
MCPAgent (MCP协议支持)
  ↓
AgentTARS (具体实现)
```

### 主要组件
- **AgentTARS**: 主要的 Agent 实现类
- **BrowserManager**: 浏览器实例管理
- **SearchToolProvider**: 搜索工具提供者
- **BrowserToolsManager**: 浏览器工具管理器
- **ToolProcessor**: 工具调用处理器
- **LLMProcessor**: LLM 请求处理器
- **AgentRunner**: Agent 执行协调器

---

## CLI 参数配置

Agent-TARS 提供了丰富的命令行参数来控制系统的各个方面。以下是几个核心参数的详细说明：

### 1. `--browser.control` 参数

**作用**: 控制浏览器的操作模式，决定 Agent 如何与网页进行交互

**可选值**:
- `hybrid` (默认): 混合模式，结合 DOM 分析和视觉定位两种方式
- `dom`: 基于 DOM 的元素识别和交互方式
- `visual-grounding`: 使用视觉语言模型从截图中识别和定位 UI 元素

**技术实现**:
```typescript
// 在 AgentTARS.initialize() 中根据控制模式初始化不同的工具
const control = this.tarsOptions.browser?.control || 'hybrid';

if (control !== 'dom') {
  // 初始化 GUI Agent (视觉控制)
  await this.initializeGUIAgent();
}

// 注册对应的浏览器工具
this.browserToolsManager = new BrowserToolsManager(this.logger, control);
```

**使用示例**:
```bash
# 使用混合模式 (推荐)
agent-tars --browser.control hybrid

# 仅使用 DOM 操作
agent-tars --browser.control dom

# 仅使用视觉定位
agent-tars --browser.control visual-grounding
```

**影响的工具集**:
- `hybrid`: 同时提供 DOM 工具 (`browser_click`, `browser_type`) 和视觉工具 (`browser_vision_control`)
- `dom`: 仅提供 DOM 相关的浏览器工具
- `visual-grounding`: 主要使用视觉控制工具进行页面交互

### 2. `--planner.enable` 参数

**作用**: 启用规划功能，用于处理复杂的多步骤任务

**类型**: 布尔标志参数（无需值）

**技术实现**:
```typescript
// 在配置中启用规划器
export interface AgentTARSPlannerOptions {
  enable?: boolean;        // 是否启用规划功能
  maxSteps?: number;       // 最大规划步骤数 (默认 3)
  planningPrompt?: string; // 自定义规划提示词
}

// 系统提示词中会包含规划相关的指令
if (this.tarsOptions.planner?.enable) {
  systemPrompt += `
  
<planning_rules>
You have access to advanced planning capabilities for complex tasks:

1. **Task Decomposition**: Break down complex requests into manageable steps
2. **Sequential Execution**: Execute steps in logical order with dependencies
3. **Progress Tracking**: Monitor completion status of each step
4. **Adaptive Planning**: Adjust plans based on intermediate results

When handling complex tasks:
- First analyze the task complexity
- Create a structured plan if needed
- Execute steps systematically
- Validate results at each step
</planning_rules>`;
}
```

**使用示例**:
```bash
# 启用规划功能
agent-tars --planner.enable

# 在配置文件中设置
export default defineConfig({
  planner: {
    enable: true,
    maxSteps: 5,
    planningPrompt: "Focus on data accuracy and comprehensive analysis"
  }
});
```

**适用场景**:
- 多网站信息收集和对比分析
- 复杂的数据处理和报告生成
- 需要多步骤验证的任务
- 跨平台信息整合

### 3. `--toolCallEngine` 参数

**作用**: 指定工具调用引擎的类型，影响 LLM 如何执行工具调用

**可选值**:
- `native`: 使用模型原生的工具调用功能
- `prompt_engineering`: 使用提示工程方式进行工具调用
- `structured_outputs`: 使用结构化输出方式

**技术实现**:
```typescript
// 在 LLM 请求处理中根据引擎类型调整调用方式
class LLMProcessor {
  async processLLMRequest(messages, tools, sessionId, abortSignal) {
    const toolCallEngine = this.agent.options.toolCallEngine;
    
    switch (toolCallEngine) {
      case 'native':
        // 使用模型原生工具调用 API
        return await this.callWithNativeTools(messages, tools);
        
      case 'prompt_engineering':
        // 将工具描述嵌入到提示词中
        return await this.callWithPromptEngineering(messages, tools);
        
      case 'structured_outputs':
        // 使用结构化输出格式
        return await this.callWithStructuredOutputs(messages, tools);
    }
  }
}
```

**使用示例**:
```bash
# 使用原生工具调用 (性能最佳)
agent-tars --toolCallEngine native

# 使用提示工程 (兼容性最佳)
agent-tars --toolCallEngine prompt_engineering

# 使用结构化输出
agent-tars --toolCallEngine structured_outputs
```

**选择建议**:
- **`native`**: 适用于 OpenAI GPT-4、Claude 3.5 等支持原生工具调用的模型
- **`prompt_engineering`**: 适用于 AWS Bedrock、某些开源模型等不完全支持原生工具调用的场景
- **`structured_outputs`**: 适用于需要严格输出格式控制的场景

### 4. 其他重要参数

**浏览器相关**:
```bash
# CDP 端点配置 (用于连接现有浏览器实例)
agent-tars --browser.cdpEndpoint "http://127.0.0.1:9222/json/version"

# 浏览器无头模式
agent-tars --browser.headless
```

**搜索相关**:
```bash
# 搜索提供商
agent-tars --search.provider tavily --search.apiKey "your-api-key"

# 搜索结果数量
agent-tars --search.count 15
```

**模型相关**:
```bash
# 指定模型提供商和模型
agent-tars --model.provider bedrock --model.id "us.anthropic.claude-3-7-sonnet-20250219-v1:0"

# API 密钥
agent-tars --model.apiKey "your-api-key"
```

### 5. 参数组合最佳实践

**高性能配置** (适用于支持原生工具调用的模型):
```bash
agent-tars \
  --model.provider openai \
  --model.id gpt-4o-2024-11-20 \
  --toolCallEngine native \
  --browser.control hybrid \
  --planner.enable
```

**高兼容性配置** (适用于 Bedrock 等平台):
```bash
agent-tars \
  --model.provider bedrock \
  --model.id us.anthropic.claude-3-7-sonnet-20250219-v1:0 \
  --toolCallEngine prompt_engineering \
  --browser.control hybrid \
  --planner.enable
```

**轻量级配置** (适用于简单任务):
```bash
agent-tars \
  --model.provider volcengine \
  --model.id doubao-1.5-thinking-vision-pro \
  --toolCallEngine prompt_engineering \
  --browser.control dom
```

这些参数的合理配置直接影响 Agent 的执行效率、兼容性和功能完整性。在实际使用中，建议根据具体的模型能力、任务复杂度和性能要求来选择合适的参数组合。

---

## 初始化阶段

### 1. 配置加载

Agent-TARS 首先加载配置文件 `agent-tars.config.ts`：

```typescript
export default defineConfig({
  maxTokens: 16384,
  model: {
    id: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
    provider: 'bedrock',
    providers: [
      {
        name: 'bedrock',
        region: process.env.AWS_REGION || 'us-east-1',
        // AWS 凭证配置
      }
    ],
  },
  toolCallEngine: 'native',
})
```

### 2. 组件初始化

在 `AgentTARS.initialize()` 方法中：

```typescript
async initialize(): Promise<void> {
  // 1. 初始化浏览器组件
  this.browserToolsManager = new BrowserToolsManager(this.logger, control);
  this.browserToolsManager.setBrowserManager(this.browserManager);

  // 2. 初始化 GUI Agent（如果需要）
  if (control !== 'dom') {
    await this.initializeGUIAgent();
  }

  // 3. 初始化搜索工具
  await this.initializeSearchTools();

  // 4. 初始化内存中的 MCP 服务器
  if (this.tarsOptions.mcpImpl === 'in-memory') {
    await this.initializeInMemoryMCPForBuiltInMCPServers();
  }
}
```

### 3. 工具注册

系统注册多种类型的工具：

- **搜索工具**: `web_search`
- **浏览器导航工具**: `browser_navigate`, `browser_back`, `browser_forward`
- **浏览器内容工具**: `browser_get_markdown`, `browser_screenshot`
- **浏览器交互工具**: `browser_click`, `browser_type`, `browser_scroll`
- **文件系统工具**: `read_file`, `write_file`, `list_directory`
- **命令行工具**: `run_command`

---
## LLM 推理与工具选择

### 1. 系统提示词构建

Agent-TARS 构建了详细的系统提示词来指导 LLM 的行为：

```typescript
const systemPrompt = `${DEFAULT_SYSTEM_PROMPT}
${browserRules}
<environment>
Current Working Directory: ${workspace}
</environment>`;
```

**核心提示词内容包括：**

- **角色定义**: "You are Agent TARS, a multimodal AI agent created by the ByteDance"
- **能力描述**: 信息收集、数据处理、网站创建、编程解决问题等
- **工具使用规则**: 浏览器工具、文件工具、Shell 规则等
- **工作流程**: Agent 循环的详细步骤

### 2. 浏览器控制策略

根据配置的浏览器控制模式，生成相应的规则：

```typescript
// 混合模式 (hybrid) 的规则示例
browserRules += `
You have a hybrid browser control strategy with two complementary tool sets:

1. Vision-based control (browser_vision_control): 
   - Use for visual interaction with web elements
   - Best for complex UI interactions

2. DOM-based utilities (browser_*):
   - browser_navigate, browser_get_markdown for content extraction
   - browser_click, browser_type for DOM interactions

INFORMATION GATHERING WORKFLOW:
1. Navigate to relevant page
2. Extract complete content with browser_get_markdown
3. Use browser_vision_control if needed for more content
4. Repeat until all necessary information is collected
`;
```

### 3. 用户请求分析

当用户输入"介绍下H20和H100的价格以及性能参数"时，LLM 进行以下分析：

1. **任务识别**: 信息收集和对比分析任务
2. **所需信息**: H20 和 H100 GPU 的价格和性能参数
3. **执行策略**: 需要搜索 → 访问网站 → 提取内容 → 整合信息
4. **工具选择**: 首先选择 `web_search` 工具

---

## 工具调用执行流程

### 1. 工具调用生成

LLM 根据分析结果生成工具调用：

```json
{
  "name": "web_search",
  "arguments": {
    "query": "H20 H100 GPU price performance comparison",
    "count": 10
  }
}
```

### 2. 工具调用处理流程

**ToolProcessor.processToolCalls() 执行步骤：**

```typescript
async processToolCalls(toolCalls, sessionId, abortSignal) {
  for (const toolCall of toolCalls) {
    // 1. 解析工具调用参数
    let args = JSON.parse(toolCall.function.arguments || '{}');
    
    // 2. 调用前置钩子 (可以修改参数)
    args = await this.agent.onBeforeToolCall(sessionId, toolCall, args);
    
    // 3. 发送工具调用事件
    const toolCallEvent = this.eventStream.createEvent('tool_call', {
      toolCallId: toolCall.id,
      name: toolCall.function.name,
      arguments: args,
      startTime: Date.now(),
    });
    
    // 4. 执行工具函数
    const { result, executionTime, error } = await this.executeTool(
      toolCall.function.name,
      toolCall.id,
      args
    );
    
    // 5. 调用后置钩子 (可以修改结果)
    const processedResult = await this.agent.onAfterToolCall(
      sessionId, 
      toolCall, 
      result
    );
    
    // 6. 发送工具结果事件
    const toolResultEvent = this.eventStream.createEvent('tool_result', {
      toolCallId: toolCall.id,
      name: toolCall.function.name,
      content: processedResult,
      elapsedMs: executionTime,
      error: error,
    });
  }
}
```

### 3. 搜索工具执行

**SearchToolProvider 内部执行：**

```typescript
// 创建搜索工具
createSearchTool(): Tool {
  return new Tool({
    id: 'web_search',
    description: 'Search the web for information...',
    function: async ({ query, count }) => {
      // 使用 SearchClient 执行搜索
      const results = await this.searchClient.search({
        query,
        count: count || this.config.count,
      });
      
      // 返回搜索结果页面列表
      return results.pages;
    },
  });
}
```

**搜索结果示例：**
```json
[
  {
    "url": "https://www.nvidia.com/en-us/data-center/h100/",
    "title": "NVIDIA H100 Tensor Core GPU",
    "snippet": "The NVIDIA H100 Tensor Core GPU delivers exceptional performance..."
  },
  {
    "url": "https://www.nvidia.com/en-us/data-center/h20/",
    "title": "NVIDIA H20 GPU for China Market",
    "snippet": "NVIDIA H20 is designed specifically for the Chinese market..."
  }
]
```

---

## 浏览器工具协调

### 1. 懒加载浏览器初始化

当 LLM 选择使用浏览器工具时，`onBeforeToolCall` 钩子会触发浏览器的懒加载：

```typescript
// AgentTARS.onBeforeToolCall()
async onBeforeToolCall(id, toolCall, args) {
  if (toolCall.name.startsWith('browser')) {
    // 检查浏览器是否已启动
    if (!this.browserManager.isLaunchingComplete()) {
      if (!this.isReplaySnapshot) {
        // 启动浏览器
        await this.browserManager.launchBrowser({
          headless: this.tarsOptions.browser?.headless,
          cdpEndpoint: this.tarsOptions.browser?.cdpEndpoint,
        });
      }
    }
  }
  
  // 解析工作区路径
  if (this.workspacePathResolver.hasPathParameters(toolCall.name)) {
    return this.workspacePathResolver.resolveToolPaths(toolCall.name, args);
  }
  
  return args;
}
```

### 2. 浏览器导航

LLM 选择访问搜索结果中的网站：

```json
{
  "name": "browser_navigate",
  "arguments": {
    "url": "https://www.nvidia.com/en-us/data-center/h100/"
  }
}
```

**导航工具实现：**

```typescript
// createNavigationTools() 中的实现
const navigateTool = new Tool({
  id: 'browser_navigate',
  description: '[browser] Navigate to a URL',
  function: async ({ url }) => {
    const browser = browserManager.getBrowser();
    const page = await browser.getActivePage();
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    return {
      status: 'success',
      url: page.url(),
      title: await page.title(),
    };
  },
});
```

### 3. 内容提取

导航完成后，LLM 调用内容提取工具：

```json
{
  "name": "browser_get_markdown",
  "arguments": {
    "page": 1
  }
}
```

**内容提取工具实现：**

```typescript
// createContentTools() 中的实现
const getMarkdownTool = new Tool({
  id: 'browser_get_markdown',
  description: '[browser] Get the content of the current page as markdown',
  function: async ({ page = 1 }) => {
    const browser = browserManager.getBrowser();
    const browserPage = await browser.getActivePage();
    
    // 使用分页内容提取器
    const result = await contentExtractor.extractContent(browserPage, page);
    
    return {
      content: result.content,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        hasMorePages: result.hasMorePages,
      },
      title: result.title,
    };
  },
});
```

### 4. 混合控制策略

Agent-TARS 使用混合控制策略，结合 DOM 操作和视觉控制：

```typescript
// BrowserHybridStrategy.registerTools()
async registerTools(registerToolFn) {
  // 1. 注册 GUI Agent 工具 (视觉控制)
  if (this.browserGUIAgent) {
    const guiAgentTool = this.browserGUIAgent.getTool();
    registerToolFn(guiAgentTool);
  }

  // 2. 注册自定义工具 (导航、内容、视觉)
  if (this.browserManager) {
    const contentTools = createContentTools(this.logger, this.browserManager);
    const navigationTools = createNavigationTools(this.logger, this.browserManager);
    const visualTools = createVisualTools(this.logger, this.browserManager);
    
    [...navigationTools, ...contentTools, ...visualTools].forEach((tool) => {
      registerToolFn(tool);
    });
  }

  // 3. 注册 MCP 浏览器工具 (DOM 交互)
  if (this.browserClient) {
    const browserTools = [
      'browser_click', 'browser_form_input_fill', 'browser_press_key',
      'browser_hover', 'browser_scroll', 'browser_select',
      'browser_get_clickable_elements', 'browser_read_links',
      'browser_tab_list', 'browser_new_tab', 'browser_close_tab',
      'browser_switch_tab', 'browser_evaluate',
    ];
    
    await this.registerMCPBrowserTools(registerToolFn, browserTools);
  }
}
```

---

## 迭代执行循环

### 1. Agent 循环控制

**AgentRunner 中的主循环：**

```typescript
// LoopExecutor.executeLoop()
for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
  // 1. 调用循环开始钩子
  await this.agent.onEachAgentLoopStart(sessionId);
  
  // 2. LLM 推理处理
  const response = await this.llmProcessor.processLLMRequest(
    messages,
    tools,
    sessionId,
    abortSignal
  );
  
  // 3. 检查是否有工具调用
  if (response.tool_calls && response.tool_calls.length > 0) {
    // 4. 执行工具调用
    const toolResults = await this.toolProcessor.processToolCalls(
      response.tool_calls,
      sessionId,
      abortSignal
    );
    
    // 5. 将工具结果添加到消息历史
    messages.push(...this.formatToolResults(toolResults));
    
    // 6. 继续下一轮循环
    continue;
  } else {
    // 7. 没有工具调用，循环结束
    break;
  }
}
```

### 2. 循环开始钩子

每次循环开始时，Agent 会执行特定的初始化操作：

```typescript
// AgentTARS.onEachAgentLoopStart()
async onEachAgentLoopStart(sessionId) {
  // 如果启用了 GUI Agent 且浏览器已启动，截取屏幕截图
  if (
    this.tarsOptions.browser?.control !== 'dom' &&
    this.browserGUIAgent &&
    this.browserManager.isLaunchingComplete()
  ) {
    // 确保 GUI Agent 可以访问当前事件流
    if (this.browserGUIAgent.setEventStream) {
      this.browserGUIAgent.setEventStream(this.eventStream);
    }

    // 截取屏幕截图并发送到事件流
    await this.browserGUIAgent?.onEachAgentLoopStart(
      this.eventStream, 
      this.isReplaySnapshot
    );
  }

  await super.onEachAgentLoopStart(sessionId);
}
```

### 3. 典型的执行序列

对于"介绍下H20和H100的价格以及性能参数"这个请求，典型的执行序列如下：

```
第1轮循环:
  LLM推理 → web_search("H20 H100 GPU price") → 返回搜索结果

第2轮循环:
  LLM推理 → browser_navigate("https://nvidia.com/h100") → 导航成功

第3轮循环:
  LLM推理 → browser_get_markdown() → 提取H100页面内容

第4轮循环:
  LLM推理 → browser_navigate("https://nvidia.com/h20") → 导航到H20页面

第5轮循环:
  LLM推理 → browser_get_markdown() → 提取H20页面内容

第6轮循环:
  LLM推理 → web_search("H20 H100 price comparison") → 搜索价格对比

第7轮循环:
  LLM推理 → browser_navigate("价格对比网站") → 访问价格信息

第8轮循环:
  LLM推理 → browser_get_markdown() → 提取价格信息

第9轮循环:
  LLM推理 → write_file("H20_H100_comparison.md") → 生成对比报告

第10轮循环:
  LLM推理 → 没有工具调用 → 循环结束，返回最终回答
```

---

## 信息整合与输出

### 1. 信息收集完成

当 LLM 收集到足够的信息后，会进入整合阶段：

1. **分析收集的数据**: 来自多个网站的 H20 和 H100 信息
2. **结构化整理**: 按照价格、性能参数等维度组织信息
3. **生成对比报告**: 根据系统提示词中的写作规则生成详细报告

### 2. 创建交付物

根据系统提示词中的 `<report_rules>`，Agent 会自动创建交付文件：

```json
{
  "name": "write_file",
  "arguments": {
    "path": "H20_H100_GPU_对比分析报告.md",
    "content": "# H20 vs H100 GPU 详细对比分析报告\n\n## 概述\n\n本报告详细对比了NVIDIA H20和H100两款GPU的价格和性能参数...\n\n## 价格分析\n\n### H100 定价\n- 官方建议零售价: $25,000 - $40,000\n- 云服务定价: $2.04/小时 (AWS p4d实例)\n\n### H20 定价\n- 中国市场专供价格: $12,000 - $15,000\n- 相比H100价格降低约50%\n\n## 性能参数对比\n\n### 计算性能\n| 参数 | H100 | H20 |\n|------|------|-----|\n| FP32性能 | 67 TFLOPS | 22 TFLOPS |\n| Tensor性能 | 1979 TOPS | 296 TOPS |\n| 内存带宽 | 3.35 TB/s | 1.2 TB/s |\n\n### 详细分析\n\nH100作为NVIDIA的旗舰数据中心GPU，在各项性能指标上都显著领先于H20。H100采用了最新的Hopper架构，配备了80GB的HBM3内存，提供了卓越的AI训练和推理性能...\n\nH20是NVIDIA专门为中国市场设计的产品，在符合出口管制要求的同时，仍然提供了强大的AI计算能力。虽然性能相比H100有所降低，但价格更加亲民...\n\n## 应用场景建议\n\n### H100 适用场景\n- 大规模语言模型训练\n- 高性能科学计算\n- 实时AI推理服务\n\n### H20 适用场景\n- 中小规模AI模型训练\n- 企业级AI应用开发\n- 成本敏感的AI项目\n\n## 总结\n\nH100和H20各有其定位和优势。H100代表了当前AI计算的最高水平，适合对性能有极致要求的应用场景。H20则在性能和成本之间找到了平衡点，为更多企业和开发者提供了AI计算的可能性...\n\n## 参考资料\n\n1. NVIDIA H100 官方技术规格 - https://www.nvidia.com/en-us/data-center/h100/\n2. NVIDIA H20 产品介绍 - https://www.nvidia.com/en-us/data-center/h20/\n3. GPU性能对比数据 - 各大云服务商定价页面\n4. 行业分析报告 - 相关技术媒体报道\n"
  }
}
```

### 3. 最终响应

创建完交付文件后，LLM 会生成最终的用户响应：

```
我已经为您详细调研了H20和H100 GPU的价格和性能参数，并生成了一份完整的对比分析报告。

## 主要发现：

**价格对比：**
- H100: $25,000-$40,000 (云服务 $2.04/小时)
- H20: $12,000-$15,000 (价格降低约50%)

**性能对比：**
- H100在所有性能指标上都显著领先
- H20性能约为H100的30-40%，但价格更亲民

**应用建议：**
- H100适合大规模AI训练和高性能计算
- H20适合中小规模项目和成本敏感场景

详细的对比分析报告已保存为 `H20_H100_GPU_对比分析报告.md`，包含了完整的技术规格、价格分析、性能测试数据和应用场景建议。您可以查看该文件获取更详细的信息。
```

---

## 核心协调机制

### 1. 事件驱动架构

Agent-TARS 使用事件流来协调各个组件：

```typescript
// 事件类型示例
interface AgentEventStream {
  'agent_run_start': { sessionId: string; options: any };
  'tool_call': { toolCallId: string; name: string; arguments: any };
  'tool_result': { toolCallId: string; content: any; elapsedMs: number };
  'llm_request': { messages: any[]; model: string };
  'llm_response': { content: string; toolCalls?: any[] };
  'agent_run_end': { sessionId: string; status: AgentStatus };
}
```

### 2. 钩子机制

Agent 提供了多个钩子点来实现自定义逻辑：

```typescript
// 主要钩子方法
class AgentTARS {
  // 工具调用前处理
  async onBeforeToolCall(id, toolCall, args) {
    // 浏览器懒加载、路径解析等
  }
  
  // 工具调用后处理
  async onAfterToolCall(id, toolCall, result) {
    // 结果后处理、状态更新等
  }
  
  // 每轮循环开始
  async onEachAgentLoopStart(sessionId) {
    // 截图、状态初始化等
  }
  
  // LLM 请求前处理
  onLLMRequest(id, payload) {
    // 请求日志记录等
  }
  
  // LLM 响应后处理
  onLLMResponse(id, payload) {
    // 响应日志记录等
  }
}
```

### 3. 状态管理

**浏览器状态管理：**

```typescript
// BrowserManager 单例模式
class BrowserManager {
  private static instance: BrowserManager;
  private browser?: LocalBrowser | RemoteBrowser;
  private launchPromise?: Promise<void>;
  
  // 懒加载浏览器
  async launchBrowser(options) {
    if (!this.launchPromise) {
      this.launchPromise = this.doLaunchBrowser(options);
    }
    return this.launchPromise;
  }
  
  // 检查浏览器状态
  async isBrowserAlive(autoRecover = false) {
    // 检查并自动恢复浏览器
  }
}
```

**工具状态管理：**

```typescript
// ToolManager 管理注册的工具
class ToolManager {
  private tools: Map<string, Tool> = new Map();
  
  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }
  
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }
}
```

### 4. 错误处理与恢复

**工具调用错误处理：**

```typescript
async executeTool(toolName, toolCallId, args) {
  try {
    const result = await tool.function(args);
    return { result, executionTime, error: undefined };
  } catch (error) {
    this.logger.error(`Tool execution failed: ${toolName}`, error);
    return {
      result: `Error: ${error.message}`,
      executionTime: 0,
      error: error.message,
    };
  }
}
```

**浏览器恢复机制：**

```typescript
async onBeforeToolCall(id, toolCall, args) {
  if (toolCall.name.startsWith('browser')) {
    // 检查浏览器是否存活
    const isAlive = await this.browserManager.isBrowserAlive(true);
    
    if (!isAlive && !this.isReplaySnapshot) {
      // 尝试恢复浏览器
      const recovered = await this.browserManager.recoverBrowser();
      if (!recovered) {
        this.logger.error('Browser recovery failed');
      }
    }
  }
}
```

### 5. 性能优化

**并行工具调用：**

```typescript
// 支持并行执行多个工具调用
const toolCallResults = await Promise.all(
  toolCalls.map(toolCall => this.executeTool(toolCall))
);
```

**资源复用：**

```typescript
// 浏览器实例复用
const sharedBrowser = this.browserManager.getBrowser();

// MCP 服务器复用
this.mcpServers = {
  browser: browserModule.createServer({
    externalBrowser: sharedBrowser,  // 复用浏览器实例
  }),
  filesystem: filesystemModule.createServer({
    allowedDirectories: [this.workspace],
  }),
};
```

---

## 代码示例

### 1. 完整的工具调用示例

```typescript
// 用户输入处理
const userInput = "介绍下H20和H100的价格以及性能参数";

// Agent 执行
const agent = new AgentTARS({
  model: {
    provider: 'bedrock',
    id: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
  },
  browser: {
    control: 'hybrid',
    headless: false,
  },
  search: {
    provider: 'browser_search',
    count: 10,
  },
});

await agent.initialize();

// 执行用户请求
const result = await agent.run({
  input: userInput,
  sessionId: 'user-session-123',
});

console.log(result.content);
```

### 2. 自定义工具注册示例

```typescript
// 注册自定义工具
const customTool = new Tool({
  id: 'gpu_price_checker',
  description: 'Check GPU prices from multiple sources',
  parameters: z.object({
    gpuModel: z.string().describe('GPU model name'),
    sources: z.array(z.string()).optional().describe('Price sources to check'),
  }),
  function: async ({ gpuModel, sources = ['nvidia', 'amazon', 'newegg'] }) => {
    const prices = [];
    
    for (const source of sources) {
      // 实现价格检查逻辑
      const price = await checkPriceFromSource(source, gpuModel);
      prices.push({ source, price });
    }
    
    return {
      gpuModel,
      prices,
      averagePrice: prices.reduce((sum, p) => sum + p.price, 0) / prices.length,
    };
  },
});

agent.registerTool(customTool);
```

### 3. 事件监听示例

```typescript
// 监听 Agent 事件
agent.eventStream.subscribe((event) => {
  switch (event.type) {
    case 'tool_call':
      console.log(`🔧 调用工具: ${event.name}`);
      console.log(`📝 参数: ${JSON.stringify(event.arguments)}`);
      break;
      
    case 'tool_result':
      console.log(`✅ 工具完成: ${event.name}`);
      console.log(`⏱️ 耗时: ${event.elapsedMs}ms`);
      break;
      
    case 'llm_request':
      console.log(`🧠 LLM 请求: ${event.model}`);
      break;
      
    case 'llm_response':
      console.log(`💭 LLM 响应: ${event.content.substring(0, 100)}...`);
      break;
  }
});
```

---

## 总结

Agent-TARS 通过精心设计的架构实现了 LLM 和工具的高效协调：

### 🎯 核心优势

1. **智能工具选择**: LLM 根据详细的系统提示词智能选择最合适的工具
2. **混合控制策略**: 结合 DOM 操作和视觉控制，提供最佳的网页交互能力
3. **懒加载机制**: 资源按需加载，提高系统效率
4. **事件驱动架构**: 通过事件流实现组件间的松耦合协调
5. **强大的钩子系统**: 提供多个扩展点，支持自定义逻辑
6. **完善的错误处理**: 包含自动恢复和重试机制
7. **状态管理**: 统一管理浏览器、工具等资源状态

### 🔄 工作流程总结

```
用户输入 → LLM分析 → 工具选择 → 工具执行 → 结果处理 → 状态更新 → 循环继续 → 最终输出
    ↑                                                                    ↓
    └─────────────────── 迭代循环 (最多10轮) ──────────────────────────────┘
```

### 🚀 技术亮点

- **多模态支持**: 支持文本、图像等多种输入类型
- **工具生态**: 丰富的内置工具和易于扩展的工具系统
- **云原生**: 支持多种 LLM 提供商和部署方式
- **开发友好**: 完善的日志、调试和监控功能

Agent-TARS 为构建复杂的 AI Agent 应用提供了一个强大而灵活的框架，能够处理从简单的信息查询到复杂的多步骤任务执行等各种场景。
