using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

class DeskApp
{
    const int PORT = 9876;
    static byte[] html;

    static void Main()
    {
        var asm = Assembly.GetExecutingAssembly();
        using (var s = asm.GetManifestResourceStream("DeskApp.app.html"))
        using (var ms = new MemoryStream())
        {
            s.CopyTo(ms);
            html = ms.ToArray();
        }

        var listener = new TcpListener(IPAddress.Any, PORT);
        listener.Start();
        Task.Run(() => AcceptLoop(listener));

        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo("http://127.0.0.1:" + PORT + "/") { UseShellExecute = true };
            System.Diagnostics.Process.Start(psi);
        }
        catch { }

        Console.OutputEncoding = Encoding.UTF8;
        Console.WriteLine("个人办公工作台已启动");
        Console.WriteLine("本机打开：http://127.0.0.1:" + PORT + "/");
        Console.WriteLine("手机访问：连同一个 WiFi 后，用手机浏览器打开：");
        try
        {
            foreach (var ip in Dns.GetHostAddresses(Dns.GetHostName()))
                if (ip.AddressFamily == AddressFamily.InterNetwork)
                    Console.WriteLine("   http://" + ip + ":" + PORT + "/");
        }
        catch { }
        Console.WriteLine("（手机首次连接若被防火墙拦截，请允许该程序通过“专用网络”）");
        Console.WriteLine("按 Ctrl+C 退出。");
        Thread.Sleep(Timeout.Infinite);
    }

    static async Task AcceptLoop(TcpListener l)
    {
        while (true)
        {
            try { var c = await l.AcceptTcpClientAsync(); _ = Handle(c); }
            catch { await Task.Delay(200); }
        }
    }

    static async Task Handle(TcpClient client)
    {
        try
        {
            using (client)
            using (var ns = client.GetStream())
            {
                var buf = new byte[1024];
                await ns.ReadAsync(buf, 0, buf.Length);
                var header = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "
                    + html.Length + "\r\nConnection: close\r\n\r\n";
                var hb = Encoding.ASCII.GetBytes(header);
                await ns.WriteAsync(hb, 0, hb.Length);
                await ns.WriteAsync(html, 0, html.Length);
            }
        }
        catch { }
    }
}
