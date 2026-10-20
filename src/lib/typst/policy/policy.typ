// Policy document template. Reads the model built by lib/typst/policy/model.ts
// from /model.json and lays it out to match the professional templates of the
// HTML preview (components/policy/policy-preview.tsx) as printed by Chromium
// (lib/pdf/print-document.tsx). Lengths in the model are millimetres.
//
// Text metrics follow CSS: every line box is exactly line-height x size, with
// the baseline placed from the font's ascent and descent (see `css-edges`).
// Chromium breaks lines greedily and only stretches spaces when justifying,
// so lines break "simple" and justification never shrinks.

#let m = json("/model.json")
#let t = m.theme
#let pal = t.colors
#let col(hex) = rgb(hex)
#let primary = col(pal.primary)
#let primary-dark = col(pal.primaryDark)
#let soft = col(pal.soft)
#let paper = col(pal.paper)
#let ink = col(pal.ink)
#let muted = col(pal.muted)
#let line-color = col(pal.line)
#let accent = col(pal.accent)
#let on-primary = col(pal.onPrimary)
#let mm(value) = value * 1mm
#let px = 0.75pt

#let typo = m.typography
#let body-font = typo.body
#let head-font = typo.heading
#let body-size = typo.paragraphSize * 1pt
#let heading-size = typo.headingSize * 1pt
#let subheading-size = typo.subheadingSize * 1pt
#let lh = typo.lineSpacing
#let align-map = (left: left, center: center, right: right, justify: left)
#let content-align = align-map.at(t.alignment)
#let justified = t.alignment == "justify"
#let label-align = align-map.at(t.tableLabelAlignment)

// CSS line box: half the leading above the ascent and half below the descent.
#let css-edges(family, line-height) = {
  let f = m.fonts.at(family, default: (ascent: 0.9, descent: 0.25))
  let half = (line-height - f.ascent - f.descent) / 2
  (top: (f.ascent + half) * 1em, bottom: -(f.descent + half) * 1em)
}
// Chromium draws variable fonts with opsz at the CSS px size (font-optical-sizing: auto).
// Families with an opsz axis come as "<family> Opsz <size>" instances, built per weight;
// upright text uses the nearest size built for its weight, anything else the base
// family at its default opsz.
#let weight-number = (thin: 100, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900)
#let face(family, size, weight: "regular", style: "normal") = {
  let w = if type(weight) == str { weight-number.at(weight) } else { weight }
  let sizes = m.opticalSizes.at(family, default: (:)).at(str(w), default: none)
  if sizes == none or style != "normal" { return family }
  let target = size / px
  let nearest = sizes.sorted(key: s => calc.abs(s - target)).first()
  (family + " Opsz " + str(nearest), family)
}
#let css(family: body-font, size: body-size, line-height: lh, weight: "regular", fill: ink, tracking: 0pt, style: "normal", body) = {
  let edges = css-edges(family, line-height)
  set text(font: face(family, size, weight: weight, style: style), size: size, weight: weight, fill: fill, tracking: tracking, style: style, top-edge: edges.top, bottom-edge: edges.bottom)
  set par(leading: 0pt, spacing: 0pt)
  body
}

#set document(title: m.meta.title, author: m.meta.author)
// Justified text hyphenates, as the soft hyphens did in the HTML preview.
// No hanging punctuation: Chromium never lets a comma or hyphen into the margin.
#set text(font: face(body-font, body-size), size: body-size, fill: ink, lang: "en", region: "us", hyphenate: justified, overhang: false,
  top-edge: css-edges(body-font, lh).top, bottom-edge: css-edges(body-font, lh).bottom)
#set par(justify: justified, linebreaks: "simple", leading: 0pt, spacing: 0pt,
  justification-limits: (spacing: (min: 100%, max: 1000%), tracking: (min: 0em, max: 0em)))
// A CSS block fills its container; Typst's would shrink to its content.
#set block(spacing: 0pt, width: 100%)

// ---------------------------------------------------------------- page furniture

