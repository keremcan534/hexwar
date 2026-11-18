# Imperial Eye: Node'suz başlatıcı (yayın paketi ve Node'u olmayan makine).
#
# Tarayıcı ES modüllerini file:// üzerinden yüklemez, oyuncunun makinesinde de
# Node yok. Windows'un kendi HTTP yığını (HttpListener) yönetici izni istemeden
# localhost'ta dinler; kurulum ve yeni bağımlılık gerekmez.
#
# - Port sabit: kayıtlar IndexedDB'de köken (port) başına durur, port değişirse
#   oyuncunun kayıtları görünmez olur. 5173 geliştirici simgesinindir.
# - Tarayıcı profili ayrı: ortak profilde tarayıcı zaten açıksa
#   --start-fullscreen yok sayılır ve başlatılan süreç hemen çıkar.
# - Sunucu pencereyi izleyen döngüde döner: oyun kapanınca arkada süreç kalmaz.
# - Pencere gizli çalıştığı için her hata ileti kutusuyla söylenir.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$firstPort = 41836
$stateDir = Join-Path $env:LOCALAPPDATA 'ImperialEye'
$logFile = Join-Path $stateDir 'oyna.log'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

# Günlük yazılamadı diye oyun açılmaz olmasın (ikinci kopya dosyayı tutabilir).
try { Set-Content -LiteralPath $logFile -Encoding UTF8 -Value "Imperial Eye $(Get-Date -Format s) | $root" } catch { }

function Write-Log([string] $text) {
  try { Add-Content -LiteralPath $logFile -Encoding UTF8 -Value "$(Get-Date -Format 'HH:mm:ss') $text" } catch { }
}

function Show-Message([string] $text) {
  Write-Log "ileti: $text"
  Add-Type -AssemblyName System.Windows.Forms
  # Gizli süreçten açılan kutu arkada kalır; bu seçenek onu öne getirir.
  [void][System.Windows.Forms.MessageBox]::Show($text, 'Imperial Eye', 'OK', 'Warning', 'Button1', 'DefaultDesktopOnly')
}

trap {
  Write-Log "beklenmeyen hata: $_"
  Show-Message "Oyun başlatılamadı: $($_.Exception.Message)`n`nAyrıntı: $logFile"
  exit 1
}

function Test-Listening([System.Net.IPAddress] $address, [int] $port) {
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new($address.AddressFamily)
    $attempt = $client.BeginConnect($address, $port, $null, $null)
    if (-not $attempt.AsyncWaitHandle.WaitOne(300)) { return $false }
    $client.EndConnect($attempt)
    return $true
  } catch {
    return $false
  } finally {
    if ($client) { $client.Close() }
  }
}

# Windows kapalı porta bağlanmayı saniyelerce yineler: HTTP'den önce kısa TCP yoklaması.
function Get-PortOwner([int] $port) {
  $busy = (Test-Listening ([System.Net.IPAddress]::Loopback) $port) -or
    (Test-Listening ([System.Net.IPAddress]::IPv6Loopback) $port)
  if (-not $busy) { return 'free' }
  $response = $null
  try {
    $request = [System.Net.HttpWebRequest]::Create("http://localhost:$port/")
    $request.Method = 'HEAD'
    $request.Timeout = 2000
    $request.Proxy = $null
    $response = $request.GetResponse()
  } catch {
    $inner = $_.Exception
    while ($inner -and -not ($inner -is [System.Net.WebException])) { $inner = $inner.InnerException }
    if ($inner) { $response = $inner.Response }
  }
  if (-not $response) { return 'other' }
  $mark = $response.Headers['X-Imperial-Eye']
  $response.Close()
  if ($mark) { return 'ours' }
  return 'other'
}

# Yalnız --app bayrağını bilen Chromium aileleri: tam ekran pencere ancak onlarla olur.
function Find-Browser {
  $known = @(
    @{ Name = 'chrome'; Exe = 'chrome.exe'; Dirs = @("$env:ProgramFiles\Google\Chrome\Application", "${env:ProgramFiles(x86)}\Google\Chrome\Application", "$env:LOCALAPPDATA\Google\Chrome\Application") },
    @{ Name = 'msedge'; Exe = 'msedge.exe'; Dirs = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application", "$env:ProgramFiles\Microsoft\Edge\Application") },
    @{ Name = 'brave'; Exe = 'brave.exe'; Dirs = @("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application") },
    @{ Name = 'vivaldi'; Exe = 'vivaldi.exe'; Dirs = @("$env:LOCALAPPDATA\Vivaldi\Application", "$env:ProgramFiles\Vivaldi\Application") }
  )
  foreach ($candidate in $known) {
    $paths = @($candidate.Dirs | ForEach-Object { Join-Path $_ $candidate.Exe })
    foreach ($hive in 'HKLM:', 'HKCU:') {
      $key = "$hive\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$($candidate.Exe)"
      $value = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).'(default)'
      if ($value) { $paths += $value.Trim('"') }
    }
    $hit = $paths | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if ($hit) { return @{ Name = $candidate.Name; Path = $hit } }
  }
  return $null
}

