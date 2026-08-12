using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Program
{
    public const int PORT = 9876;
    public static string HtmlText = "";
    public static int ActualPort = PORT;
    public static string PortWarn = "";

    /* ---- 服务端共享数据（配置文件权威源：PC 与手机同源共用一份数据） ---- */
    private static readonly object _srvLock = new object();
    private static string _dbJson = null;      // 规范 DB（JSON 字符串），null=尚无数据
    private static long _dbRev = 0;            // 全局修订号，服务端自增
    private static string _cfgPath = null;     // 绑定的配置文件路径
    private static string _cfgMode = null;     // json / xlsx
    private const string SRV_MARK = "window.__SERVER_DB__=null;window.__SERVER_REV__=0;";

    [STAThread]
    static void Main()
    {
        bool createdNew;
        // 单实例锁：保证端口固定，localStorage 数据不会因端口变化而丢失
        using (var mutex = new Mutex(true, "Local\\OfficeDeskWorkbench_SingleInstance", out createdNew))
        {
            if (!createdNew)
            {
                MessageBox.Show(
                    "个人办公工作台已经在运行了。\n\n请在任务栏里找到它的窗口。\n如果找不到，请在任务管理器结束「办公工作台」进程后重试。",
                    "已在运行", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.ThreadException += (s, e) => ShowErr(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => ShowErr(e.ExceptionObject as Exception);

            try
            {
                var asm = Assembly.GetExecutingAssembly();
                using (var st = asm.GetManifestResourceStream("OfficeDesk.app.html"))
                using (var ms = new MemoryStream())
                {
                    if (st == null) throw new Exception("内嵌页面资源缺失");
                    st.CopyTo(ms);
                    HtmlText = Encoding.UTF8.GetString(ms.ToArray());
                }

                LoadServerConfig();
                StartServer();
                Application.Run(new MainForm());
            }
            catch (Exception ex)
            {
                ShowErr(ex);
            }
        }
    }

    static void ShowErr(Exception ex)
    {
        try
        {
            var msg = ex == null ? "未知错误" : ex.Message;
            var log = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath) ?? ".", "启动错误日志.txt");
            try { File.WriteAllText(log, DateTime.Now + "\r\n" + (ex == null ? "null" : ex.ToString()), Encoding.UTF8); } catch { }
            MessageBox.Show("程序遇到问题：\n\n" + msg + "\n\n详细信息已写入 启动错误日志.txt",
                "办公工作台", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch { }
    }

    static void StartServer()
    {
        TcpListener listener = null;
        // 优先固定端口（保证 origin 不变 → localStorage 数据稳定）
        try
        {
            listener = new TcpListener(IPAddress.Any, PORT);
            listener.Start();
            ActualPort = PORT;
        }
        catch
        {
            listener = null;
            for (int p = PORT + 1; p <= PORT + 20; p++)
            {
                try
                {
                    var l2 = new TcpListener(IPAddress.Any, p);
                    l2.Start();
                    listener = l2;
                    ActualPort = p;
                    PortWarn = "（端口 9876 被其它程序占用，已改用 " + p + "）";
                    break;
                }
                catch { }
            }
        }
        if (listener == null) throw new Exception("无法启动本地服务，9876~9896 端口都被占用了。");
        var lsn = listener;
        Task.Run(async () =>
        {
            while (true)
            {
                try { var c = await lsn.AcceptTcpClientAsync(); _ = Handle(c); }
                catch { await Task.Delay(200); }
            }
        });
    }

    static async Task Handle(TcpClient client)
    {
        try
        {
            using (client)
            using (var ns = client.GetStream())
            {
                var req = await ReadRequest(ns);
                if (req == null) return;
                if (req.Path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
                {
                    await HandleApi(ns, req.Method, req.Path, req.Body);
                    return;
                }
                // 普通页面：把服务端共享 DB 注入到页面，PC 与手机都拿到同一份数据
                string outHtml;
                lock (_srvLock)
                {
                    var json = _dbJson == null ? "null" : _dbJson.Replace("</", "<\\/");
                    outHtml = HtmlText.Replace(SRV_MARK, "window.__SERVER_DB__=" + json + ";window.__SERVER_REV__=" + _dbRev + ";");
                }
                var ob = Encoding.UTF8.GetBytes(outHtml);
                var header = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n"
                    + "Cache-Control: no-store\r\nContent-Length: " + ob.Length + "\r\nConnection: close\r\n\r\n";
                var hb = Encoding.ASCII.GetBytes(header);
                await ns.WriteAsync(hb, 0, hb.Length);
                await ns.WriteAsync(ob, 0, ob.Length);
                await ns.FlushAsync();
            }
        }
        catch { }
    }

    static async Task HandleApi(NetworkStream ns, string method, string path, string body)
    {
        string resp = "{}"; int code = 200;
        try
        {
            if (path.Equals("/api/state", StringComparison.OrdinalIgnoreCase))
            {
                lock (_srvLock)
                {
                    resp = "{\"db\":" + (_dbJson ?? "null") + ",\"rev\":" + _dbRev
                        + ",\"bound\":" + (_cfgPath != null).ToString().ToLower()
                        + ",\"path\":" + (_cfgPath == null ? "null" : "\"" + _cfgPath.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"")
                        + ",\"mode\":" + (_cfgMode == null ? "null" : "\"" + _cfgMode + "\"") + "}";
                }
            }
            else if (path.Equals("/api/push", StringComparison.OrdinalIgnoreCase) && method == "POST")
            {
                string db = null;
                try { using var d = JsonDocument.Parse(body); db = d.RootElement.GetProperty("db").GetRawText(); } catch { }
                if (db != null)
                {
                    lock (_srvLock)
                    {
                        _dbRev++; _dbJson = db;
                        // JSON 配置文件由服务端直接落盘；xlsx 由 PC 端经桥接写回
                        if (_cfgMode == "json" && !string.IsNullOrEmpty(_cfgPath))
                        {
                            try { File.WriteAllText(_cfgPath, db, Encoding.UTF8); } catch { }
                        }
                    }
                    resp = "{\"ok\":true,\"rev\":" + _dbRev + "}";
                }
                else resp = "{\"ok\":false,\"error\":\"invalid\"}";
            }
            else if (path.Equals("/api/bind", StringComparison.OrdinalIgnoreCase) && method == "POST")
            {
                string p = null, m = null;
                try { using var d = JsonDocument.Parse(body); p = d.RootElement.GetProperty("path").GetString(); m = d.RootElement.GetProperty("mode").GetString(); } catch { }
                if (!string.IsNullOrEmpty(p))
                {
                    lock (_srvLock) { _cfgPath = p; _cfgMode = m; }
                    SaveServerConfig();
                    resp = "{\"ok\":true}";
                }
                else resp = "{\"ok\":false}";
            }
            else if (path.Equals("/api/unbind", StringComparison.OrdinalIgnoreCase) && method == "POST")
            {
                lock (_srvLock) { _cfgPath = null; _cfgMode = null; }
                SaveServerConfig();
                resp = "{\"ok\":true}";
            }
            else { resp = "{\"ok\":false,\"error\":\"not found\"}"; code = 404; }
        }
        catch (Exception ex) { resp = "{\"ok\":false,\"error\":" + JsonString(ex.Message) + "}"; code = 500; }
        var rb = Encoding.UTF8.GetBytes(resp);
        var header = "HTTP/1.1 " + code + " OK\r\nContent-Type: application/json; charset=utf-8\r\n"
            + "Cache-Control: no-store\r\nContent-Length: " + rb.Length + "\r\nConnection: close\r\n\r\n";
        var hb = Encoding.ASCII.GetBytes(header);
        await ns.WriteAsync(hb, 0, hb.Length);
        await ns.WriteAsync(rb, 0, rb.Length);
        await ns.FlushAsync();
    }

    static string JsonString(string s)
    {
        if (s == null) return "null";
        var sb = new StringBuilder();
        sb.Append('"');
        foreach (var c in s)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c == '\n') sb.Append("\\n");
            else if (c == '\r') sb.Append("\\r");
            else if (c == '\t') sb.Append("\\t");
            else sb.Append(c);
        }
        sb.Append('"');
        return sb.ToString();
    }

    class HttpReq { public string Method; public string Path; public string Body; }
    static async Task<HttpReq> ReadRequest(NetworkStream ns)
    {
        using var ms = new MemoryStream();
        var buf = new byte[4096];
        int total = 0, headerEnd = -1;
        while (total < (1 << 20))
        {
            int n = await ns.ReadAsync(buf, 0, buf.Length);
            if (n <= 0) break;
            ms.Write(buf, 0, n); total += n;
            var arr = ms.ToArray();
            headerEnd = IndexOf(arr, 0, total, "\r\n\r\n");
            if (headerEnd >= 0) break;
        }
        if (headerEnd < 0) return null;
        var all = ms.ToArray();
        var headerStr = Encoding.ASCII.GetString(all, 0, headerEnd);
        var lines = headerStr.Split('\r', '\n');
        var first = lines[0].Split(' ');
        if (first.Length < 2) return null;
        string method = first[0], path = first[1];
        int cl = 0;
        foreach (var l in lines) if (l.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase)) { int.TryParse(l.Substring(15).Trim(), out cl); break; }
        int bodyStart = headerEnd + 4;
        var bodyBytes = new List<byte>();
        if (total > bodyStart) for (int i = bodyStart; i < total; i++) bodyBytes.Add(all[i]);
        while (bodyBytes.Count < cl)
        {
            int n = await ns.ReadAsync(buf, 0, buf.Length);
            if (n <= 0) break;
            for (int i = 0; i < n; i++) bodyBytes.Add(buf[i]);
        }
        var body = cl > 0 ? Encoding.UTF8.GetString(bodyBytes.ToArray(), 0, Math.Min(bodyBytes.Count, cl)) : "";
        return new HttpReq { Method = method, Path = path, Body = body };
    }
    static int IndexOf(byte[] arr, int start, int len, string s)
    {
        var pat = Encoding.ASCII.GetBytes(s);
        for (int i = start; i <= len - pat.Length; i++)
        {
            bool ok = true; for (int j = 0; j < pat.Length; j++) if (arr[i + j] != pat[j]) { ok = false; break; }
            if (ok) return i;
        }
        return -1;
    }

    static void LoadServerConfig()
    {
        try
        {
            var p = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath) ?? ".", "app_config.json");
            if (!File.Exists(p)) return;
            using var doc = JsonDocument.Parse(File.ReadAllText(p, Encoding.UTF8));
            var r = doc.RootElement;
            _cfgPath = r.TryGetProperty("path", out var pe) ? pe.GetString() : null;
            _cfgMode = r.TryGetProperty("mode", out var me) ? me.GetString() : null;
            // JSON 配置文件可直接由服务端预载；xlsx 等 PC 端启动后推送
            if (_cfgPath != null && _cfgMode == "json" && File.Exists(_cfgPath))
            {
                try { _dbJson = File.ReadAllText(_cfgPath, Encoding.UTF8); _dbRev = 1; } catch { }
            }
        }
        catch { }
    }
    static void SaveServerConfig()
    {
        try
        {
            var p = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath) ?? ".", "app_config.json");
            File.WriteAllText(p, "{\"path\":" + (_cfgPath == null ? "null" : "\"" + _cfgPath.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"") + ",\"mode\":" + (_cfgMode == null ? "null" : "\"" + _cfgMode + "\"") + "}", Encoding.UTF8);
        }
        catch { }
    }

    public static List<string> LanUrls()
    {
        var list = new List<string>();
        try
        {
            foreach (var ip in Dns.GetHostAddresses(Dns.GetHostName()))
                if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                    list.Add("http://" + ip + ":" + ActualPort + "/");
        }
        catch { }
        return list;
    }
}