#let page-fill = {
  let bg = m.page.background
  if bg.kind == "solid" { col(bg.color) }
  else {
    // Chromium's PDF draws the gradient corner to corner, not at the CSS 135deg.
    let angle = if bg.direction == "horizontal" { 0deg } else if bg.direction == "vertical" { 90deg } else { calc.atan2(m.page.widthMm, m.page.heightMm) }
    gradient.linear(col(bg.from), col(bg.to), angle: angle)
  }
}

#let border-on(page-number) = {
  let b = m.page.border
  b.enabled and (b.scope == "all" or (b.scope == "cover" and page-number == 1) or (b.scope == "all-except-cover" and page-number > 1))
}

#let cover-is-image = m.cover.kind == "composition"

// Chromium offsets header and footer templates from their CSS positions; these
// were measured from its PDFs (scripts/pdf-text-dump.ts).
#let header-drop = 5.3mm
#let footer-rule-y = 297mm - 5.2mm - mm(m.footer.heightMm) - mm(m.footer.shiftMm)

#let header-brand() = {
  let h = m.header
  let brand = h.brand
  let box-width = if brand.kind == "logo" { mm(brand.widthMm) } else { 28mm * 1 }
  let x = if h.position == "right" { 210mm - mm(h.insetMm) - box-width }
    else if h.position == "center" { 105mm - box-width / 2 }
    else { mm(h.insetMm) }
  if brand.kind == "logo" {
    place(top + left, dx: x, dy: mm(h.logoTopMm) + header-drop,
      box(width: box-width, height: mm(brand.heightMm), align(center + horizon, image(brand.image, width: box-width, height: mm(brand.heightMm), fit: "contain"))))
  } else {
    // 8 px Arial; the first baseline sits 6.8 mm below the logo top.
    let name = css(family: "Arimo", size: 6pt, line-height: 1.15, fill: ink, brand.text)
    place(top + left, dx: x, dy: mm(h.logoTopMm) + 6.82mm - 6pt * 0.97,
      context {
        let natural = measure(name).width
        if natural <= box-width { box(width: box-width, align(center, name)) }
        else { box(width: box-width, par(justify: false, name)) }
      })
  }
}

