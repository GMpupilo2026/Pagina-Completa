# Deja corriendo solo, en Windows, herramientas/meet-clase-a-clase.py: las
# grabaciones de Meet que Drive baja a la computadora se transcriben y entran
# al informe del CCDR clase a clase. Ver «Las grabaciones de Meet, clase a
# clase» en docs/decisiones/informes.md.
#
# Se corre UNA vez, desde la carpeta del repositorio, en PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File herramientas\meet-clase-a-clase-instalar.ps1
#
# Hace esto:
#   1. busca Python e instala faster-whisper (y «av» por debajo de la 16);
#   2. si hay Node, corre «npm ci» para que se pueda armar el Word;
#   3. busca la carpeta «Meet Recordings» de Google Drive para computadora;
#   4. crea la tarea «Meet clase a clase» en el Programador de tareas: arranca
#      al entrar a Windows, sin ventana, y mira la carpeta cada 5 minutos.
#
# Para quitarla:   ... -File herramientas\meet-clase-a-clase-instalar.ps1 -Quitar
#
# El archivo va con BOM a propósito: sin él, PowerShell 5 lo lee como ANSI y
# las tildes de los mensajes salen rotas.

param(
  [string]$Grabaciones = "",
  [string]$Trabajo = "",
  [ValidateSet("tiny", "base", "small", "medium")]
  [string]$Modelo = "small",
  [switch]$Quitar
)

$ErrorActionPreference = "Stop"
$Tarea = "Meet clase a clase"
$Repo = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $PSScriptRoot "meet-clase-a-clase.py"

function Paso($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Falla($texto) { Write-Host "`n$texto" -ForegroundColor Red; exit 1 }

if ($Quitar) {
  Stop-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Listo: la tarea «$Tarea» ya no está. Las transcripciones y el informe se quedan donde estaban."
  exit 0
}

# ------------------------------------------------------------ 1. Python
Paso "Python"
# «py» es el lanzador que instala python.org. El «python» de WindowsApps es un
# atajo que abre la Tienda, no Python: por eso se pregunta la ruta de verdad.
$python = $null
foreach ($cmd in @("py", "python")) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) {
    try {
      $ruta = & $cmd -c "import sys; print(sys.executable)" 2>$null
      if ($LASTEXITCODE -eq 0 -and $ruta -and (Test-Path $ruta)) { $python = $ruta.Trim(); break }
    } catch { }
  }
}
if (-not $python) {
  Falla ("No encontré Python. Instálalo desde https://www.python.org/downloads/ " +
         "(marca «Add python.exe to PATH») y vuelve a correr este instalador.")
}
$pythonw = Join-Path (Split-Path $python) "pythonw.exe"
if (-not (Test-Path $pythonw)) { Falla "Encontré $python, pero no pythonw.exe al lado." }
Write-Host "Python: $python"

Paso "Instalando faster-whisper (la primera vez tarda unos minutos)"
& $python -m pip install --upgrade faster-whisper "av<16"
if ($LASTEXITCODE -ne 0) { Falla "pip no pudo instalar faster-whisper. Mira el error de arriba." }

# ------------------------------------------------------------ 2. Node, para el Word
Paso "Node (para armar el Word)"
if (Get-Command npm -ErrorAction SilentlyContinue) {
  Push-Location $Repo
  try { npm ci --no-audit --no-fund } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { Write-Host "npm ci falló: las transcripciones y el JSON se hacen igual, el Word no." -ForegroundColor Yellow }
} else {
  Write-Host ("No hay Node: las transcripciones y el JSON del mes se hacen igual, pero el Word en curso no. " +
              "Para tenerlo: winget install OpenJS.NodeJS.LTS y vuelve a correr este instalador.") -ForegroundColor Yellow
}

# ------------------------------------------------------------ 3. Las carpetas
Paso "Carpetas"
if (-not $Grabaciones) {
  # Drive para computadora monta «Mi unidad» (o «My Drive») en una letra, casi siempre G:.
  foreach ($letra in (Get-PSDrive -PSProvider FileSystem).Root) {
    foreach ($unidad in @("Mi unidad", "My Drive")) {
      $c = Join-Path $letra (Join-Path $unidad "Meet Recordings")
      if (Test-Path $c) { $Grabaciones = $c; break }
    }
    if ($Grabaciones) { break }
  }
}
if (-not $Grabaciones) {
  Write-Host "No encontré «Meet Recordings» de Google Drive para computadora." -ForegroundColor Yellow
  Write-Host "Ábrelo (https://www.google.com/drive/download/), entra con la cuenta que graba las clases y espera a que aparezca la unidad."
  $Grabaciones = Read-Host "O escribe aquí la ruta de la carpeta de las grabaciones"
}
if (-not (Test-Path $Grabaciones)) { Falla "No existe la carpeta: $Grabaciones" }
if (-not $Trabajo) { $Trabajo = Join-Path (Split-Path $Grabaciones) "Informe CCDR" }
New-Item -ItemType Directory -Force -Path $Trabajo | Out-Null
Write-Host "Grabaciones: $Grabaciones"
Write-Host "Informe:     $Trabajo"

# ------------------------------------------------------------ 4. La tarea
Paso "Tarea «$Tarea» en el Programador de tareas"
$registro = Join-Path $Trabajo "registro.txt"
$argumentos = "`"$Script`" --grabaciones `"$Grabaciones`" --trabajo `"$Trabajo`" --modelo $Modelo --vigilar --registro `"$registro`""
$accion = New-ScheduledTaskAction -Execute $pythonw -Argument $argumentos -WorkingDirectory $Repo
$disparador = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
# Sin límite de tiempo (corre todo el día), también con batería, y si se cae
# se vuelve a levantar a los 5 minutos.
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) `
  -StartWhenAvailable -MultipleInstances IgnoreNew
try {
  Register-ScheduledTask -TaskName $Tarea -Action $accion -Trigger $disparador -Principal $quien -Settings $ajustes `
    -Description "Transcribe las grabaciones de Meet y arma el informe del CCDR clase a clase." -Force | Out-Null
} catch {
  Falla ("No se pudo crear la tarea: $($_.Exception.Message)`n" +
         "Prueba abriendo PowerShell con «Ejecutar como administrador».")
}
Start-ScheduledTask -TaskName $Tarea

Write-Host "`nListo. Ya está corriendo y va a arrancar sola cada vez que entres a Windows." -ForegroundColor Green
Write-Host "- Lo que va pasando:   $registro"
Write-Host "- El informe del mes:  $Trabajo\AAAA-MM\"
Write-Host "La primera grabación tarda más: baja el modelo de Whisper (una sola vez)."
