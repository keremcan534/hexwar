' Imperial Eye masaüstü başlatıcısı: yerel sunucu kapalıysa gizli pencerede
' açar, oyunu Chrome'un uygulama penceresinde (adres çubuğu yok) gösterir.
' Kayıtlar Chrome'un normal profilinde, localhost:5173 kökeninde kalır;
' bu yüzden ayrı profil kullanılmaz.
Option Explicit
Dim sh, fso, root, url, chrome, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
url = "http://localhost:5173/"

Function ServerUp()
  Dim http
  ServerUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP")
  http.setTimeouts 500, 500, 500, 500
  http.Open "GET", url, False
  http.Send
  If Err.Number = 0 Then If http.Status = 200 Then ServerUp = True
  Err.Clear
End Function

If Not ServerUp() Then
  sh.CurrentDirectory = root
  sh.Run "cmd /c node scripts\dev-server.mjs", 0, False
  For i = 1 To 40
    WScript.Sleep 250
    If ServerUp() Then Exit For
  Next
End If

chrome = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe"
If Not fso.FileExists(chrome) Then chrome = sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe"
If fso.FileExists(chrome) Then
  sh.Run """" & chrome & """ --app=" & url & " --start-maximized", 1, False
Else
  sh.Run url, 1, False
End If