// Chromium cannot load web fonts into its footer template, so today's footer
// prints in Arial; Arimo keeps that look. The baseline is 6.86 mm below the rule.
#let footer-bar() = {
  let inset = mm(m.footer.insetMm)
  let label(body) = text(weight: "bold", body)
  place(top + left, dx: inset, dy: footer-rule-y, line(length: 210mm - 2 * inset, stroke: (paint: line-color, thickness: px)))
  place(top + left, dx: inset, dy: footer-rule-y + 6.86mm - 7.5pt, block(width: 210mm - 2 * inset,
    text(font: "Arimo", size: 7.5pt, fill: ink, top-edge: 1em, bottom-edge: 0em, grid(
      columns: (1fr, 1.5fr, 1fr), column-gutter: 8mm,
      align(left, [#label[Document No.] #m.footer.documentNumber]),
      align(center, [#label[Next Review] #m.footer.reviewDate]),
      align(right, [#label[Page] #counter(page).display() / #counter(page).final().first()]),
    ))))
}

#let page-background() = context {
  let n = here().page()
  if border-on(n) {
    let b = m.page.border
    place(top + left, dx: mm(b.insetMm), dy: mm(b.insetMm),
      rect(width: 210mm - 2 * mm(b.insetMm), height: 297mm - 2 * mm(b.insetMm), stroke: (paint: col(b.color), thickness: b.widthPt * 1pt)))
  }
  // The cover never carries the running header; an image cover has no footer either.
  if n > 1 { header-brand() }
  if not (n == 1 and cover-is-image) { footer-bar() }
}

#set page(
  width: 210mm, height: 297mm,
  margin: (top: mm(m.page.marginTopMm), x: mm(m.page.marginXMm), bottom: mm(m.page.marginBottomMm)),
  fill: page-fill,
  header: none, footer: none,
  background: page-background(),
)
#let outline-pass = m.at("outlinePass", default: false)
#set page(margin: 0pt, fill: none, background: none) if outline-pass

// ---------------------------------------------------------------- shared pieces

// CSS `text-wrap: balance`: the narrowest width that keeps the line count.
#let balanced(max-width, body) = context {
  let height = measure(block(width: max-width, body)).height
  let low = max-width * 0.3
  let high = max-width
  for _ in range(14) {
    let mid = (low + high) / 2
    if measure(block(width: mid, body)).height > height + 0.5pt { low = mid } else { high = mid }
  }
  block(width: high, body)
}

#let para(body) = block(below: 12 * px, par(justify: justified, body))

// ---------------------------------------------------------------- cover

#let standard-cover() = {
  let c = m.cover
  // The simplified cover fills the printable area with a 48 px inset.
  block(width: 100%, inset: 48 * px, {
    if c.feature != none {
      block(below: 10mm, image(c.feature.image, width: 100%, height: 52mm, fit: "cover"))
    }
    // The brand row is at least 34 px tall; a logo is at most 38% wide and 64 px tall.
    layout(size => context {
      let brand = if c.brand.kind == "logo" {
        let natural = measure(image(c.brand.image))
        image(c.brand.image, width: calc.min(size.width * 0.38, 64 * px * (natural.width / natural.height)))
      } else {
        css(size: 14 * px, weight: "bold", fill: primary, c.brand.text)
      }
      block(height: calc.max(34 * px, measure(brand, width: size.width).height), brand)
    })
    v(42 * px)
    let title = css(family: head-font, size: heading-size * 2.65, line-height: 1.04, weight: "bold", fill: primary, {
      set text(hyphenate: false)
      par(justify: false, c.title)
    })
    layout(size => balanced(size.width * 0.76, title))
  })
}

// One cover text layer, placed against the page's top-left corner (`origin`
// is that corner relative to the current position).
#let cover-text(layer, origin, stroke: none) = {
  let drawn = css(family: layer.font, size: layer.size * 1pt, line-height: layer.lineHeight, weight: if layer.bold { "bold" } else { "regular" },
    fill: if stroke == none { col(layer.color).transparentize(100% - layer.opacity * 100%) } else { rgb(0, 0, 0, 0) },
    tracking: layer.letterSpacing * 1pt, style: if layer.italic { "italic" } else { "normal" }, {
      set text(stroke: stroke)
      show: it => if layer.underline { underline(it) } else { it }
      par(justify: false, layer.lines.join("
"))
    })
  place(top + left, dx: mm(layer.x) + origin.x, dy: mm(layer.y) + origin.y,
    rotate(layer.rotation * 1deg, origin: center + horizon, reflow: false,
      box(width: mm(layer.width), height: mm(layer.height), clip: true, align(align-map.at(layer.align), drawn))))
}

// The AI cover's soft text shadow becomes a dark outline painted behind the
// glyphs (SVG `paint-order: stroke fill`), as in the Word export. Typst strokes
// on top of the fill, so the outlines are drawn on their own in a first pass
// (`outlinePass`), exported as SVG and placed under the text: they are shapes,
// not a second copy of the text, so copying the title gets it once.
#let outline-stroke = (paint: rgb(0, 0, 0, 45%), thickness: 0.35mm)

#let composition-cover() = {
  let c = m.cover
  let origin = (x: -mm(m.page.marginXMm), y: -mm(m.page.marginTopMm))
  place(top + left, dx: origin.x, dy: origin.y, image(c.image, width: 210mm, height: 297mm))
  if c.outline != none { place(top + left, dx: origin.x, dy: origin.y, 
    // Both sizes: a placed SVG with only a width lands off by the margin.
    image(c.outline.image, width: c.outline.widthPt * 1pt, height: c.outline.heightPt * 1pt)) }
  for layer in c.texts { cover-text(layer, origin) }
}

// ---------------------------------------------------------------- contents

#let contents() = {
  let toc = m.toc
  // Titles keep the document alignment but are never hyphenated (they carry no soft hyphens in HTML).
  let entry(e) = link(label("section-" + e.id), css(size: 10.5pt, fill: primary-dark, {
    set text(hyphenate: false)
    grid(columns: (auto, 1fr), column-gutter: 5mm,
      text(fill: primary, number-type: "lining", number-width: "tabular", e.marker),
      align(content-align, par(justify: justified, e.title)))
  }))
  let body = {
    let heading-block = css(family: head-font, size: 17pt, line-height: 1.14, weight: "semibold", fill: primary, [Contents])
    block(below: 7mm, if t.variant == "institutional" { align(center, heading-block) } else { heading-block })
    if t.layout.toc == "tile-index" {
      grid(columns: (1fr, 1fr), column-gutter: 3mm, row-gutter: 3mm,
        // A CSS border adds to the box; a Typst stroke does not, so the inset carries it.
        ..toc.entries.map(e => block(fill: soft, stroke: (paint: line-color, thickness: px), inset: 5mm + px, entry(e))))
    } else {
      for e in toc.entries { block(inset: (y: 3mm), entry(e)) }
    }
  }
  // The rail is the contents section's own left border, padding included.
  if t.layout.toc == "rail-index" {
    block(stroke: (left: (paint: primary, thickness: 3 * px)), inset: (left: 10mm, y: 12mm), body)
  } else {
    block(inset: (y: 12mm), body)
  }
}

