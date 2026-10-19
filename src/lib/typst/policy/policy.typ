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
#let css(family: body-font, size: body-size, line-height: lh, weight: "regular", fill: ink, tracking: 0pt, style: "normal", body) = {
  let edges = css-edges(family, line-height)
  set text(font: family, size: size, weight: weight, fill: fill, tracking: tracking, style: style, top-edge: edges.top, bottom-edge: edges.bottom)
  set par(leading: 0pt, spacing: 0pt)
  body
}

#set document(title: m.meta.title, author: m.meta.author)
// Justified text hyphenates, as the soft hyphens did in the HTML preview.
#set text(font: body-font, size: body-size, fill: ink, lang: "en", region: "us", hyphenate: justified,
  top-edge: css-edges(body-font, lh).top, bottom-edge: css-edges(body-font, lh).bottom)
#set par(justify: justified, linebreaks: "simple", leading: 0pt, spacing: 12 * px,
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

#let composition-cover() = {
  let c = m.cover
  place(top + left, dx: -mm(m.page.marginXMm), dy: -mm(m.page.marginTopMm), image(c.image, width: 210mm, height: 297mm))
  for layer in c.texts {
    let size = layer.size * 1pt
    let lines = layer.lines.join("\n")
    let drawn = css(family: layer.font, size: size, line-height: layer.lineHeight, weight: if layer.bold { "bold" } else { "regular" },
      fill: col(layer.color).transparentize(100% - layer.opacity * 100%), tracking: layer.letterSpacing * 1pt,
      style: if layer.italic { "italic" } else { "normal" }, {
        set text(stroke: if layer.outline { (paint: rgb(0, 0, 0, 45%), thickness: 0.35mm) } else { none })
        show: it => if layer.underline { underline(it) } else { it }
        par(justify: false, lines)
      })
    place(top + left, dx: mm(layer.x) - mm(m.page.marginXMm), dy: mm(layer.y) - mm(m.page.marginTopMm),
      rotate(layer.rotation * 1deg, origin: center + horizon, reflow: false,
        box(width: mm(layer.width), height: mm(layer.height), clip: true, align(align-map.at(layer.align), drawn))))
  }
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

// ---------------------------------------------------------------- body (refined in tickets 04 and 05)

#let section-heading(s) = block(width: 100%, below: 5mm, sticky: true,
  stroke: (bottom: (paint: primary, thickness: px)), inset: (bottom: 2.5mm), {
    let marker = css(size: heading-size, line-height: lh, weight: "extrabold", fill: primary, tracking: 0.12em, s.marker)
    let title = css(family: head-font, size: heading-size, line-height: 1.14, weight: "semibold", fill: primary, par(justify: false, s.title))
    grid(columns: (auto, 1fr), column-gutter: 4mm, align: (left + bottom, left + bottom), marker, title)
  })

#let cell-text(body, alignment: content-align) = css(size: 9.5pt, line-height: 1.35, align(alignment, par(justify: false, body)))
#let data-table(tbl) = table(
  columns: tbl.headers.map(_ => 1fr),
  stroke: (paint: line-color, thickness: px),
  inset: (x: 2mm, y: 2.5mm),
  fill: (x, y) => if y == 0 { soft } else { none },
  table.header(..tbl.headers.map(h => cell-text(text(weight: "semibold", fill: primary, h), alignment: center))),
  ..tbl.rows.map(row => row.enumerate().map(((i, c)) => cell-text(c, alignment: if i < row.len() - 1 { label-align } else { content-align }))).flatten(),
)

#let bullet-list(items, marker) = {
  let lines = items.map(i => par(justify: justified, i))
  if marker == "bullet" { list(indent: 0pt, body-indent: 6pt, spacing: 5 * px, ..lines) }
  else { enum(indent: 0pt, body-indent: 6pt, spacing: 5 * px, ..lines) }
}

