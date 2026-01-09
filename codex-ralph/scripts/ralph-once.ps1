param(
  [string]$PromptPath = ".\\plans\\PROMPT.md",
  [string]$OutputPath = ".\\plans\\last-message.txt",
  [string]$Model = "",
  [switch]$SkipGitCheck
)

$ralphPath = Join-Path $PSScriptRoot "ralph.ps1"

& $ralphPath `
  -MaxIterations 1 `
  -PromptPath $PromptPath `
  -OutputPath $OutputPath `
  -Model $Model `
  -SkipGitCheck:$SkipGitCheck