// ---------------------------------------------------------------- body
//
// Sizes below are the computed styles Chromium prints for the professional
// templates (scripts/policy-css-probe.ts), in CSS px where the stylesheet uses
// px. Margins follow CSS: they collapse between siblings (Typst block spacing
// takes the larger of two neighbours), but stay inside a padded box, where
// `kept` adds them back as strong spacing.

#let frame = t.layout.pageFrame
#let variant = t.variant
// Headings inherit the body's alignment (a wrapped heading justifies) but never hyphenate.
#let heading-par(body) = { set text(hyphenate: false); par(justify: justified, body) }
#let subhead(body, fill: primary) = css(family: head-font, size: subheading-size, line-height: 1.2, weight: "bold", fill: fill, heading-par(body))
#let kept(amount) = v(amount, weak: false)
// A box's bottom padding: Chromium moves it whole to the next page when it does
// not fit, where Typst would drop spacing at a page end. Margins before it stay
// weak, so they still vanish at a break as CSS margins do.
#let pad-end(amount) = block(height: amount, breakable: false)

// The first baseline of a CSS line box, for rows laid out with `align-items: baseline`.
#let first-baseline(family, size, line-height) = {
  let f = m.fonts.at(family, default: (ascent: 0.9, descent: 0.25))
  (f.ascent + (line-height - f.ascent - f.descent) / 2) * size
}
// A flex row aligned on baselines: each item is (body, family, size, line-height, width).
#let baseline-row(gap, items) = {
  let base = calc.max(..items.map(i => first-baseline(i.family, i.size, i.lh)))
  // Blocks fill their container by default here; an auto-width cell must shrink to its content.
  grid(columns: items.map(i => i.width), column-gutter: gap,
    ..items.map(i => {
      set block(width: if i.width == auto { auto } else { 100% })
      pad(top: base - first-baseline(i.family, i.size, i.lh), i.body)
    }))
}

// An outside CSS list marker ("•" or "1.") ends one space before the item text.
// `leading`: the list opens a table cell or grid item, where CSS keeps the first
// item's top margin inside instead of collapsing it away.
#let css-list(items, style, indent: 19 * px, item-gap: 5 * px, size: body-size, line-height: lh, trailing: none, leading: false) = {
  if leading { kept(item-gap) }
  for (index, item) in items.enumerate() {
    let marker = if style == "bullet" { "•" } else { str(index + 1) + "." }
    block(above: item-gap, below: item-gap, css(size: size, line-height: line-height, grid(columns: (indent, 1fr),
      // A no-break space keeps "1. " together and copies as a space.
      align(right, marker + "\u{00A0}"),
      par(justify: justified, item))))
  }
  if trailing != none { kept(trailing) }
}

