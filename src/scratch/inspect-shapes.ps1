$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open('D:\Policy PoC\src\scratch\fixed-ids.docx')
  Write-Host "Shapes count: $($doc.Shapes.Count)"
  foreach ($s in $doc.Shapes) {
    Write-Host "Shape: Name=$($s.Name) Type=$($s.Type) Left=$($s.Left) Top=$($s.Top) Width=$($s.Width) Height=$($s.Height) HasText=$($s.TextFrame.HasText)"
    if ($s.TextFrame.HasText) {
      Write-Host "  Text: $($s.TextFrame.TextRange.Text.Trim())"
      Write-Host "  FontColor: $($s.TextFrame.TextRange.Font.Color) ColorIndex: $($s.TextFrame.TextRange.Font.ColorIndex)"
    }
  }
  $doc.Close([ref]0)
} finally {
  $word.Quit()
}