class MainForm : Form
{
    WebView2 web;
    Panel bar;
    Label lblAddr;

    public MainForm()
    {
        Text = "个人办公工作台";
        Width = 1360;
        Height = 900;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(420, 560);
        BackColor = Color.White;
        Font = new Font("Microsoft YaHei UI", 9F);
        try { Icon = new Icon(typeof(Program).Assembly.GetManifestResourceStream("OfficeDesk.app.ico")); } catch { }

        bar = new Panel { Dock = DockStyle.Bottom, Height = 40, BackColor = Color.FromArgb(244, 248, 249) };
        var line = new Panel { Dock = DockStyle.Top, Height = 1, BackColor = Color.FromArgb(224, 232, 234) };
        bar.Controls.Add(line);

        var urls = Program.LanUrls();
        var addr = urls.Count > 0 ? urls[0] : "http://127.0.0.1:" + Program.ActualPort + "/";
        lblAddr = new Label
        {
            AutoSize = false,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(14, 0, 0, 0),
            ForeColor = Color.FromArgb(72, 96, 102),
            Text = "手机访问（同一 WiFi）：" + addr + "   " + Program.PortWarn
        };

        var btnCopy = MakeBtn("复制手机地址", 120);
        btnCopy.Click += (s, e) =>
        {
            try { Clipboard.SetText(addr); btnCopy.Text = "已复制 √"; }
            catch { btnCopy.Text = "复制失败"; }
            var t = new System.Windows.Forms.Timer { Interval = 1600 };
            t.Tick += (a, b) => { btnCopy.Text = "复制手机地址"; t.Stop(); t.Dispose(); };
            t.Start();
        };

        var btnBrowser = MakeBtn("用浏览器打开", 112);
        btnBrowser.Click += (s, e) =>
        {
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo("http://127.0.0.1:" + Program.ActualPort + "/") { UseShellExecute = true };
                System.Diagnostics.Process.Start(psi);
            }
            catch { }
        };