#let section-heading(s) = block(below: 5mm, sticky: true,
  stroke: (bottom: (paint: primary, thickness: px)), inset: (bottom: 2.5mm), {
    let marker-shown = frame != "numbered-rail" and frame != "editorial-margin"
    let marker = css(size: heading-size, line-height: lh, weight: "extrabold", fill: primary, tracking: 0.12em, s.marker)
    let title = css(family: head-font, size: heading-size, line-height: 1.14, weight: "semibold", fill: primary, tracking: -0.01em,
      heading-par(s.title))
    let items = (
      (body: title, family: head-font, size: heading-size, lh: 1.14, width: 1fr),
    )
    if marker-shown { items.insert(0, (body: marker, family: body-font, size: heading-size, lh: lh, width: auto)) }
    baseline-row(4mm, items)
  })

// ------------------------------------------------ tables

#let institutional = variant == "institutional"
#let cell(body, alignment: content-align, padding: (x: 2mm, y: 2.5mm)) = table.cell(inset: padding, align(alignment, body))
#let cell-text(body, justify: justified) = css(size: 9.5pt, line-height: 1.35, par(justify: justify, body))
#let header-text(body) = css(family: if institutional or variant == "editorial" { head-font } else { body-font },
  size: 9.5pt, line-height: 1.35, weight: "semibold", fill: primary, { set text(hyphenate: false); par(justify: false, body) })
#let zebra = t.layout.dataLayout == "target-bands"

#let data-table(tbl, columns: none, cells: none, header-padding: (x: 2mm, y: 2.5mm), header-align: none) = block(above: 17 * px, {
  let count = tbl.headers.len()
  let head-align = if header-align != none { header-align } else if institutional { center } else { content-align }
  // `tr { break-inside: avoid }`: a row that does not fit moves to the next page.
  set table.cell(breakable: false)
  table(
    columns: if columns != none { columns } else { (1fr,) * count },
    stroke: (paint: line-color, thickness: px),
    inset: 0pt,
    fill: (x, y) => if y == 0 { soft } else if zebra and calc.even(y) { soft } else { none },
    table.header(..tbl.headers.map(h => cell(header-text(h), alignment: head-align + horizon, padding: header-padding))),
    ..if cells != none { cells } else {
      tbl.rows.map(row => row.enumerate().map(((i, c)) => {
        let last = i == row.len() - 1
        let alignment = if institutional { center } else if last { content-align } else { label-align }
        cell(cell-text(c, justify: justified and last and not institutional), alignment: alignment + top)
      })).flatten()
    },
  )
})

// ------------------------------------------------ content

#let para(body) = block(below: 12 * px, par(justify: justified, body))

#let target-list(targets, style, size: body-size, line-height: lh, leading: false) = css-list(targets, style, indent: 5mm, item-gap: 1.5mm, size: size, line-height: line-height, trailing: 1.5mm, leading: leading)

#let focus-list(c, recipe) = {
  let marker-style = if recipe == "atlas-modules" { (size: 22 * px, weight: "medium", family: body-font) }
    else if recipe == "journal-entries" { (size: 20 * px, weight: "regular", family: head-font) }
    else { (size: body-size, weight: "bold", family: body-font) }
  for item in c.items {
    block(inset: (y: 2.5mm), {
      let row = grid(columns: (auto, 1fr), column-gutter: 4mm, align: horizon,
        box(width: 8mm, align(center, css(family: marker-style.family, size: marker-style.size, weight: marker-style.weight, fill: primary, item.marker))),
        pad(x: 13 * px, y: 10 * px, par(justify: justified, item.text)))
      if recipe == "atlas-modules" {
        // min-height: 82px, content centred.
        context {
          let height = measure(row, width: 166mm).height
          block(height: calc.max(height, 82 * px - 5mm), align(horizon, row))
        }
      } else { row }
    })
  }
}

#let qualitative-groups(c, recipe) = {
  let marker = if recipe == "journal-entries" { (family: head-font, weight: "regular", fill: accent) }
    else if recipe == "atlas-modules" { (family: body-font, weight: "medium", fill: primary) }
    else { (family: body-font, weight: "bold", fill: primary) }
  for g in c.groups {
    // Padding, not inset: a broken Typst block repeats its inset on every page.
    block(below: 6mm, {
      kept(3mm)
      block(below: 2mm, sticky: true, baseline-row(4mm, (
        (body: css(family: marker.family, size: subheading-size, line-height: lh, weight: marker.weight, fill: marker.fill, g.marker), family: marker.family, size: subheading-size, lh: lh, width: auto),
        (body: subhead(g.area), family: head-font, size: subheading-size, lh: 1.2, width: 1fr),
      )))
      block(above: 9 * px, css-list(g.items, c.itemMarker))
      v(5 * px)
      pad-end(3mm)
    })
  }
}

