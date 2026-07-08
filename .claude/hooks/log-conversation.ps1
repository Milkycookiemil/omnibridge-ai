# OmniBridge AI — 대화 로거 (decision.log)
# Claude Code hook가 stdin으로 넘겨주는 JSON을 읽어 decision.log에 추가한다.
# UserPromptSubmit: 사용자 메시지 기록 / Stop: 직전 assistant 응답 기록
$ErrorActionPreference = 'SilentlyContinue'

$root    = 'D:\claude code\omnibridge-ai'
$logPath = Join-Path $root 'decision.log'

# stdin은 UTF-8로 들어온다. PS 5.1 기본은 시스템 코드페이지라 명시적으로 UTF-8로 읽는다.
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$raw = $reader.ReadToEnd()
if (-not $raw) { exit 0 }
try { $o = $raw | ConvertFrom-Json } catch { exit 0 }

$ts    = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$event = $o.hook_event_name

function Append-Log([string]$block) {
    Add-Content -LiteralPath $logPath -Value $block -Encoding utf8
}

if ($event -eq 'UserPromptSubmit') {
    $text = [string]$o.prompt
    if ($text.Trim().Length -eq 0) { exit 0 }
    Append-Log "`n[$ts] USER:`n$text`n"
}
elseif ($event -eq 'Stop') {
    $tp = [string]$o.transcript_path
    if (-not $tp -or -not (Test-Path -LiteralPath $tp)) { exit 0 }
    $lines = Get-Content -LiteralPath $tp -Encoding UTF8
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        try { $entry = $lines[$i] | ConvertFrom-Json } catch { continue }
        if ($entry.type -ne 'assistant') { continue }
        $content = $entry.message.content
        if (-not $content) { continue }
        $parts = @()
        if ($content -is [string]) {
            $parts += $content
        } else {
            foreach ($c in $content) {
                if ($c.type -eq 'text' -and $c.text) { $parts += [string]$c.text }
            }
        }
        if ($parts.Count -gt 0) {
            $text = ($parts -join "`n")
            Append-Log "`n[$ts] CLAUDE:`n$text`n"
            break
        }
    }
}
exit 0
