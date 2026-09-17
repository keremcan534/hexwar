# Imperial Eye başlatıcısı (Windows).
#
# Oyun saf ES modülüdür ve tarayıcı modülleri file:// üzerinden YÜKLEMEZ
# (CORS: kaynak "null"). Bu yüzden "dosyaya tıkla, oyna" doğrudan index.html
# açmak olamaz; bu betik yerel sunucuyu görünmez başlatır, oyunu adres çubuğu
# olmayan tam ekran bir uygulama penceresinde açar ve pencere kapanınca
# kendi başlattığı sunucuyu kapatır.
#
# Tarayıcı profili ayrıdır (%LOCALAPPDATA%\ImperialEye\browser): pencere her
# açılışta tam ekran gelir, kayıtlar ve ayarlar bu profilde kalır. Eski bir
# pencereden kayıt taşımak için: Settings -> Export save / Import save.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 5173
$url = "http://localhost:$port/"

function Show-Error([string] $message) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($message, 'Imperial Eye') | Out-Null
}

function Test-Server([int] $port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $attempt = $client.BeginConnect('127.0.0.1', $port, $null, $null)
    if (-not $attempt.AsyncWaitHandle.WaitOne(250)) { return $false }
    $client.EndConnect($attempt)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# Sunucu zaten açıksa (npm run dev) ona bağlanılır; kapanışta ona dokunulmaz.
$server = $null
if (-not (Test-Server $port)) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Show-Error 'Node.js was not found. Install it from https://nodejs.org and try again.'
    exit 1
  }
  $env:PORT = "$port"
  $server = Start-Process -FilePath $node.Source -ArgumentList 'scripts/dev-server.mjs' `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(10)
  while (-not (Test-Server $port)) {
    if ($server.HasExited -or (Get-Date) -gt $deadline) {
      Show-Error "The game server could not start on port $port."
      exit 1
    }
    Start-Sleep -Milliseconds 150
  }
}

# Edge her Windows 11'de vardır; yoksa Chrome.
$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $browsers | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) {
  if ($server) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  Show-Error 'Microsoft Edge or Google Chrome is required to run Imperial Eye.'
  exit 1
}

# Ayrı profil şart: tarayıcı zaten açıksa ortak profilde yeni pencere
# --start-fullscreen'i yok sayar ve süreç hemen çıkar (sunucu erken kapanırdı).
$profileDir = Join-Path $env:LOCALAPPDATA 'ImperialEye\browser'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
$arguments = @(
  "--app=$url",
  '--start-fullscreen',
  "--user-data-dir=`"$profileDir`"",
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate'
)
$window = Start-Process -FilePath $browser -ArgumentList $arguments -PassThru
$window.WaitForExit()

if ($server -and -not $server.HasExited) {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