#let quantitative(c) = {
  if c.treatment == "table" {
    // Label cells never justify (tableLabelAlignment), so they skip `subhead`'s justified paragraph.
    let marker-cell(body, alignment) = cell(css(family: head-font, size: subheading-size, line-height: 1.2, weight: "bold", fill: primary,
      { set text(hyphenate: false); par(justify: false, body) }), alignment: alignment + top, padding: (x: 1.5mm, y: 2mm))
    data-table((headers: (c.indexHeader, "Focus Area", "Targets"), rows: ()),
      columns: (15.76%, 32.84%, 1fr), header-padding: (x: 1.5mm, y: 2mm),
      cells: c.groups.map(g => (
        marker-cell(g.marker, center),
        marker-cell(g.area, label-align),
        cell(target-list(g.targets, c.itemMarker, size: 9.5pt, line-height: 1.35, leading: true), alignment: top, padding: (x: 1.5mm, y: 2mm)),
      )).flatten())
  } else if c.treatment == "bands" {
    // Grid gaps sit between items only, never after the last one.
    for (i, g) in c.groups.enumerate() {
      block(above: if i > 0 { 8 * px } else { 0pt }, grid(columns: (52 * px, 1fr), fill: soft,
        grid.cell(align(center + horizon, subhead(g.marker))),
        // Vertical padding as spacing, not inset: Chromium slices a band at a page break,
        // where a cell inset would pad both fragments.
        grid.cell(stroke: (x: (paint: line-color, thickness: px)), inset: (x: 15 * px),
          { kept(13 * px); subhead(g.area); target-list(g.targets, c.itemMarker); pad-end(13 * px) })))
    }
  } else if c.treatment == "journal" {
    for g in c.groups {
      block({ kept(14 * px); grid(columns: (150 * px, 1fr), subhead(g.area), target-list(g.targets, c.itemMarker, leading: true)); kept(14 * px) })
    }
  } else {
    for (i, g) in c.groups.enumerate() {
      block(above: if i > 0 { 9 * px } else { 0pt }, { kept(10 * px); grid(columns: (42 * px, 1fr), subhead(g.marker), { subhead(g.area); target-list(g.targets, c.itemMarker) }) })
    }
  }
}

#let sdg-goals(c) = {
  if c.display == "tiles" {
    let tile(g) = if c.mosaic {
      box(width: 100 * px, fill: soft, {
        image(g.icon, width: 100 * px, height: 100 * px)
        block(inset: 7 * px, css(size: 8 * px, weight: "bold", { set text(hyphenate: false); par(justify: false, g.label) }))
      })
    } else { box(width: 100 * px, image(g.icon, width: 100 * px, height: 100 * px)) }
    // flex-wrap with a 10px gap, tiles aligned to the top of each row.
    block({
      set par(justify: false, leading: 10 * px)
      c.goals.filter(g => g.icon != none).map(g => box(tile(g))).join(h(10 * px))
    })
  } else {
    for (i, g) in c.goals.enumerate() {
      block(above: if i > 0 { 7 * px } else { 0pt }, grid(columns: (80 * px, 1fr), stroke: (paint: col(g.color), thickness: px), inset: 0pt,
        // The 1px CSS border adds to the row height; a Typst stroke does not.
        grid.cell(fill: col(g.color), inset: (x: 8 * px, y: 8 * px + px), css(size: 9 * px, weight: "bold", fill: white, "SDG " + str(g.number))),
        grid.cell(inset: (x: 11 * px, y: 8 * px + px), par(justify: justified, g.label))))
    }
  }
}