#let section-body(c) = {
  if c.type == "narrative" {
    for p in c.paragraphs { para(p) }
    if c.sites != none { block(above: 17 * px, data-table(c.sites)) }
  } else if c.type == "focus" {
    for item in c.items { block(inset: (y: 2.5mm), grid(columns: (8mm, 1fr), column-gutter: 4mm, text(weight: "bold", fill: primary, item.marker), item.text)) }
  } else if c.type == "qualitative" {
    for g in c.groups {
      block(inset: (y: 3mm), below: 6mm, {
        block(below: 2mm, grid(columns: (auto, 1fr), column-gutter: 4mm,
          css(size: subheading-size, weight: "bold", fill: primary, g.marker),
          css(family: head-font, size: subheading-size, line-height: 1.2, weight: "bold", fill: primary, g.area)))
        bullet-list(g.items, c.itemMarker)
      })
    }
  } else if c.type == "quantitative" {
    if c.treatment == "table" {
      data-table((headers: (c.indexHeader, "Focus Area", "Targets"), rows: c.groups.map(g => (g.marker, g.area, g.targets.join(" ")))))
    } else {
      for g in c.groups {
        block(inset: (top: 10 * px), grid(columns: (42 * px, 1fr),
          css(family: head-font, size: subheading-size, line-height: 1.2, weight: "bold", fill: primary, g.marker),
          { css(family: head-font, size: subheading-size, line-height: 1.2, weight: "bold", fill: primary, g.area); bullet-list(g.targets, c.itemMarker) }))
      }
    }
  } else if c.type == "sdg" {
    if c.display == "tiles" {
      grid(columns: (100 * px,) * 5, gutter: 10 * px, ..c.goals.filter(g => g.icon != none).map(g => image(g.icon, width: 100 * px)))
    } else {
      for g in c.goals { block(below: 7 * px, stroke: (paint: col(g.color), thickness: px), grid(columns: (80 * px, 1fr),
        block(fill: col(g.color), inset: 8 * px, width: 100%, css(size: 9 * px, fill: white, "SDG " + str(g.number))),
        block(inset: (x: 11 * px, y: 8 * px), g.label))) }
    }
  } else if c.type == "responsibilities" {
    if c.treatment == "table" { data-table((headers: ("Role / Department", "Responsibility"), rows: c.entries.map(e => (e.role, e.duty)))) }
    else {
      for e in c.entries { block(inset: (top: 10 * px), grid(columns: (42 * px, 1fr), text(fill: primary, e.marker),
        { css(family: head-font, size: subheading-size, line-height: 1.2, weight: "bold", fill: primary, e.role); v(5 * px); par(justify: justified, e.duty) })) }
    }
  } else if c.type == "table" {
    block(above: 17 * px, data-table(c.table))
  } else if c.type == "custom" {
    for b in c.blocks {
      if b.type == "p" { for p in b.paragraphs { para(p) } }
      else if b.type == "table" { block(above: 17 * px, data-table(b.table)) }
      else { block(above: 12 * px, below: 12 * px, bullet-list(b.items, if b.type == "ul" { "bullet" } else { "number" })) }
    }
  }
}

#let render-section(s, first) = {
  block(width: 100%, above: if first { 0pt } else { 45 * px * t.densityFactor }, [
    #section-heading(s) #label("section-" + s.id)
    #section-body(s.content)
  ])
}

#let acknowledgement() = {
  let a = m.acknowledgement
  pagebreak(weak: true)
  block(width: 100%, inset: (top: 27pt), [
    #block(below: 7pt, css(family: head-font, size: 18pt, line-height: 1.14, weight: "semibold", fill: primary, a.title)) #label("section-acknowledgement")
    #block(below: 14.1pt, css(line-height: lh * 1.22, par(justify: justified, a.statement)))
    #grid(columns: (1fr, 1fr), row-gutter: 3.7pt, ..a.fields.map(f => block(inset: (x: 7pt, y: 6pt), {
      css(size: 7pt, weight: "extrabold", fill: muted, tracking: 1.75pt, upper(f.label))
      v(5pt)
      let mark = if f.label == "Signature" and a.signature != none { image(a.signature, height: 44 * px, fit: "contain") }
        else if f.value != none { css(line-height: 1, f.value) } else { [] }
      block(width: 100%, height: if f.label == "Signature" and a.signature != none { 44 * px } else { 11pt }, stroke: (bottom: (paint: muted, thickness: 0.75pt)), align(left + bottom, mark))
    })))
  ])
}

// ---------------------------------------------------------------- document

#if m.cover.kind == "composition" { composition-cover() } else { standard-cover() }
#pagebreak()
#if m.toc != none {
  contents()
  pagebreak()
}
#if m.sectionFeature != none {
  block(width: 100%, height: 250 * px, clip: true, stroke: (y: (paint: line-color, thickness: px)), image(m.sectionFeature.image, width: 100%, height: 250 * px, fit: "cover"))
}
#for (i, s) in m.sections.enumerate() { render-section(s, i == 0) }
#if m.acknowledgement != none { acknowledgement() }