function Find-ProfileBrowser {
  $exe = [IO.Path]::GetFileName($browser.Path)
  $hit = Get-CimInstance Win32_Process -Filter "Name = '$exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profileDir) -and $_.CommandLine -notmatch '--type=' } |
    Select-Object -First 1
  if ($hit) { return Get-Process -Id $hit.ProcessId -ErrorAction SilentlyContinue }
  return $null
}

function Open-GameWindow {
  $flags = @(
    "--app=$url",
    '--start-fullscreen',
    "--user-data-dir=`"$profileDir`"",
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--hide-crash-restore-bubble',
    '--disable-features=Translate'
  )
  # Paketin gerçek penceresi ancak böyle denetlenebilir; oyuncuda değişken tanımsızdır.
  if ($env:IMPERIAL_EYE_DEBUG_PORT -match '^\d+$') { $flags += "--remote-debugging-port=$env:IMPERIAL_EYE_DEBUG_PORT" }
  return Start-Process -FilePath $browser.Path -ArgumentList $flags -PassThru
}

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.txt' = 'text/plain; charset=utf-8'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'
  '.woff2' = 'font/woff2'
  '.mp3' = 'audio/mpeg'
  '.ogg' = 'audio/ogg'
}
$rootPrefix = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
$iconFile = Join-Path $root 'scripts\desktop\imperial-eye.ico'

function Send-GameFile($context) {
  $request = $context.Request
  $response = $context.Response
  try {
    # İkinci kopya portta kendi sunucusunu bu işaretten tanır.
    $response.AddHeader('X-Imperial-Eye', '1')
    if (-not $request.IsLocal) { $response.StatusCode = 403; return }
    $relative = [Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
    if (-not $relative) { $relative = 'index.html' }
    $file = [IO.Path]::GetFullPath([IO.Path]::Combine($rootPrefix, $relative))
    if (-not $file.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { $response.StatusCode = 403; return }
    # index.html'e dokunmadan pencereye oyunun simgesi: tarayıcı kökten kendisi ister.
    if ($relative -eq 'favicon.ico') { $file = $iconFile }
    if (-not [IO.File]::Exists($file)) { $response.StatusCode = 404; return }
    $bytes = [IO.File]::ReadAllBytes($file)
    $type = $types[[IO.Path]::GetExtension($file)]
    if (-not $type) { $type = 'application/octet-stream' }
    $response.ContentType = $type
    # Yeni sürüm aynı kökene çıkar: önbellekte eski modül kalmasın.
    $response.AddHeader('Cache-Control', 'no-cache')
    $response.ContentLength64 = $bytes.Length
    if ($request.HttpMethod -ne 'HEAD') { $response.OutputStream.Write($bytes, 0, $bytes.Length) }
  } catch {
    Write-Log "istek yanıtlanamadı: $($request.Url.AbsolutePath): $($_.Exception.Message)"
    try { $response.StatusCode = 500 } catch { }
  } finally {
    try { $response.Close() } catch { }
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'index.html'))) {
  Show-Message "Oyun dosyaları bulunamadı:`n$root`n`nZip'i önce bir klasöre çıkarın, sonra 'Imperial Eye' dosyasına çift tıklayın."
  exit 1
}

$browser = Find-Browser
$profileDir = $null
if ($browser) { $profileDir = Join-Path $stateDir "profil-$($browser.Name)" }
Write-Log "tarayıcı: $(if ($browser) { $browser.Path } else { 'yok' })"

$server = $null
$port = 0
$reuse = $false
foreach ($candidate in $firstPort..($firstPort + 9)) {
  $owner = Get-PortOwner $candidate
  if ($owner -eq 'ours') { $port = $candidate; $reuse = $true; break }
  if ($owner -eq 'other') { Write-Log "port $candidate başka bir uygulamada"; continue }
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://localhost:$candidate/")
  $listener.IgnoreWriteExceptions = $true
  try {
    $listener.Start()
    $server = $listener
    $port = $candidate
    break
  } catch {
    Write-Log "port $candidate açılamadı: $($_.Exception.Message)"
    try { $listener.Close() } catch { }
    # Art arda çift tıklamada öteki kopya portu az önce almış olabilir.
    if ((Get-PortOwner $candidate) -eq 'ours') { $port = $candidate; $reuse = $true; break }
  }
}
if (-not $port) {
  Show-Message "Oyun için boş bir yerel port bulunamadı ($firstPort-$($firstPort + 9)).`nBilgisayarı yeniden başlatıp tekrar deneyin."
  exit 1
}
$url = "http://localhost:$port/"
Write-Log "adres: $url  yeniden kullanım: $reuse"

if ($reuse) {
  # Oyun zaten açık: ikinci kopya yerine açık pencere öne gelir.
  if (-not $browser) { Start-Process $url; exit 0 }
  for ($i = 0; $i -lt 20; $i++) {
    $running = Find-ProfileBrowser
    if ($running -and $running.MainWindowHandle -ne [IntPtr]::Zero) {
      [void](New-Object -ComObject WScript.Shell).AppActivate($running.Id)
      exit 0
    }
    Start-Sleep -Milliseconds 250
  }
  [void](Open-GameWindow)
  exit 0
}

# Windows arka plandaki sürecin penceresini öne almaz: cmd > gizli powershell >
# tarayıcı zincirinde oyun, üstünde Gezgin açıkken arkada kalabiliyor.
$focusPending = $false
$altUsed = $false
try {
  Add-Type -Namespace ImperialEye -Name Focus -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool altTab);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
'@
  $focusPending = $true
} catch {
  Write-Log "pencere öne alma kurulamadı: $($_.Exception.Message)"
}