#let responsibilities(c, density) = {
  if c.treatment == "table" {
    data-table((headers: ("Role / Department", "Responsibility"), rows: c.entries.map(e => (e.role, e.duty))))
    return
  }
  let card(e) = {
    let marker = if frame == "editorial-margin" { css(family: head-font, size: 20 * px, line-height: 1.5, fill: accent, e.marker) }
      else { css(weight: "bold", fill: primary, e.marker) }
    grid(columns: (if frame == "editorial-margin" { 56 * px } else { 42 * px }, 1fr), marker,
      { subhead(e.role); v(5 * px); par(justify: justified, e.duty) })
  }
  let two-up = (frame == "numbered-rail" or frame == "modular-grid") and density != "dense"
  if two-up {
    // A card's text never splits, but a card that does not fit leaves its top
    // padding on the page and continues flush at the top of the next one, as
    // Chromium fragments the grid row. min-height: 115px on soft cards.
    let soft-card = frame == "modular-grid"
    let pad = if soft-card { 15 * px } else { 12 * px + px }
    grid(columns: (1fr, 1fr), gutter: 9 * px, ..c.entries.map(e => grid.cell(
      fill: if soft-card { soft } else { none },
      stroke: if soft-card { none } else { (paint: line-color, thickness: px) },
      inset: (x: pad),
      {
        kept(pad)
        layout(size => {
          let body = card(e)
          let height = measure(body, width: size.width).height
          block(breakable: false, height: if soft-card { calc.max(height, 115 * px - 2 * pad) } else { height }, body)
        })
        kept(pad)
      })))
  } else {
    for (i, e) in c.entries.enumerate() { block(above: if i > 0 { 9 * px } else { 0pt }, { kept(10 * px); card(e) }) }
  }
}

#let custom-blocks(c) = {
  for b in c.blocks {
    if b.type == "p" { for p in b.paragraphs { para(p) } }
    else if b.type == "table" { data-table(b.table) }
    else { block(above: 12 * px, below: 12 * px, css-list(b.items, if b.type == "ul" { "bullet" } else { "number" }, indent: 20 * px)) }
  }
}

#let section-body(s) = {
  let c = s.content
  if c.type == "narrative" {
    for p in c.paragraphs { para(p) }
    if c.sites != none { data-table(c.sites) }
  } else if c.type == "focus" { focus-list(c, s.recipe) }
  else if c.type == "qualitative" { qualitative-groups(c, s.recipe) }
  else if c.type == "quantitative" { quantitative(c) }
  else if c.type == "sdg" { sdg-goals(c) }
  else if c.type == "responsibilities" { responsibilities(c, s.density) }
  else if c.type == "table" { data-table(c.table) }
  else if c.type == "custom" { custom-blocks(c) }
}

// Code mode, not markup: whitespace between the heading and the body would
// become a paragraph and break the heading's `sticky` keep-with-next.
// ------------------------------------------------ section frames

// The bottom margin of a section's last child, for wrappers that would drop
// it (the rail body's padding, the editorial grid cell). Grid gaps are not margins.
#let last-margin(s) = {
  let c = s.content
  if c.type == "narrative" { if c.sites != none { 0pt } else { 12 * px } }
  else if c.type == "qualitative" { 6mm }
  else if c.type == "custom" and c.blocks.len() > 0 { if c.blocks.last().type == "table" { 0pt } else { 12 * px } }
  else { 0pt }
}

#let section-content(s) = {
  [#section-heading(s)#label("section-" + s.id)]
  section-body(s)
}

// A section is 9 mm from the next; unframed and editorial sections also keep
// 45 px x density between them, the larger margin winning as in CSS.
#let section-gap = if frame == "numbered-rail" or frame == "modular-grid" { 9mm } else { calc.max(9mm, 45 * px * t.densityFactor) }

