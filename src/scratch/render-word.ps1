$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open('D:\Policy PoC\src\scratch\db-policy.docx')
  $doc.SaveAs([ref]'D:\Policy PoC\src\scratch\db-policy-rendered.pdf', [ref]17)
  $doc.Close([ref]0)
  Write-Host "RENDER_OK"
} catch {
  Write-Error $_
} finally {
  $word.Quit()
}
