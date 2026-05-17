$content = Get-Content 'C:\Users\ivanm\.gemini\antigravity\brain\08f536c5-e86c-4588-9077-05b8baba7bab\.system_generated\steps\44\content.md' -Raw
$jsonStart = $content.IndexOf('{')
$jsonContent = $content.Substring($jsonStart)
$data = $jsonContent | ConvertFrom-Json
Write-Host "Total products: $($data.products.Count)"
Write-Host ""
foreach($p in $data.products) {
    $price = $p.variants[0].price
    $type = $p.product_type
    $tags = ($p.tags -join ',')
    Write-Host "$($p.title) | `$$price | Type: $type | Tags: $tags"
}
