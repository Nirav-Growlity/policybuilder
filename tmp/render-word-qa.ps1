param([string]$Match = '*-sustainable-procurement.docx')
$ErrorActionPreference = 'Stop'
$taskDirectory = 'D:\Policy PoC\src\.theme-qa\professional'
$wordOutputDirectory = Join-Path $taskDirectory 'word-render'
New-Item -ItemType Directory -Path $wordOutputDirectory -Force | Out-Null
$wordApplication = New-Object -ComObject Word.Application
$wordApplication.Visible = $false
$wordApplication.DisplayAlerts = 0
try {
  foreach ($documentFile in Get-ChildItem -LiteralPath $taskDirectory -Filter $Match) {
    $wordDocument = $null
    try {
      $wordDocument = $wordApplication.Documents.Open($documentFile.FullName, $false, $true, $false)
      $wordDocument.Repaginate()
      $pdfDestination = Join-Path $wordOutputDirectory ($documentFile.BaseName + '.pdf')
      $wordDocument.ExportAsFixedFormat($pdfDestination, 17)
      Write-Output ('Rendered ' + $documentFile.Name)
    } finally {
      if ($null -ne $wordDocument) { $wordDocument.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordDocument) }
    }
  }
} finally { $wordApplication.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordApplication) }
