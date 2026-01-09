param(
  [Parameter(Mandatory = $true)]
  [int]$MaxIterations,

  [string]$PromptPath = ".\\plans\\PROMPT.md",
  [string]$OutputPath = ".\\plans\\last-message.txt",
  [string]$Model = "",
  [switch]$SkipGitCheck
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  throw "codex CLI not found in PATH."
}

if (-not (Test-Path $PromptPath)) {
  throw "Prompt file not found: $PromptPath"
}

if (-not $SkipGitCheck) {
  $gitOk = $false
  try {
    git rev-parse --is-inside-work-tree *>$null
    $gitOk = $true
  } catch {
    $gitOk = $false
  }

  if (-not $gitOk) {
    throw "Not in a git repo. Run git init or use -SkipGitCheck."
  }
}

$workspace = (Get-Location).Path

for ($i = 1; $i -le $MaxIterations; $i++) {
  Write-Host ("=== Ralph iteration {0} of {1} ===" -f $i, $MaxIterations)

  $prompt = Get-Content -Raw -Path $PromptPath
  $args = @(
    "exec",
    "-C", $workspace,
    "--output-last-message", $OutputPath,
    "--dangerously-bypass-approvals-and-sandbox"
  )

  if ($SkipGitCheck) {
    $args += "--skip-git-repo-check"
  }

  if ($Model -ne "") {
    $args += @("-m", $Model)
  }

  $prompt | codex @args

  if (Test-Path $OutputPath) {
    $last = Get-Content -Raw -Path $OutputPath
    if ($last -match "PROMISE COMPLETE") {
      Write-Host "PROMISE COMPLETE detected. Stopping."
      break
    }
  }
}