#let render-section(s, first, last) = {
  // Before the acknowledgement's forced page break, a padding that does not fit
  // is dropped, as Chromium does, instead of opening a blank page.
  let end-pad(amount) = if last { v(amount, weak: true) } else { pad-end(amount) }
  let above = if first { 0pt } else { section-gap }
  if frame == "modular-grid" {
    // A soft box, 5 mm padding inside a 1 px border (a CSS border adds to the box).
    block(above: above, below: 9mm, fill: soft, stroke: (paint: line-color, thickness: px), inset: (x: 5mm + px), {
      kept(5mm + px)
      // The last child's own bottom spacing precedes the padding, as its CSS margin does.
      section-content(s)
      end-pad(5mm + px)
    })
  } else if frame == "numbered-rail" {
    // The rail is the primary-filled 18 mm aside. Its number used to print in the
    // primary colour on the primary rail; it now prints in the on-primary colour.
    block(above: above, below: 9mm, grid(columns: (18mm, 1fr), column-gutter: 7mm,
      grid.cell(fill: primary, { kept(28 * px); pad(x: 22 * px, css(size: 24 * px, line-height: 1.3, weight: "medium", fill: on-primary, s.marker)) }),
      layout(size => {
        let body = { kept(30 * px); pad(left: 38 * px, right: 50 * px, section-content(s)); v(last-margin(s)); end-pad(36 * px) }
        // The rail is at least 190 px tall.
        let height = measure(body, width: size.width).height
        body
        if height < 190 * px { kept(190 * px - height) }
      })))
  } else if frame == "editorial-margin" {
    block(above: above, below: 9mm, grid(columns: (18mm, 1fr), column-gutter: 7mm,
      { kept(4 * px); css(family: head-font, size: 24 * px, line-height: 1, fill: accent, s.marker) },
      // A grid item: its last child's margin stays inside it.
      { section-content(s); kept(last-margin(s)) }))
  } else {
    block(above: above, below: 9mm, section-content(s))
  }
}

#let acknowledgement() = {
  let a = m.acknowledgement
  pagebreak(weak: true)
  block(width: 100%, inset: (top: 27pt), [
    #block(below: 7pt, css(family: head-font, size: 18pt, line-height: 1.14, weight: "semibold", fill: primary, a.title)) #label("section-acknowledgement")
    #block(below: 14.1pt, css(line-height: lh * 1.22, par(justify: justified, a.statement)))
    // Each field: a 7 pt label, 5 pt gap, an underlined value line (11 pt, or the
    // 44 px signature mark) and its 8.5 pt bottom margin (13 pt under the signature).
    #grid(columns: (1fr, 1fr), row-gutter: 3.7pt, ..a.fields.map(f => block(inset: (x: 7pt), {
      let signature = f.label == "Signature"
      let rule = (bottom: (paint: muted, thickness: 0.75pt))
      kept(6pt)
      block(below: 5pt, css(size: 7pt, weight: "extrabold", fill: muted, tracking: 1.75pt, upper(f.label)))
      if signature and a.signature != none {
        block(height: 44 * px, stroke: rule, align(left + bottom, context {
          // max-width 180 px, max-height 44 px, kept at the bottom left.
          let natural = measure(image(a.signature))
          if natural.width / natural.height > 180 / 44 { image(a.signature, width: 180 * px) } else { image(a.signature, height: 44 * px) }
        }))
      } else if f.value != none {
        block(height: 11pt, stroke: rule, css(line-height: 1, f.value))
      } else {
        block(height: 11pt, stroke: rule)
      }
      kept(if signature { 13pt } else { 8.5pt } + 6pt)
    })))
  ])
}

// ---------------------------------------------------------------- document

#if outline-pass {
  for layer in m.cover.texts.filter(layer => layer.outline) { cover-text(layer, (x: 0pt, y: 0pt), stroke: outline-stroke) }
} else {
  if m.cover.kind == "composition" { composition-cover() } else { standard-cover() }
  pagebreak()
  if m.toc != none {
    contents()
    pagebreak()
  }
  if m.sectionFeature != none {
    block(width: 100%, height: 250 * px, clip: true, stroke: (y: (paint: line-color, thickness: px)), image(m.sectionFeature.image, width: 100%, height: 250 * px, fit: "cover"))
  }
  for (i, s) in m.sections.enumerate() { render-section(s, i == 0, i == m.sections.len() - 1) }
  if m.acknowledgement != none { acknowledgement() }
}