        var right = new FlowLayoutPanel
        {
            Dock = DockStyle.Right,
            FlowDirection = FlowDirection.LeftToRight,
            Width = 254,
            Padding = new Padding(0, 6, 10, 0),
            BackColor = Color.Transparent
        };
        right.Controls.Add(btnCopy);
        right.Controls.Add(btnBrowser);

        bar.Controls.Add(lblAddr);
        bar.Controls.Add(right);
        lblAddr.BringToFront();

        web = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(web);
        Controls.Add(bar);

        Load += async (s, e) => await InitWeb();
    }

    static Button MakeBtn(string text, int w)
    {
        var b = new Button
        {
            Text = text,
            Width = w,
            Height = 28,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.White,
            ForeColor = Color.FromArgb(13, 124, 138),
            Margin = new Padding(4, 0, 0, 0),
            Cursor = Cursors.Hand
        };
        b.FlatAppearance.BorderColor = Color.FromArgb(190, 214, 218);
        return b;
    }

    async Task InitWeb()
    {
        try
        {
            // 固定用户数据目录 → localStorage 永久保存
            var dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "个人办公工作台", "WebView2");
            Directory.CreateDirectory(dataDir);
            var env = await CoreWebView2Environment.CreateAsync(null, dataDir);
            await web.EnsureCoreWebView2Async(env);

            web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            web.CoreWebView2.Settings.AreDevToolsEnabled = true;

            // 页面里点外链 → 用系统浏览器打开，别在应用窗口里跳走
            web.CoreWebView2.NewWindowRequested += (s, e) =>
            {
                e.Handled = true;
                try
                {
                    var psi = new System.Diagnostics.ProcessStartInfo(e.Uri) { UseShellExecute = true };
                    System.Diagnostics.Process.Start(psi);
                }
                catch { }
            };

            web.CoreWebView2.Navigate("http://127.0.0.1:" + Program.ActualPort + "/");
            web.CoreWebView2.WebMessageReceived += OnWebMessage;
        }
        catch (Exception ex)
        {
            var r = MessageBox.Show(
                "无法启动内嵌浏览器组件（WebView2）。\n\n" + ex.Message +
                "\n\n是否改用系统默认浏览器打开工作台？",
                "办公工作台", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (r == DialogResult.Yes)
            {
                try
                {
                    var psi = new System.Diagnostics.ProcessStartInfo("http://127.0.0.1:" + Program.ActualPort + "/") { UseShellExecute = true };
                    System.Diagnostics.Process.Start(psi);
                }
                catch { }
            }
        }
    }

    /* 配置文件数据源：JS 通过 postMessage 请求读写 / 选择本地文件，C# 负责真正的文件 I/O */
    void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        long id = 0; string action = "", path = "", text = ""; bool binary = false;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            id = root.TryGetProperty("id", out var idEl) ? idEl.GetInt64() : 0;
            action = root.TryGetProperty("action", out var aEl) ? aEl.GetString() : "";
            path = root.TryGetProperty("path", out var pEl) ? pEl.GetString() : "";
            binary = root.TryGetProperty("binary", out var bEl) && bEl.GetBoolean();
            text = root.TryGetProperty("text", out var tEl) ? tEl.GetString() : "";
        }
        catch { return; }

        string resp = "{}";
        try
        {
            switch (action)
            {
                    case "readConfig":
                        {
                            string content = binary
                                ? Convert.ToBase64String(File.ReadAllBytes(path))
                                : File.ReadAllText(path, Encoding.UTF8);
                            resp = JsonSerializer.Serialize(new { id, ok = true, text = content });
                            break;
                        }
                    case "writeConfig":
                        {
                            if (binary) File.WriteAllBytes(path, Convert.FromBase64String(text));
                            else File.WriteAllText(path, text, Encoding.UTF8);
                            resp = JsonSerializer.Serialize(new { id, ok = true });
                            break;
                        }
                    case "pickOpen":
                        {
                            string p = null, t = null; bool bin = false;
                            using (var d = new OpenFileDialog())
                            {
                                d.Filter = "配置文件 (*.json;*.xlsx)|*.json;*.xlsx|JSON (*.json)|*.json|Excel (*.xlsx)|*.xlsx|所有文件 (*.*)|*.*";
                                if (d.ShowDialog() == DialogResult.OK) p = d.FileName;
                            }
                            if (p != null)
                            {
                                bin = p.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase);
                                t = bin ? Convert.ToBase64String(File.ReadAllBytes(p)) : File.ReadAllText(p, Encoding.UTF8);
                            }
                            resp = JsonSerializer.Serialize(new { id, ok = p != null, path = p, text = t, bin });
                            break;
                        }
                    case "pickMusic":
                        {
                            string p = null, t = null, n = null;
                            using (var d = new OpenFileDialog())
                            {
                                d.Filter = "音频文件 (*.mp3;*.wav;*.ogg;*.m4a;*.aac;*.flac)|*.mp3;*.wav;*.ogg;*.m4a;*.aac;*.flac|所有文件 (*.*)|*.*";
                                if (d.ShowDialog() == DialogResult.OK) p = d.FileName;
                            }
                            if (p != null)
                            {
                                var bytes = File.ReadAllBytes(p);
                                n = Path.GetFileName(p);
                                var mime = "audio/mpeg";
                                var ext = Path.GetExtension(p).ToLowerInvariant();
                                if (ext == ".wav") mime = "audio/wav";
                                else if (ext == ".ogg") mime = "audio/ogg";
                                else if (ext == ".m4a") mime = "audio/mp4";
                                else if (ext == ".aac") mime = "audio/aac";
                                else if (ext == ".flac") mime = "audio/flac";
                                t = "data:" + mime + ";base64," + Convert.ToBase64String(bytes);
                            }
                            resp = JsonSerializer.Serialize(new { id, ok = p != null, text = t, name = n });
                            break;
                        }
                    case "pickSave":
                        {
                            string p = null;
                            using (var d = new SaveFileDialog())
                            {
                                d.Filter = "配置文件 (*.json;*.xlsx)|*.json;*.xlsx|JSON (*.json)|*.json|Excel (*.xlsx)|*.xlsx|所有文件 (*.*)|*.*";
                                d.AddExtension = true;
                                d.DefaultExt = ".json";
                                d.FileName = "办公工作台数据";
                                if (d.ShowDialog() == DialogResult.OK) p = d.FileName;
                            }
                            resp = JsonSerializer.Serialize(new { id, ok = p != null, path = p });
                            break;
                        }
                }
            }
            catch (Exception ex)
            {
                resp = JsonSerializer.Serialize(new { id, ok = false, error = ex.Message });
            }
            try { web.CoreWebView2.PostWebMessageAsString(resp); } catch { }
    }
}
