param(
  [Parameter(Mandatory = $true)]
  [int]$MaxIterations,

  [string]$Model = "",
  [switch]$SkipGitCheck
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ralphRoot = Join-Path $repoRoot "codex-ralph"
$ralphScript = Join-Path $ralphRoot "scripts\\ralph.ps1"
$promptPath = Join-Path $ralphRoot "plans\\PROMPT.md"
$outputPath = Join-Path $ralphRoot "plans\\last-message.txt"

Push-Location $repoRoot
try {
  & $ralphScript `
    -MaxIterations $MaxIterations `
    -PromptPath $promptPath `
    -OutputPath $outputPath `
    -Model $Model `
    -SkipGitCheck:$SkipGitCheck
} finally {
  Pop-Location
}
