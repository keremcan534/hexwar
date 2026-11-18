# Oyuncuya gidecek paketi üretir: dist\ImperialEye-<etiket>.zip
#
#   powershell -ExecutionPolicy Bypass -File scripts\release\build.ps1 [-Commit master] [-Label v0.1.0]
#
# Kaynak yalnız commit'tir (git archive): çalışma ağacındaki izlenmeyen dosyalar,
# özellikle lisansı belirsiz assets/audio/ambience, pakete sızamaz.

param(
  [string] $Commit = 'HEAD',
  [string] $Label = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$full = (& git -C $repo rev-parse --verify "$Commit^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { throw "Commit bulunamadı: $Commit" }
if (-not $Label) { $Label = $full.Substring(0, 7) }

$stage = Join-Path ([IO.Path]::GetTempPath()) "imperial-eye-paket-$PID"
$top = Join-Path $stage 'paket\Imperial Eye'
$game = Join-Path $top 'oyun'
New-Item -ItemType Directory -Force -Path $game | Out-Null

try {
  # assets/incoming kaynak sayfalardır: oyun okumaz, paketin yarısını tutar.
  # Raftaki dinamik müzik ve eski menü parçaları da oyuna bağlı değildir.
  $archive = Join-Path $stage 'oyun.zip'
  & git -C $repo archive --format=zip -o $archive $full -- `
    index.html src assets lab vendor scripts/release scripts/desktop/imperial-eye.ico ':(exclude)assets/incoming' `
    ':(exclude)assets/audio/orchestra' ':(exclude)assets/music/imperia.mp3' ':(exclude)assets/music/faded-rose.mp3' `
    ':(exclude)src/audio' ':(exclude)src/ui/gameMusic.js'
  if ($LASTEXITCODE -ne 0) { throw 'git archive başarısız oldu' }
  [IO.Compression.ZipFile]::ExtractToDirectory($archive, $game)

  # cmd.exe satır sonu LF iken etiketleri şaşırır; Not Defteri Türkçe için BOM ister.
  $release = Join-Path $game 'scripts\release'
  $encodings = @{
    'Imperial Eye.cmd' = [Text.Encoding]::ASCII
    'NASIL OYNANIR.txt' = New-Object Text.UTF8Encoding $true
  }
  foreach ($name in $encodings.Keys) {
    $source = Join-Path $release $name
    $text = [IO.File]::ReadAllText($source) -replace "`r?`n", "`r`n"
    [IO.File]::WriteAllText((Join-Path $top $name), $text, $encodings[$name])
    Remove-Item -LiteralPath $source
  }
  Remove-Item -LiteralPath (Join-Path $release 'build.ps1')
  [IO.File]::WriteAllText((Join-Path $game 'surum.txt'), "Imperial Eye $Label`r`ncommit $full`r`n")

  $outDir = Join-Path $repo 'dist'
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $zip = Join-Path $outDir "ImperialEye-$Label.zip"
  if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip }
  # CreateFromDirectory Windows PowerShell'de girdi adlarını ters bölüyle yazar;
  # zip standardı düz bölü ister, başka açıcılar klasörleri dosya adı sanır.
  $base = (Get-Item -LiteralPath (Join-Path $stage 'paket')).FullName
  $stream = [IO.File]::Open($zip, [IO.FileMode]::CreateNew)
  $package = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in Get-ChildItem -LiteralPath $base -Recurse -File) {
      $name = $file.FullName.Substring($base.Length + 1).Replace('\', '/')
      $entry = $package.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
      $entry.LastWriteTime = $file.LastWriteTime
      $reader = $file.OpenRead()
      $writer = $entry.Open()
      try { $reader.CopyTo($writer) } finally { $writer.Dispose(); $reader.Dispose() }
    }
  } finally {
    $package.Dispose()
    $stream.Dispose()
  }

  $info = Get-Item -LiteralPath $zip
  "{0}  {1:N1} MB  commit {2}" -f $info.FullName, ($info.Length / 1MB), $full.Substring(0, 7)
  "SHA256 {0}" -f (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
