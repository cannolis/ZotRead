# ZotRead — 用户指南

> 把 Zotero 里堆积的未读论文按相关度排序：用你已发表的论文，或一个正在
> 探索的研究想法，作为参照。

_这份指南覆盖：安装、初次配置、日常使用、进阶功能。简短介绍参见
[README](../README.md)。_

---

## 1. 安装

需要 Zotero 7 或更新版本。

### 方式 A — 拖拽安装（推荐）

1. 从 [最新 release](https://github.com/cannolis/zotread/releases/latest)
   下载 `zot-read.xpi`。
2. Zotero 里打开 **Tools → Plugins**。
3. 把 `.xpi` 文件拖进 Plugins 窗口，点 **Install**。
4. 重启 Zotero。

### 方式 B — 从源码编译

```bash
git clone https://github.com/cannolis/zotread.git
cd zotread
npm install
npm run build
# 产物：.scaffold/build/zot-read.xpi
```

然后按方式 A 安装本地编译产物。

---

## 2. 初次配置

### 2.1 配置 LLM 接口

ZotRead 需要调用 LLM。它使用 OpenAI 标准 API 协议，凡是支持
`/v1/chat/completions` 的接口都可以。

1. 打开 **Edit → Settings → ZotRead**。
2. 在 **API key** 粘贴你的 key。
3. **API base URL** 和 **Model** 默认就行
   （`https://openrouter.ai/api/v1` + `openai/gpt-4o-mini`），最便宜的
   能跑通的组合。也可以改成：
   - **OpenAI 直连** — `https://api.openai.com/v1` + `gpt-4o-mini`
   - **Anthropic via OpenRouter** — `https://openrouter.ai/api/v1` +
     `anthropic/claude-3.5-haiku`
   - **本地 Ollama** — `http://localhost:11434/v1` + 你已经 pull 的任何
     聊天模型

> **成本说明**。默认 `gpt-4o-mini` 给一个 30 篇的库初次打分大约 $0.02。
> 之后所有重排、模式切换、anchor 调整都是 0 成本，因为 ZotRead 把每对
> 相似度都缓存进了 Zotero 的 SQLite。

### 2.2 选择排序模式

同一个设置页里，**Rank by**（排序依据）：

- **My papers (anchors)** — 用你标记为「我的论文」的几篇做参照。适合
  推进你既定的研究方向。
- **Idea text** — 用一段自由文字描述新方向作参照。适合为新想法找
  相关文献。

随时切换，**不会**重新算分 —— 缓存是按"对"存的，每个模式只是用不同
子集的对。

### 2.3 标记参照

两种方式：

**A. 把自己的论文标为 anchor**（用于"My papers"模式）：

右键你发过的某篇 → **ZotRead → 标记为「我的论文」**。

标 3-5 篇通常就够。

**B. 或者填一条研究想法**（用于"Idea text"模式）：

在 **设置 → ZotRead → 研究 Ideas** 区块：

1. 点 **新建**。
2. 填名称，例如 *小模型的机制可解释性*。
3. 粘贴一段说明这个想法的文字，几句话即可，越详细 LLM 判断越准。
4. 点 **保存** —— 自动设为激活。

可以保存多个 idea，**激活的 Idea** 下拉里切换。

### 2.4 启用列

右键主列表的列头，勾选：

- **相关度** —— 聚合分，0.00–1.00
- **状态** —— 你的已读/在读/我的论文 状态

点击列头按它排序。点 **相关度** 看最高分的未读论文。

---

## 3. 日常使用

### 3.1 触发首次打分

第一次标 anchor 或保存 idea 时，相关度列还是空的。打开
**设置 → ZotRead → 重新打分**。会有进度条显示当前在算哪一篇。算完后
列就填上了。

之后导入的新论文会**自动后台打分**（监听 Zotero 的 item 通知）。

### 3.2 看 WhyRead 面板

选中任一非 anchor 论文，右栏有个 **WhyRead** 区块（侧栏图标是
ZotRead 的 favicon）：

- **判定** —— 五档之一：
  - 🔥 高度相关 · 建议精读 (≥ 0.7)
  - ✅ 相关 · 值得一读 (≥ 0.5)
  - 💡 略有关联 · 随便看看 (≥ 0.3)
  - ⏭ 基本无关 · 可跳过 (< 0.3)
- **最相关的你的论文**（或 **最贴近你的研究想法**）—— 跟当前论文
  最像的那个 anchor。
- **相似度** —— 聚合 top-3 mean（与列里数字一致）。
- **判断依据** —— LLM 给出的一句话理由（针对最相似的 anchor）。
- **对每篇参照的打分** —— 当前论文跟所有激活 anchor 的逐一相似度，
  各带理由。

面板语言默认跟随 Zotero 的语言。可在
**设置 → WhyRead 显示语言** 强制切换。

### 3.3 管理已读状态

右键论文 → **ZotRead** 子菜单：

- **标记为已读**
- **标记为在读**
- **重置为未读**

状态和分数**独立存储**，所以你可以**主排序按相关度**，**次排序按状态**
（或反过来）。

### 3.4 切换排序模式

设置里改 **Rank by**。列**立刻**从缓存重填，不调 LLM、不等待。
切回去也用已缓存的。

### 3.5 切换激活 idea

在 **Rank by = Idea text** 模式下，用设置里的 **激活的 Idea** 下拉
切换不同 idea。第一次切到某个新 idea 时要算它的对所有候选的相似度
（每篇一次 LLM 调用），有进度条。之后再切就秒回。

---

## 4. 进阶

### 4.1 何时会调 LLM

ZotRead 只在必要时才调用。具体规则：

| 事件 | LLM 调用次数 |
|---|---|
| 新论文加入库 | 1 次 summary + 每个激活 anchor 各 1 次 |
| 加 anchor | 1 次 summary + 每个候选各 1 次 |
| 删 anchor | 0（缓存按对存的，不删） |
| 修改 idea 文本 | 1 次 summary + 每个候选各 1 次（仅这个 idea） |
| 第一次激活某 idea | 1 次 summary + 每个候选各 1 次 |
| 改已读/在读 状态 | 0 |
| 切换排序模式 | 0 |
| 改设置里的模型 | **全部** —— 缓存键包含模型名 |

### 4.2 手动维护

设置 → ZotRead → **维护** 区：

- **重新打分** —— 跟自动相同，按需触发。改了 idea 或一次加多个
  anchor 后用得上。
- **清空相似度缓存** —— 删除所有 summary 和 similarity。下次打分
  从头算。换模型或者怀疑数据有问题时用。

### 4.3 JavaScript API

Tools → Developer → Run JavaScript 里可以用：

```javascript
// LLM 连通测试
await Zotero.ZotRead.api.ping()
// => true

// arXiv 批量导入
await Zotero.ZotRead.api.importArxiv(["1706.03762", "2005.14165"])

// Idea CRUD
await Zotero.ZotRead.api.listIdeas()
await Zotero.ZotRead.api.createIdea("名称", "正文")
await Zotero.ZotRead.api.setActiveIdea(3)

// 打分
await Zotero.ZotRead.api.rescoreAll({ onProgress: console.log })
await Zotero.ZotRead.api.scoreOf(42)
await Zotero.ZotRead.api.clearAllCache()

// Anchor 管理
await Zotero.ZotRead.api.markAnchor(42, "我的硕士论文")
await Zotero.ZotRead.api.getAnchors()

// 状态
await Zotero.ZotRead.api.markStatus(42, "read")
```

### 4.4 评分 Rubric

成对相似度都来自这套固定 11 档。LLM 被强制只能选这些值：

| 值 | 含义 |
|---|---|
| 1.0 | 几乎重复 —— 同一篇或直接续作 |
| 0.9 | 紧密延续 —— 同问题同方法的小变体 |
| 0.8 | 同问题 + 紧密相关方法 |
| 0.7 | 同问题家族，方法不同 |
| 0.6 | 不同问题但方法论高度共享 |
| 0.5 | 共享理论基础，应用场景不同 |
| 0.4 | 邻近子领域，概念有些重叠 |
| 0.3 | 远但同一大领域 |
| 0.2 | 只是关键词表面重合 |
| 0.1 | 仅 token 重叠，研究内容无关 |
| 0.0 | 完全无关 |

列里显示的是 **top-3 mean**，所以会出现 0.567 这种小数 —— 单对分数
是离散的，但聚合后是连续的。

---

## 5. 故障排查

### 列里全是空 / 没有分数

- 检查 **设置 → ZotRead → API key** 是否填了。
- 至少要有一个 anchor 或一个激活的 idea。
- 点 **重新打分**。

### Rate limit / 429 错误

- 插件已经做了指数退避重试（3s → 10s → 30s）。仍失败的话查你 LLM
  服务商的速率限额面板。
- 临时减少 anchor 数量也能减小并发压力。

### 分数对不上

每次 ZotRead rubric 升级时：

- 启动时插件会自动检测版本变化，删旧分数，后台重算。看进度条即可。
- 想强制全清重算：设置 → **清空相似度缓存** → **重新打分**。

### WhyRead 显示的语言不对

设置 → WhyRead 显示语言 → 选 **跟随 Zotero** / **English** / **中文**。

### "API key not set" 提示一直弹

设置 → ZotRead → 粘贴 key。可以去
[OpenRouter](https://openrouter.ai/keys) 注册免费 key，$1 试用额度
够给几千篇论文打分。

---

## 6. 隐私

每次 LLM 调用会发送到你配置的服务商：

- 候选论文的 title / 作者 / 年份 / abstract，以及（如果有附件 PDF）
  正文前几页
- 当前激活的所有 anchor 论文的缓存 summary（结构化 JSON）
- 你的 idea 文本（仅在 Idea 模式）

**不会发往 ZotRead 自己的任何服务器** —— 这是个纯本地 Zotero 插件，
不是托管服务。如果你想完全本地化，把 base URL 指到本地的 Ollama 或
LM Studio 即可。

所有 score / summary / status / anchor 信息都存在你 Zotero 的本地
SQLite（`~/Zotero/zotero.sqlite` 或你自定义的数据目录）。**不会**
通过 Zotero 云同步上传，除非你的 data dir 本身在网盘上。

---

## 7. 卸载

**Tools → Plugins → ZotRead → Remove**。

插件创建的 DB 表（`zotread_*`）会留在 `zotero.sqlite` 里但不会再被
访问。彻底清理的话，卸载前先在 Tools → Developer → Run JavaScript：

```javascript
await Zotero.ZotRead.api.clearAllCache();
```

然后正常 Remove。