function Send-WindowToFront([IntPtr] $handle) {
  if ([ImperialEye.Focus]::GetForegroundWindow() -eq $handle) { return $true }
  [ImperialEye.Focus]::SwitchToThisWindow($handle, $true)
  if ([ImperialEye.Focus]::GetForegroundWindow() -eq $handle) { return $true }
  # Son çare, bir kez: tek Alt vuruşu ön plan kilidini açar.
  if (-not $script:altUsed) {
    $script:altUsed = $true
    [ImperialEye.Focus]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [ImperialEye.Focus]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [void][ImperialEye.Focus]::SetForegroundWindow($handle)
  }
  return ([ImperialEye.Focus]::GetForegroundWindow() -eq $handle)
}

$tracked = $null
$fallback = $null
if ($browser) {
  $tracked = Open-GameWindow
} else {
  # Chromium yoksa pencere izlenemez: kapanışı oyuncu bu küçük pencereyle bildirir.
  Add-Type -AssemblyName System.Windows.Forms
  $fallback = New-Object System.Windows.Forms.Form
  $fallback.Text = 'Imperial Eye'
  $fallback.Width = 480
  $fallback.Height = 170
  $fallback.StartPosition = 'CenterScreen'
  $fallback.FormBorderStyle = 'FixedDialog'
  $fallback.MaximizeBox = $false
  $label = New-Object System.Windows.Forms.Label
  $label.Dock = 'Fill'
  $label.Padding = New-Object System.Windows.Forms.Padding 14
  $label.Text = "Chrome ya da Edge bulunamadı; oyun varsayılan tarayıcıda açıldı (tam ekran için F11).`n`nOyunu bitirince bu pencereyi kapatın."
  $fallback.Controls.Add($label)
  $fallback.Show()
  Start-Process $url
}

$tick = 250
if ($fallback) { $tick = 40 }
$launchedAt = [DateTime]::UtcNow
$windowSeenAt = $null
$handoffChecked = $false
$reason = ''
$pending = $server.GetContextAsync()
try {
  while (-not $reason) {
    if ($pending.Wait($tick)) {
      Send-GameFile $pending.Result
      $pending = $server.GetContextAsync()
      continue
    }
    if ($fallback) {
      [System.Windows.Forms.Application]::DoEvents()
      if ($fallback.IsDisposed -or -not $fallback.Visible) { $reason = 'bekleme penceresi kapandı' }
      continue
    }
    $now = [DateTime]::UtcNow
    $tracked.Refresh()
    if ($tracked.HasExited) {
      # Profil arkada açık kalmış bir tarayıcıdaysa başlatılan süreç pencereyi ona devredip çıkar.
      $heir = $null
      if (-not $handoffChecked) { $handoffChecked = $true; $heir = Find-ProfileBrowser }
      if ($heir) { $tracked = $heir } else { $reason = 'tarayıcı kapandı' }
    } elseif ($tracked.MainWindowHandle -ne [IntPtr]::Zero) {
      if (-not $windowSeenAt) { $firstWindowAt = $now }
      $windowSeenAt = $now
      # Yalnız açılışta: oyuncu sonradan başka pencereye geçerse geri çekilmez.
      if ($focusPending) {
        if (Send-WindowToFront $tracked.MainWindowHandle) {
          $focusPending = $false
          Write-Log 'pencere önde'
        } elseif (($now - $firstWindowAt).TotalSeconds -gt 8) {
          $focusPending = $false
          Write-Log 'pencere öne alınamadı'
        }
      }
    } elseif ($windowSeenAt) {
      # Tarayıcı arka planda kalsa da oyun bitmiştir: sunucu onu beklemez.
      if (($now - $windowSeenAt).TotalSeconds -gt 5) { $reason = 'pencere kapandı, tarayıcı arkada kaldı' }
    } elseif (($now - $launchedAt).TotalSeconds -gt 60) {
      $reason = 'pencere açılamadı'
      Show-Message "Oyun penceresi açılamadı.`n`nAyrıntı: $logFile"
    }
  }
} finally {
  Write-Log "kapanış: $reason"
  try { $server.Stop(); $server.Close() } catch { }
}
