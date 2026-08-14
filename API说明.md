# 办公工作台 · 对外 API 说明

办公工作台（窗口版 exe）内置一个本地 HTTP 服务，外部软件可通过 HTTP 接口读取**本周完成清单**与**复盘文本**。接口返回的数据由应用整理成结构化 JSON，或进一步整理成 Markdown / 纯文本文档，方便直接归档或转发到其它系统。

## 1. 接口地址

```
GET http://<本机IP或localhost>:<端口>/api/weekly
```

- 默认端口 **9876**（若被占用会自动顺延到 9877~9896，窗口标题栏会提示实际端口）。
- 例：`http://localhost:9876/api/weekly`
- 局域网内其它设备可用 `http://<运行 exe 的那台机器 IP>:9876/api/weekly` 访问。

## 2. 请求参数（Query）

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `format` | `json`（默认）/`md`/`txt` | 返回格式：结构化 JSON / Markdown 文档 / 纯文本复盘 |
| `week` | `YYYY-MM-DD` | 可选。填任意一周内的某个日期（不必是周一），接口自动取该日期所在周的周一。缺省为**当前周** |

示例：

```
/api/weekly?format=json
/api/weekly?format=md
/api/weekly?format=txt
/api/weekly?week=2026-08-10        # 指定某周
```

## 3. 返回内容

### 3.1 `format=json`（默认）

结构化对象，字段如下：

```json
{
  "week": "2026-08-10",                       // 该周周一
  "range": { "start": "2026-08-10", "end": "2026-08-16" },
  "isCurrentWeek": true,                      // 是否为当前周
  "summary": {                                // 概览指标
    "done": 12, "completionRate": 80,
    "created": 5, "open": 3,
    "notes": 2, "blockedProjects": 1, "rolledTasks": 1
  },
  "priorityDistribution": { "P0": 1, "P1": 5, "P2": 6 },
  "energyDistribution": [                     // 精力分布（按项目）
    { "project": "Q3 客户续约方案", "count": 4, "percent": 33 }
  ],
  "completionList": [                          // 本周完成清单
    { "title": "把续约方案的定价表补齐", "priority": "P1",
      "priorityLabel": "重要", "doneAt": "2026-08-12", "project": "Q3 客户续约方案" }
  ],
  "blockers": [                                // 卡点项目
    { "project": "Q3 客户续约方案", "blocker": "法务反馈还没回", "next": "周四前补齐定价表" }
  ],
  "dragged": [                                 // 反复拖延（顺延≥2次）
    { "title": "整理上周会议纪要", "rollCount": 3 }
  ],
  "reviewText": "【周复盘】2026-08-10 ~ 2026-08-16\n\n一、完成情况\n..."  // 复盘文本
}
```

- **本周完成清单** = `completionList`（已完成且 `doneAt` 落在该周的任务）。
- **复盘文本** = `reviewText`（与应用内「复制复盘文本」完全一致）。

### 3.2 `format=md`

返回一份 **Markdown 文档**，含五个章节：完成情况 / 精力分布 / 本周完成清单 / 卡点 / 反复拖延。可直接保存为 `.md` 或转发到支持 Markdown 的系统（如知识库、IM 机器人）。

### 3.3 `format=txt`

返回**纯文本复盘文本**（即 `reviewText` 字段的内容），适合直接写入文件或粘贴。

## 4. 跨域（CORS）

接口已开启 `Access-Control-Allow-Origin: *`，浏览器里运行的外部页面（如用 `fetch` 调用）也能直接读取，无需代理。

## 5. 数据来源与注意事项

- 接口数据来自应用内存中的共享数据库（服务端权威副本 `_dbJson`）。**请确保窗口版 exe 处于运行状态**，且应用已打开并同步过数据（默认从 localStorage 同步；若绑定了 JSON 配置文件，则会预载该文件）。
- 单文件 HTML 版本（`办公工作台.html`）不含本服务，无法被外部软件直接调用；对外 API 仅窗口版 exe 提供。
- 当前接口**无鉴权**，仅用于本机 / 局域网内部工具调用。若需暴露到公网，请自行加反向代理与鉴权。

## 6. 调用示例

```bash
# JSON
curl http://localhost:9876/api/weekly

# Markdown 文档（可直接落盘）
curl "http://localhost:9876/api/weekly?format=md" -o 周复盘.md

# 纯文本复盘
curl "http://localhost:9876/api/weekly?format=txt"

# 指定某周
curl "http://localhost:9876/api/weekly?week=2026-08-10&format=md"
```

```python
import urllib.request, json

def get_weekly(format="json", week=None):
    url = "http://localhost:9876/api/weekly?format=" + format
    if week:
        url += "&week=" + week
    with urllib.request.urlopen(url) as r:
        data = r.read().decode("utf-8")
    return json.loads(data) if format == "json" else data

doc = get_weekly("json")
print("本周完成", doc["summary"]["done"], "件，完成率", doc["summary"]["completionRate"], "%")
for t in doc["completionList"]:
    print(" -", t["title"], t["priorityLabel"])
```
