using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("FormatDrop")]
[assembly: AssemblyDescription("Local image and PDF format converter launcher")]
[assembly: AssemblyCompany("FormatDrop")]
[assembly: AssemblyProduct("FormatDrop")]
[assembly: AssemblyCopyright("Copyright (c) 2026 FormatDrop")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]
[assembly: AssemblyInformationalVersion("1.0.0")]

namespace FormatDropLauncher
{
    internal static class Program
    {
        internal const string Version = "1.0.0";

        [STAThread]
        private static void Main(string[] args)
        {
            if (args.Length > 0 && string.Equals(args[0], "--smoke-test", StringComparison.OrdinalIgnoreCase))
            {
                Environment.ExitCode = RunSmokeTest();
                return;
            }

            int testPort;
            if (args.Length > 0 && TryParseTestPort(args[0], out testPort))
            {
                using (EmbeddedServer testServer = new EmbeddedServer(testPort))
                {
                    testServer.Start();
                    Thread.Sleep(Timeout.Infinite);
                }
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                using (EmbeddedServer server = new EmbeddedServer(0))
                {
                    server.Start();
                    Application.Run(new LauncherForm(server.Url));
                }
            }
            catch (Exception error)
            {
                MessageBox.Show(
                    "FormatDrop을 시작하지 못했습니다.\r\n\r\n" + error.Message,
                    "FormatDrop",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                Environment.ExitCode = 1;
            }
        }

        private static bool TryParseTestPort(string argument, out int port)
        {
            const string prefix = "--test-server=";
            port = 0;
            return argument.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
                && int.TryParse(argument.Substring(prefix.Length), out port)
                && port > 0
                && port <= 65535;
        }

        private static int RunSmokeTest()
        {
            try
            {
                using (EmbeddedServer server = new EmbeddedServer(0))
                {
                    server.Start();
                    using (WebClient client = new WebClient())
                    {
                        string html = client.DownloadString(server.Url);
                        byte[] pdfWorker = client.DownloadData(server.Url + "vendor/pdfjs/pdf.worker.min.js");
                        if (!html.Contains("FormatDrop") || pdfWorker.Length < 100000)
                        {
                            return 2;
                        }
                    }

                    using (LauncherForm form = new LauncherForm(server.Url))
                    {
                        if (!ContainsControlText(form.Controls, "\ube0c\ub77c\uc6b0\uc800\uc5d0\uc11c \uc5f4\uae30"))
                        {
                            return 3;
                        }
                    }
                }
                return 0;
            }
            catch
            {
                return 1;
            }
        }

        private static bool ContainsControlText(Control.ControlCollection controls, string expectedText)
        {
            foreach (Control control in controls)
            {
                if (string.Equals(control.Text, expectedText, StringComparison.Ordinal))
                {
                    return true;
                }
                if (control.HasChildren && ContainsControlText(control.Controls, expectedText))
                {
                    return true;
                }
            }
            return false;
        }

        internal static void OpenBrowser(string url)
        {
            try
            {
                Process.Start(url);
            }
            catch (Exception error)
            {
                MessageBox.Show(
                    "브라우저를 열지 못했습니다. 아래 주소를 직접 열어 주세요.\r\n\r\n" + url + "\r\n\r\n" + error.Message,
                    "FormatDrop",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }
    }

    internal sealed class LauncherForm : Form
    {
        private readonly string _url;

        internal LauncherForm(string url)
        {
            _url = url;
            Text = "FormatDrop " + Program.Version;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = true;
            ClientSize = new Size(480, 238);
            BackColor = Color.FromArgb(247, 246, 242);
            Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            Icon = SystemIcons.Application;

            Label brand = new Label();
            brand.AutoSize = true;
            brand.Text = "FormatDrop";
            brand.Font = new Font("Segoe UI", 22F, FontStyle.Bold, GraphicsUnit.Point);
            brand.ForeColor = Color.FromArgb(23, 25, 28);
            brand.Location = new Point(28, 24);
            Controls.Add(brand);

            Label version = new Label();
            version.AutoSize = true;
            version.Text = "v" + Program.Version;
            version.Font = new Font("Segoe UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
            version.ForeColor = Color.FromArgb(112, 87, 232);
            version.Location = new Point(205, 43);
            Controls.Add(version);

            Label status = new Label();
            status.AutoSize = true;
            status.Text = "●  로컬 변환 서버가 실행 중입니다";
            status.ForeColor = Color.FromArgb(74, 166, 45);
            status.Location = new Point(31, 83);
            Controls.Add(status);

            LinkLabel address = new LinkLabel();
            address.AutoSize = true;
            address.Text = url;
            address.LinkColor = Color.FromArgb(112, 87, 232);
            address.Location = new Point(31, 111);
            address.LinkClicked += delegate { Program.OpenBrowser(_url); };
            Controls.Add(address);

            Label help = new Label();
            help.AutoSize = true;
            help.Text = "이 창을 닫으면 FormatDrop도 종료됩니다.";
            help.ForeColor = Color.FromArgb(111, 116, 123);
            help.Location = new Point(31, 139);
            Controls.Add(help);

            Button openButton = new Button();
            openButton.Text = "브라우저에서 열기";
            openButton.Size = new Size(154, 42);
            openButton.Location = new Point(218, 178);
            openButton.FlatStyle = FlatStyle.Flat;
            openButton.FlatAppearance.BorderColor = Color.FromArgb(23, 25, 28);
            openButton.FlatAppearance.BorderSize = 1;
            openButton.BackColor = Color.FromArgb(200, 242, 93);
            openButton.ForeColor = Color.FromArgb(23, 25, 28);
            openButton.Font = new Font("Segoe UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
            openButton.Click += delegate { Program.OpenBrowser(_url); };
            Controls.Add(openButton);

            Button exitButton = new Button();
            exitButton.Text = "종료";
            exitButton.Size = new Size(74, 42);
            exitButton.Location = new Point(382, 178);
            exitButton.FlatStyle = FlatStyle.Flat;
            exitButton.FlatAppearance.BorderColor = Color.FromArgb(230, 229, 225);
            exitButton.BackColor = Color.White;
            exitButton.Click += delegate { Close(); };
            Controls.Add(exitButton);

            Shown += delegate { BeginInvoke(new Action(delegate { Program.OpenBrowser(_url); })); };
        }
    }

    internal sealed class EmbeddedServer : IDisposable
    {
        private readonly int _requestedPort;
        private readonly Dictionary<string, byte[]> _assets;
        private TcpListener _listener;
        private Thread _listenerThread;
        private volatile bool _running;

        internal EmbeddedServer(int requestedPort)
        {
            _requestedPort = requestedPort;
            _assets = LoadAssets();
        }

        internal string Url { get; private set; }

        internal void Start()
        {
            _listener = new TcpListener(IPAddress.Loopback, _requestedPort);
            _listener.Start();
            int port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            Url = "http://127.0.0.1:" + port + "/";
            _running = true;
            _listenerThread = new Thread(ListenLoop);
            _listenerThread.IsBackground = true;
            _listenerThread.Name = "FormatDrop local server";
            _listenerThread.Start();
        }

        private static Dictionary<string, byte[]> LoadAssets()
        {
            Dictionary<string, byte[]> assets = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream resource = assembly.GetManifestResourceStream("FormatDrop.Assets.zip"))
            {
                if (resource == null)
                {
                    throw new InvalidOperationException("내장 웹 파일을 찾을 수 없습니다.");
                }

                using (ZipArchive archive = new ZipArchive(resource, ZipArchiveMode.Read, false))
                {
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name))
                        {
                            continue;
                        }

                        using (Stream input = entry.Open())
                        using (MemoryStream output = new MemoryStream())
                        {
                            input.CopyTo(output);
                            assets[entry.FullName.Replace('\\', '/').TrimStart('/')] = output.ToArray();
                        }
                    }
                }
            }
            return assets;
        }

        private void ListenLoop()
        {
            while (_running)
            {
                try
                {
                    TcpClient client = _listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
                catch (SocketException)
                {
                    if (_running)
                    {
                        Thread.Sleep(50);
                    }
                }
                catch (ObjectDisposedException)
                {
                    return;
                }
            }
        }

        private void HandleClient(object state)
        {
            using (TcpClient client = (TcpClient)state)
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 10000;
                using (NetworkStream stream = client.GetStream())
                using (StreamReader reader = new StreamReader(stream, Encoding.ASCII, false, 4096, true))
                {
                    string requestLine = reader.ReadLine();
                    if (string.IsNullOrEmpty(requestLine))
                    {
                        return;
                    }

                    string headerLine;
                    do
                    {
                        headerLine = reader.ReadLine();
                    }
                    while (!string.IsNullOrEmpty(headerLine));

                    string[] parts = requestLine.Split(' ');
                    if (parts.Length < 2 || (parts[0] != "GET" && parts[0] != "HEAD"))
                    {
                        WriteResponse(stream, 405, "Method Not Allowed", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Method not allowed"), false);
                        return;
                    }

                    string path = NormalizePath(parts[1]);
                    byte[] body;
                    if (path == null || !_assets.TryGetValue(path, out body))
                    {
                        WriteResponse(stream, 404, "Not Found", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Not found"), parts[0] == "HEAD");
                        return;
                    }

                    WriteResponse(stream, 200, "OK", ContentTypeFor(path), body, parts[0] == "HEAD");
                }
            }
        }

        private static string NormalizePath(string requestTarget)
        {
            try
            {
                Uri uri = new Uri("http://127.0.0.1" + requestTarget);
                string path = Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/').Replace('\\', '/');
                if (string.IsNullOrEmpty(path))
                {
                    return "index.html";
                }
                if (path.Contains("../") || path == "..")
                {
                    return null;
                }
                return path;
            }
            catch
            {
                return null;
            }
        }

        private static string ContentTypeFor(string path)
        {
            string extension = Path.GetExtension(path).ToLowerInvariant();
            switch (extension)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".gif": return "image/gif";
                case ".wasm": return "application/wasm";
                case ".ttf": return "font/ttf";
                case ".pfb": return "application/octet-stream";
                case ".bcmap": return "application/octet-stream";
                case ".icc": return "application/vnd.iccprofile";
                default: return "application/octet-stream";
            }
        }

        private static void WriteResponse(NetworkStream stream, int statusCode, string statusText, string contentType, byte[] body, bool headersOnly)
        {
            string headers = "HTTP/1.1 " + statusCode + " " + statusText + "\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Content-Length: " + body.Length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + "Connection: close\r\n\r\n";
            byte[] headerBytes = Encoding.ASCII.GetBytes(headers);
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (!headersOnly)
            {
                stream.Write(body, 0, body.Length);
            }
            stream.Flush();
        }

        public void Dispose()
        {
            _running = false;
            if (_listener != null)
            {
                _listener.Stop();
            }
            if (_listenerThread != null && _listenerThread.IsAlive)
            {
                _listenerThread.Join(1000);
            }
        }
    }
}
