// SOP manual template. Reads the render model from /model.json and lays it
// out according to the design spec in model.design. Every visual here has a
// Word equivalent in lib/docx/sop-generate.ts: tables, cell shading, rules
// and header/footer tables. Keep the two in step.
//
// Text metrics match Word "exact" line spacing: each line box is exactly 1em
// (top-edge 0.8em, bottom-edge -0.2em) and the gap between baselines is
// size x leading. Word draws unkerned text (the fonts only kern through GPOS),
// breaks ragged text greedily and squeezes justified spaces, so kerning is off,
// ragged text breaks "simple" and justified text "optimized" with room to shrink.

#let m = json("/model.json")
#let d = m.design
#let L = m.labels
#let editorial = d.id in ("shop-floor", "chapter-book")
// A handbook has no ESG pillars, so the pillar-band cover becomes the control sheet.
#let cover-style = if m.kind == "handbook" and d.cover == "pillar-bands" { "control-sheet" } else { d.cover }
#let pal = d.palette
#let col(hex) = rgb(hex)
#let primary = col(pal.primary)
#let primary-dark = col(pal.primaryDark)
#let soft = col(pal.soft)
#let ink = col(pal.ink)
#let muted = col(pal.muted)
#let line-color = col(pal.line)
#let accent = col(pal.accent)
#let on-primary = col(pal.onPrimary)
#let head-font = d.fonts.heading
#let body-font = d.fonts.body
#let sz = d.sizes
#let body-size = sz.body * 1pt
// Word stores exact line heights in twips (1/20 pt) and font sizes in half
// points, so pitches and derived sizes are rounded the same way here.
#let pitch(size) = calc.round(size / 1pt * d.leading * 20) / 20 * 1pt
#let half(x) = calc.round(x * 2) / 2 * 1pt
#let after = d.paragraphSpacing * 1pt
#let cell-inset = (x: 5pt, y: 3.5pt)
#let rule = 0.6pt

#set document(title: m.title, author: m.company.name)
#set text(font: body-font, size: body-size, fill: ink, lang: "en", hyphenate: false,
  top-edge: 0.8em, bottom-edge: -0.2em)
#set par(justify: true, linebreaks: auto, justification-limits: (spacing: (min: 75%, max: 150%), tracking: (min: 0em, max: 0em)), leading: pitch(body-size) - body-size,
  spacing: pitch(body-size) - body-size + after, first-line-indent: 0pt)
#set list(indent: 4pt, body-indent: 6pt, spacing: pitch(body-size) - body-size + after * 0.5)
#set enum(indent: 4pt, body-indent: 6pt, spacing: pitch(body-size) - body-size + after * 0.5)
#set table(inset: cell-inset)
#set table.cell(breakable: if editorial { false } else { auto })
#set block(spacing: after)

// Headings exist only for PDF bookmarks and page lookups; the visible titles
// are drawn by the components below so both renderers share one look.
#show heading: it => none
#let anchor(level, title, label-name) = [#heading(level: level, outlined: true, bookmarked: true, title)#label(label-name)]

#let txt(size: body-size, weight: "regular", fill: ink, font: body-font, tracking: 0pt, body) = text(
  size: size, weight: weight, fill: fill, font: font, tracking: tracking, body)
#let tight(size, body) = {
  set par(leading: pitch(size) - size, spacing: pitch(size) - size + after * 0.5)
  body
}
#let caps(body, size: sz.small * 1pt, fill: muted, weight: "bold") = txt(size: size, weight: weight, fill: fill, tracking: 0.6pt, upper(body))

// ---------------------------------------------------------------- tables

#let header-cell(body) = {
  if d.table.header == "primary-fill" { table.cell(fill: primary, txt(weight: "bold", fill: on-primary, size: sz.small * 1pt + 0.5pt, body)) }
  else if d.table.header == "soft-fill" { table.cell(fill: soft, txt(weight: "bold", fill: primary-dark, size: sz.small * 1pt + 0.5pt, body)) }
  else { table.cell(txt(weight: "bold", fill: ink, size: sz.small * 1pt + 0.5pt, body)) }
}

#let table-stroke(rows) = {
  if d.table.borders == "grid" { (x, y) => (paint: line-color, thickness: rule) }
  else {
    (x, y) => (
      top: if y == 0 { none } else if d.id == "shop-floor" and y == 1 { (paint: ink, thickness: 1.5pt) } else { (paint: line-color, thickness: rule) },
      bottom: if y == 0 { (paint: if d.table.header == "rule-only" { ink } else { line-color }, thickness: if d.id == "shop-floor" { 1.5pt } else if d.table.header == "rule-only" { 1pt } else { rule }) } else if y == rows { (paint: line-color, thickness: rule) } else { none },
      left: none, right: none,
    )
  }
}

#let table-cell-content(c) = tight(body-size, {
  set par(justify: false)
  if type(c) == array {
    set list(indent: 0pt, body-indent: 5pt, spacing: pitch(body-size) - body-size + 2pt)
    list(..c)
  } else { par(c) }
})

#let data-table(columns, widths, rows) = {
  let fr-widths = widths.map(w => w * 1fr)
  let fill = if d.table.zebra { (x, y) => if y > 0 and calc.even(y) { soft.lighten(45%) } else { none } } else { none }
  table(
    columns: fr-widths,
    stroke: table-stroke(rows.len()),
    fill: fill,
    table.header(..columns.map(c => header-cell(c))),
    ..rows.map(row => row.map(c => table-cell-content(c))).flatten(),
  )
}

// ---------------------------------------------------------------- blocks

#let render-blocks(blocks) = {
  for b in blocks {
    if b.type == "p" { par(b.text) }
    else if b.type == "ul" { list(..b.items.map(i => par(justify: false, i))) }
    else if b.type == "ol" { enum(..b.items.map(i => par(justify: false, i))) }
    else if b.type == "table" { data-table(b.columns, b.widths, b.rows) }
  }
}

#let callout(body) = {
  if d.callout == "hazard-rule" {
    show regex("^[^.!?]+[.!?]?"): strong
    table(columns: (1fr,), stroke: (left: (paint: accent, thickness: 2.5pt), rest: none), inset: (left: 9pt, rest: 4pt), body)
  } else if d.callout == "mint-panel" {
    table(columns: (1fr,), stroke: (left: (paint: accent, thickness: 3pt), rest: none), fill: soft, inset: (x: 9pt, y: 7pt), body)
  } else if d.callout == "soft-panel" {
    table(columns: (1fr,), stroke: none, fill: soft, inset: (x: 9pt, y: 7pt), body)
  } else {
    table(columns: (1fr,), stroke: (left: (paint: accent, thickness: 2.5pt), rest: none), inset: (left: 9pt, rest: 4pt), body)
  }
}

// ---------------------------------------------------------------- running furniture

#let current-sop() = {
  let here-page = here().page()
  let on-page = query(<sop-meta>).filter(x => x.location().page() == here-page)
  let before = query(selector(<sop-meta>).before(here()))
  let found = if on-page.len() > 0 { on-page.first().value } else if before.len() > 0 { before.last().value } else { none }
  // Closing pages emit an empty marker so the header stops naming the last SOP.
  if found != none and found.code == "" { none } else { found }
}

#let page-of() = [Page #counter(page).display() of #context counter(page).final().first()]

// The classification stands in for the old fixed "Controlled copy" label.
#let copy-label = if m.kind == "handbook" { "" } else if m.control.classification.trim() != "" { m.control.classification } else { "Controlled copy" }

// Optional control fields, left out when empty so older manuals keep their layout.
#let optional-control(pairs) = pairs.filter(((k, v)) => v.trim() != "")

#let logo-or-name(height: 9mm) = {
  if m.company.logo != none { image(m.company.logo, height: height) }
  else { txt(weight: "bold", fill: primary, font: head-font, size: sz.h3 * 1pt, m.company.name) }
}

#let running-header() = context {
  let sop = current-sop()
  let sop-title = if sop != none { sop.code + "  " + sop.title } else { m.cover.eyebrow }
  let sop-color = if sop != none { col(sop.color) } else { primary }
  set par(justify: false)
  if d.runningHeader in ("plain-line", "book-rule") {
    let color = if d.runningHeader == "book-rule" { primary } else { muted }
    grid(columns: (1fr, auto), txt(size: sz.small * 1pt, fill: color, if sop != none { sop.title } else { m.title }),
      txt(size: sz.small * 1pt, fill: color, if m.kind == "handbook" { "Version " + m.control.revision } else { m.control.docNo + ", revision " + m.control.revision }))
    v(2pt)
    line(length: 100%, stroke: (paint: if d.runningHeader == "book-rule" { primary } else { line-color }, thickness: rule))
  } else if m.kind == "handbook" and d.runningHeader == "control-table" {
    grid(columns: (1fr, auto), txt(weight: "bold", fill: primary, m.title), txt(size: sz.small * 1pt, "Version " + m.control.revision + "  |  Effective " + m.control.effectiveDate))
  } else if d.runningHeader == "control-table" {
    // Issue and last review dates share a row under the four fixed cells, and Supersedes
    // (free text) gets a full-width row; a lone cell spans both columns.
    let dates = optional-control((("Issue date", m.control.issueDate), ("Last review", m.control.lastReviewDate)))
    let supersedes = optional-control((("Supersedes", m.control.supersedes),))
    let extra-rows = (dates, supersedes).filter(r => r.len() > 0)
    let rows = 2 + extra-rows.len()
    tight(sz.small * 1pt, table(
      columns: (24%, 1fr, 20%, 20%),
      stroke: (paint: line-color, thickness: rule),
      inset: (x: 5pt, y: 3pt),
      align: horizon,
      table.cell(rowspan: rows, align: center + horizon,
        if m.company.logo != none { image(m.company.logo, height: 8mm) }
        else { txt(weight: "bold", fill: primary, font: head-font, size: sz.small * 1pt + 1pt, m.company.name) }),
      table.cell(rowspan: rows, [#txt(size: sz.small * 1pt, weight: "bold", fill: primary, m.title) \ #txt(size: sz.small * 1pt, fill: muted, sop-title)]),
      txt(size: sz.small * 1pt, [Doc No: #m.control.docNo]),
      txt(size: sz.small * 1pt, [Rev: #m.control.revision]),
      txt(size: sz.small * 1pt, [Effective: #m.control.effectiveDate]),
      txt(size: sz.small * 1pt, page-of()),
      ..extra-rows.map(r => r.map(((k, v)) => table.cell(colspan: 3 - r.len(), txt(size: sz.small * 1pt, k + ": " + v)))).flatten(),
    ))
  } else if d.runningHeader == "pillar-rule" {
    grid(columns: (1fr, auto),
      caps(m.title), caps(if sop != none { sop.pillarLabel } else { m.company.name }, fill: sop-color))
    v(2pt)
    line(length: 100%, stroke: (paint: sop-color, thickness: 1.5pt))
  } else if d.runningHeader == "code-strip" {
    tight(sz.small * 1pt, table(columns: (auto, 1fr, auto), stroke: none, fill: soft, inset: (x: 6pt, y: 4pt),
      txt(size: sz.small * 1pt, weight: "bold", fill: primary, if sop != none { sop.code } else { m.control.docNo }),
      txt(size: sz.small * 1pt, fill: ink, if sop != none { sop.title } else { m.title }),
      txt(size: sz.small * 1pt, fill: muted, m.company.name)))
  } else if d.runningHeader == "register-line" {
    grid(columns: (1fr, auto),
      txt(size: sz.small * 1pt, fill: muted, m.company.name + "  |  " + m.title),
      txt(size: sz.small * 1pt, fill: muted, if m.kind == "handbook" { "Version " + m.control.revision } else { m.control.docNo + "  Rev " + m.control.revision }))
    v(2pt)
    line(length: 100%, stroke: (paint: line-color, thickness: rule))
  } else {
    grid(columns: (1fr, auto), align: (left + horizon, right + horizon),
      logo-or-name(height: 7mm), caps(m.title, fill: primary))
    v(3pt)
    line(length: 100%, stroke: (paint: primary, thickness: 2pt))
  }
}

#let running-footer() = context {
  set par(justify: false)
  if d.runningFooter == "company-folio" {
    grid(columns: (1fr, auto), txt(size: sz.small * 1pt, fill: muted, m.company.name),
      txt(size: sz.small * 1pt, fill: muted, [#if d.id == "shop-floor" { [Page ] }#counter(page).display()]))
  } else if m.kind == "handbook" and d.runningFooter in ("prepared-approved", "register-folio") {
    grid(columns: (1fr, auto), txt(size: sz.small * 1pt, fill: muted, "Version " + m.control.revision + "  |  Effective " + m.control.effectiveDate), txt(size: sz.small * 1pt, page-of()))
  } else if d.runningFooter == "prepared-approved" {
    line(length: 100%, stroke: (paint: line-color, thickness: rule))
    v(3pt)
    grid(columns: (1fr, 1fr, auto), column-gutter: 8pt,
      txt(size: sz.small * 1pt, fill: muted, [Prepared by: #m.control.preparedBy]),
      txt(size: sz.small * 1pt, fill: muted, [Approved by: #m.control.approvedBy]),
      txt(size: sz.small * 1pt, fill: muted, [#copy-label | #page-of()]))
  } else if d.runningFooter == "outer-folio" {
    grid(columns: (1fr, auto),
      txt(size: sz.small * 1pt, fill: muted, m.company.name + "  |  " + m.title),
      txt(size: sz.small * 1pt + 1pt, weight: "bold", fill: primary, counter(page).display()))
  } else if d.runningFooter == "centered-folio" {
    align(center, txt(size: sz.small * 1pt, fill: muted, page-of()))
  } else {
    line(length: 100%, stroke: (paint: line-color, thickness: rule))
    v(2pt)
    grid(columns: (1fr, auto),
      txt(size: sz.small * 1pt, fill: muted, m.control.docNo + "  |  Rev " + m.control.revision + "  |  Effective " + m.control.effectiveDate),
      txt(size: sz.small * 1pt, fill: muted, [#counter(page).display() / #counter(page).final().first()]))
  }
}

#set page(
  paper: if m.page.size == "Letter" { "us-letter" } else { "a4" },
  margin: (top: d.page.marginTopMm * 1mm, bottom: d.page.marginBottomMm * 1mm, x: d.page.marginXMm * 1mm),
  header-ascent: d.page.headerGapMm * 1mm,
  footer-descent: 5mm,
  header: context { if m.mode != "full" or counter(page).get().first() > 1 { running-header() } },
  footer: context { if m.mode != "full" or counter(page).get().first() > 1 { running-footer() } },
)

// ---------------------------------------------------------------- titles

// Front-matter and closing section titles.
// Sticky so a title never sits alone at the foot of a page (Word: keepNext on every part).
// The block takes the spacing its first part had on its own (a table: block spacing; a
// text title: paragraph spacing), so nothing moves.
#let part-title(title, label-name) = block(breakable: false, sticky: true, above: if d.sopOpener in ("pillar-banner", "title-banner", "register-head") { after } else { pitch(body-size) - body-size + after }, {
  anchor(1, title, label-name)
  if editorial {
    txt(font: head-font, size: sz.h1 * 1pt, weight: "bold", fill: primary, title)
  } else if d.sopOpener == "pillar-banner" or d.sopOpener == "title-banner" {
    table(columns: (1fr,), stroke: none, fill: if d.sopOpener == "title-banner" { primary-dark } else { primary }, inset: (x: 10pt, y: 8pt),
      txt(font: head-font, size: half(sz.h1 * 0.85), weight: "bold", fill: on-primary, title))
  } else if d.sopOpener == "register-head" {
    table(columns: (5mm, 1fr), stroke: none, inset: (x: 6pt, y: 5pt),
      table.cell(fill: primary, []), txt(font: head-font, size: half(sz.h1 * 0.85), weight: "bold", fill: primary, title))
  } else {
    txt(font: head-font, size: sz.h1 * 1pt, weight: "bold", fill: primary, title)
    v(-2pt)
    line(length: 100%, stroke: (paint: if d.sopOpener == "ruled-title" { accent } else { primary }, thickness: 1pt))
  }
  v(after * 0.5)
})

#let section-number-label(s) = if s.number != "" { s.number + "  " + s.title } else { s.title }

// Visible heading of a section inside an SOP.
#let section-title(s, color) = {
  if d.sectionHeading in ("hanging-number", "serif-heading") {
    block(above: after * 2, below: after, breakable: false, sticky: true, {
      if d.sectionHeading == "hanging-number" and m.kind != "handbook" {
        grid(columns: (12mm, 1fr), txt(weight: "bold", s.number), txt(font: head-font, size: sz.h2 * 1pt, weight: "bold", s.title))
      } else {
        txt(font: head-font, size: sz.h2 * 1pt, weight: "bold", fill: primary, [#if m.kind != "handbook" and s.number != "" { txt(font: head-font, size: sz.h2 * 1pt, fill: muted, s.number + "  ") }#s.title])
      }
    })
  } else if d.sectionHeading == "numbered-rule" {
    block(above: after * 2, below: after, breakable: false, sticky: true, {
      txt(font: head-font, size: sz.h2 * 1pt, weight: "bold", fill: primary, section-number-label(s))
      v(-3pt)
      line(length: 100%, stroke: (paint: line-color, thickness: rule))
    })
  } else if d.sectionHeading == "pillar-bar" {
    block(above: after * 2, below: after, breakable: false, sticky: true,
      table(columns: (1fr,), stroke: (left: (paint: color, thickness: 3pt), rest: none), inset: (left: 7pt, y: 2pt),
        caps(section-number-label(s), size: sz.h2 * 1pt, fill: color)))
  } else if d.sectionHeading == "number-chip" {
    block(above: after * 2, below: after, breakable: false, sticky: true,
      table(columns: (8mm, 1fr), stroke: none, inset: (x: 5pt, y: 3pt), align: (center + horizon, left + horizon),
        table.cell(fill: primary, txt(weight: "bold", fill: on-primary, size: sz.small * 1pt + 1pt, s.number.replace(".0", ""))),
        txt(font: head-font, weight: "bold", fill: primary-dark, size: sz.h2 * 1pt, s.title)))
  } else if d.sectionHeading == "label-chip" {
    block(above: after * 2, below: after, breakable: false, sticky: true,
      table(columns: (auto,), stroke: none, fill: soft, inset: (x: 7pt, y: 3pt),
        caps(section-number-label(s), size: sz.small * 1pt + 0.5pt, fill: primary)))
  }
}

// ---------------------------------------------------------------- SOP parts

#let meta-pair(label, value) = [#caps(label, size: sz.small * 1pt - 0.5pt) \ #txt(size: sz.small * 1pt + 1pt, weight: "bold", value)]

#let meta-card(sop) = tight(sz.small * 1pt, table(
  columns: (1fr, 1fr, 1fr, 1fr), stroke: (paint: line-color, thickness: rule), fill: soft.lighten(40%), inset: (x: 6pt, y: 4pt),
  meta-pair(L.item + " No.", sop.code), meta-pair("Version", sop.version), meta-pair(L.department, sop.department), meta-pair("Owner", sop.owner),
  meta-pair("Effective", sop.effectiveDate), meta-pair("Next review", sop.nextReviewDate), meta-pair("Prepared by", sop.preparedBy), meta-pair("Approved by", sop.approvedBy),
))

#let sop-opener(sop) = {
  let color = col(sop.color)
  if d.sopOpener in ("plain-title", "chapter-numeral") {
    if d.sopOpener == "chapter-numeral" {
      txt(size: sz.h3 * 1pt, fill: primary, sop.department)
      v(3pt)
      txt(font: head-font, size: 68pt, weight: "bold", fill: primary, sop.number)
      v(5pt)
    }
    txt(font: head-font, size: sz.h1 * 1pt, weight: "bold", fill: if d.sopOpener == "chapter-numeral" { ink } else { primary }, sop.title)
    if d.sopOpener == "plain-title" and m.kind != "handbook" {
      v(4pt)
      txt(size: sz.small * 1pt, fill: muted, [Code #sop.code #h(6mm) Department #sop.department #h(6mm) Owner #sop.owner])
    }
    if d.sopOpener == "chapter-numeral" { v(12pt) }
  } else if d.sopOpener == "ruled-title" {
    // Codes such as "SOP-EHS-001" or "Chapter 3" already say what they are.
    caps((if upper(sop.code).starts-with(upper(L.item)) { sop.code } else { L.item + " " + sop.code }) + "   |   " + sop.department, fill: accent)
    v(2pt)
    txt(font: head-font, size: sz.h1 * 1pt, weight: "bold", fill: primary, sop.title)
    v(-2pt)
    line(length: 100%, stroke: (paint: primary, thickness: 1.2pt))
    txt(size: sz.small * 1pt, fill: muted, "Version " + sop.version + "   |   Effective " + sop.effectiveDate + (if m.kind == "handbook" { "" } else { "   |   Owner: " + sop.owner }))
  } else if d.sopOpener == "pillar-banner" {
    table(columns: (1fr,), stroke: none, fill: color, inset: (x: 10pt, y: 8pt),
      grid(columns: (1fr, auto), align: (left + bottom, right + top),
        [#txt(size: sz.small * 1pt, weight: "bold", fill: on-primary, tracking: 0.6pt, sop.code) \ #txt(font: head-font, size: sz.h1 * 1pt, weight: "bold", fill: on-primary, sop.title)],
        caps(sop.pillarLabel, fill: on-primary)))
    v(-after + 0pt)
    tight(sz.small * 1pt, table(columns: (1fr, 1fr, 1fr, 1fr), stroke: none, fill: soft, inset: (x: 10pt, y: 4pt),
      meta-pair(L.department, sop.department), ..(if m.kind == "handbook" { () } else { (meta-pair("Owner", sop.owner),) }), meta-pair("Version", sop.version), meta-pair("Effective", sop.effectiveDate)))
  } else if d.sopOpener == "header-card" {
    table(columns: (1fr,), stroke: none, fill: primary, inset: (x: 10pt, y: 9pt),
      [#txt(size: sz.small * 1pt, weight: "bold", fill: col(pal.accent), tracking: 0.6pt, L.item + " " + sop.number) \ #txt(font: head-font, size: sz.h1 * 1pt, weight: "bold", fill: on-primary, sop.title)])
    v(-after)
    meta-card(sop)
  } else if d.sopOpener == "register-head" {
    table(columns: (32mm, 1fr), stroke: (bottom: (paint: ink, thickness: 1pt), rest: none), inset: (x: 6pt, y: 6pt), align: (center + horizon, left + horizon),
      table.cell(fill: primary, txt(weight: "bold", fill: on-primary, size: sz.small * 1pt, sop.code)),
      [#txt(font: head-font, size: sz.h1 * 1pt, weight: "bold", fill: ink, sop.title) \ #txt(size: sz.small * 1pt, fill: muted, sop.department + (if m.kind == "handbook" { "" } else { "  |  Owner: " + sop.owner }) + "  |  Version " + sop.version + "  |  Effective " + sop.effectiveDate)])
  } else {
    table(columns: (1fr,), stroke: none, fill: primary-dark, inset: (x: 12pt, y: 12pt),
      [#txt(size: sz.small * 1pt + 0.5pt, weight: "bold", fill: accent, tracking: 0.8pt, upper(sop.code + "  |  " + sop.department)) \ #v(2pt) #txt(font: head-font, size: sz.h1 * 1pt, weight: "bold", fill: on-primary, sop.title)])
  }
  if not editorial and d.showSopHeaderCard and d.sopOpener != "header-card" and d.sopOpener != "pillar-banner" {
    v(after * 0.5)
    meta-card(sop)
  }
  v(after)
}

#let steps-blocks(steps) = {
  for (index, st) in steps.enumerate() {
    let number = if editorial { str(index + 1) } else { st.number }
    block(above: after * 1.2, below: after * 0.6, breakable: false, sticky: true, {
      if d.procedure == "yellow-steps" {
        table(columns: (6mm, 2mm, 1fr), stroke: none, inset: 0pt,
          box(width: 6mm, height: 6mm, fill: accent, align(center + horizon, txt(weight: "bold", fill: ink, number))), [], txt(weight: "bold", st.heading))
      } else {
        txt(weight: "bold", fill: primary-dark, number + "  " + st.heading)
        if st.responsible != "" { linebreak(); txt(size: sz.small * 1pt, fill: muted, "Responsible: " + st.responsible) }
      }
    })
    render-blocks(st.body)
    if d.procedure == "yellow-steps" and st.responsible != "" { par(txt(size: sz.small * 1pt, fill: muted, "Responsible: " + st.responsible)) }
    if st.substeps.len() > 0 {
      for (sub-index, sub) in st.substeps.enumerate() {
        pad(left: 14pt, par(justify: false, [#txt(weight: "bold", if editorial { str(index + 1) + "." + str(sub-index + 1) } else { sub.number }) #h(4pt) #sub.text #if sub.responsible != "" { txt(size: sz.small * 1pt, fill: muted, "  (" + sub.responsible + ")") }]))
      }
    }
  }
}

#let steps-table(steps) = {
  table(
    columns: (13mm, 1fr, 34mm),
    stroke: table-stroke(steps.len()),
    fill: if d.table.zebra { (x, y) => if y > 0 and calc.even(y) { soft.lighten(45%) } else { none } } else { none },
    table.header(header-cell("Step"), header-cell("Action"), header-cell("Responsible")),
    ..steps.map(st => (
      txt(weight: "bold", fill: primary, st.number),
      {
        set par(justify: false)
        txt(weight: "bold", st.heading)
        for b in st.body { if b.type == "p" { par(b.text) } else { render-blocks((b,)) } }
        for sub in st.substeps { par(justify: false, [#txt(weight: "bold", sub.number) #h(3pt) #sub.text]) }
      },
      tight(body-size, par(justify: false, st.responsible)),
    )).flatten(),
  )
}

#let section-body(s) = {
  if s.at("steps", default: none) != none {
    if d.procedure == "step-table" { steps-table(s.steps) } else { steps-blocks(s.steps) }
  }
  render-blocks(s.blocks)
}

#let render-section(s, color) = {
  if d.sectionHeading == "side-label" {
    // A rule, the label floating in the left column and the body padded beside
    // it. Not a table row: a row would repeat its rule and inset on every page it
    // breaks across, and Word only repeats header rows of top-level tables.
    block(above: after * 1.6, below: after, {
      block(spacing: 0pt, sticky: true, line(length: 100%, stroke: (paint: line-color, thickness: rule)))
      v(5pt)
      block(spacing: 0pt, {
        place(top + left, box(width: 30mm - 8pt, tight(sz.small * 1pt, par(justify: false, caps(section-number-label(s), size: sz.small * 1pt + 0.5pt, fill: primary)))))
        pad(left: 30mm, section-body(s))
      })
      v(2pt)
    })
  } else {
    section-title(s, color)
    if d.sectionHeading == "hanging-number" and m.kind != "handbook" { pad(left: 12mm, section-body(s)) } else { section-body(s) }
  }
}

#let render-sop(sop, new-page: true) = {
  if new-page { pagebreak(weak: true) }
  [#metadata((code: sop.code, title: sop.title, color: sop.color, pillarLabel: sop.pillarLabel)) <sop-meta>]
  anchor(2, sop.code + " " + sop.title, sop.anchor)
  sop-opener(sop)
  for s in sop.sections { render-section(s, col(sop.color)) }
}

// ---------------------------------------------------------------- chapters

#let chapter-opener(ch) = {
  if ch.label == "" { return }
  let color = col(ch.color)
  if d.chapterDivider == "pillar-page" {
    pagebreak(weak: true)
    anchor(1, ch.label, ch.anchor)
    table(columns: (1fr,), stroke: none, fill: color, inset: (x: 16pt, y: 18pt),
      [#v(26mm) #caps(L.group, fill: on-primary) \ #txt(font: head-font, size: half(sz.coverTitle * 0.9), weight: "bold", fill: on-primary, ch.label) \ #v(4pt) #txt(fill: on-primary, ch.summary)])
    v(after * 2)
    for sop in ch.sops {
      grid(columns: (26mm, 1fr, auto), column-gutter: 6pt,
        txt(weight: "bold", fill: color, sop.code), sop.title,
        context txt(fill: muted, str(counter(page).at(label(sop.anchor)).first())))
      v(-2pt)
      line(length: 100%, stroke: (paint: line-color, thickness: rule))
    }
  } else if d.chapterDivider == "label-band" {
    pagebreak(weak: true)
    anchor(1, ch.label, ch.anchor)
    table(columns: (1fr, auto), stroke: none, fill: soft, inset: (x: 8pt, y: 5pt),
      caps(ch.label, fill: color, size: sz.small * 1pt + 1pt), txt(size: sz.small * 1pt, fill: muted, str(ch.sops.len()) + " " + (if ch.sops.len() == 1 { L.itemSingular } else { L.itemPlural })))
    v(after * 0.5)
  } else {
    anchor(1, ch.label, ch.anchor)
  }
}

// ---------------------------------------------------------------- cover

#let control-rows() = if m.kind == "handbook" { (("Version", m.control.revision), ("Effective date", m.control.effectiveDate), ("Approved by", m.control.approvedBy)) } else { (
  ("Document No.", m.control.docNo), ("Revision", m.control.revision),
  ..optional-control((("Supersedes", m.control.supersedes), ("Issue date", m.control.issueDate))),
  ("Effective date", m.control.effectiveDate),
  ..optional-control((("Last review", m.control.lastReviewDate),)),
  ("Next review", m.control.nextReviewDate), ("Prepared by", m.control.preparedBy), ("Reviewed by", m.control.reviewedBy),
  ("Approved by", m.control.approvedBy), ("Classification", m.control.classification),
)

}

// Optional fields can leave the last row short; empty cells keep the grid square.
#let control-grid(columns: 4, photo: false) = {
  let rows = control-rows()
  if photo {
    columns = calc.min(4, rows.len())
  }
  let padded = if photo { rows } else { rows + range(calc.rem(columns - calc.rem(rows.len(), columns), columns)).map(_ => ("", "")) }
  tight(sz.small * 1pt, table(
    columns: range(columns).map(_ => 1fr), stroke: (paint: line-color, thickness: rule), inset: (x: 6pt, y: 5pt),
    ..padded.enumerate().map(((i, pair)) => {
      let (k, v) = pair
      if k == "" { [] } else if photo and i == rows.len() - 1 and calc.rem(rows.len(), columns) != 0 {
        table.cell(colspan: columns - calc.rem(rows.len(), columns) + 1, meta-pair(k, v))
      } else { meta-pair(k, v) }
    }),
  ))
}

#let cover-page() = {
  let w = m.page.widthMm * 1mm
  let h = m.page.heightMm * 1mm
  set page(header: none, footer: none, margin: 0pt)
  let pad-x = d.page.marginXMm * 1mm
  if m.cover.at("photo", default: false) and m.cover.image != none {
    let p = d.photoLayout
    let sx = w / 210
    let sy = h / 297
    let ix = p.image.x * sx
    let iy = p.image.y * sy
    let iw = p.image.width * sx
    let ih = p.image.height * sy
    place(top + left, rect(width: w, height: h, fill: if p.variant == "panel-photo" { soft } else { white }))
    place(top + left, dx: ix, dy: iy, block(width: iw, height: ih, fill: soft, align(center + horizon, image(m.cover.image, width: iw, height: ih, fit: "cover"))))
    if p.variant == "photo-strip" { place(top + left, rect(width: 14 * sx, height: h, fill: primary)) }
    if m.company.logo != none {
      place(top + left, dx: 24 * sx, dy: 20 * sy, box(fill: white, inset: 6pt, image(m.company.logo, width: 48 * sx, height: 18 * sy, fit: "contain")))
    }
    if p.variant == "pillar-photo" {
      place(top + left, dy: 122 * sy, grid(columns: (w / 3, w / 3, w / 3),
        ..(("E", "Environmental"), ("S", "Social"), ("G", "Governance")).map(((k, label)) =>
          block(width: w / 3, height: 17 * sy, fill: col(pal.pillars.at(k)), inset: 4mm,
            txt(size: 10pt, fill: white, if m.kind == "handbook" { ("People", "Workplace", "Conduct").at(if k == "E" { 0 } else if k == "S" { 1 } else { 2 }) } else { label })))))
    }
    place(top + left, dx: 20 * sx, dy: p.titleY * sy, block(width: 170 * sx, height: p.titleHeight * sy,
      fill: if p.dark { primary-dark } else { white }, inset: (x: 8mm, y: 7mm), {
        txt(size: 12pt, fill: if p.dark { on-primary } else { muted }, if m.kind == "handbook" { "Employee handbook" } else { "Standard operating procedures" })
        v(5pt)
        txt(font: head-font, size: calc.max(34, sz.coverTitle) * 1pt, weight: "bold", fill: if p.dark { on-primary } else { primary }, m.cover.title)
        v(5pt)
        let subtitle = m.cover.at("photoSubtitle", default: m.cover.subtitle)
        if subtitle != m.cover.title { txt(size: 13pt, fill: if p.dark { on-primary } else { muted }, subtitle) }
      }))
    place(bottom + left, dx: 20 * sx, dy: -16 * sy, block(width: 170 * sx, fill: white, control-grid(photo: true)))
  } else if m.cover.image != none or cover-style == "image-banner" {
    // Image (or a solid primary plate) over the top 58%, title banner below.
    if m.cover.image != none { place(top + left, image(m.cover.image, width: w, height: h * 0.58, fit: "cover")) }
    else { place(top + left, rect(width: w, height: h * 0.58, fill: primary)) }
    place(top + left, dx: pad-x, dy: 14mm, box(fill: white, inset: 6pt, logo-or-name(height: 11mm)))
    place(top + left, dy: h * 0.58, block(width: w, fill: primary-dark, inset: (x: pad-x, y: 14mm), {
      caps(m.cover.eyebrow, fill: accent, size: sz.small * 1pt + 1pt)
      v(4pt)
      txt(font: head-font, size: sz.coverTitle * 1pt, weight: "bold", fill: on-primary, m.cover.title)
      v(2pt)
      txt(size: sz.h2 * 1pt, fill: on-primary, m.cover.subtitle)
    }))
    place(bottom + left, dx: pad-x, dy: -14mm, block(width: w - 2 * pad-x, control-grid()))
  } else if cover-style in ("hazard-band", "book-cover") {
    let x = if cover-style == "hazard-band" { 38mm } else { pad-x }
    if cover-style == "hazard-band" { place(top + left, rect(width: 18mm, height: h, fill: accent, stroke: none)) }
    if m.company.logo != none { place(top + left, dx: x, dy: 20mm, image(m.company.logo, height: 11mm)) }
    let subtitle = m.cover.subtitle.split(regex("\\s*\\|\\s*")).filter(segment => segment != m.company.name and segment != "").join(", ")
    place(top + left, dx: x, dy: 78mm, block(width: w - x - pad-x, {
      set par(justify: false, leading: 2pt)
      par(txt(font: head-font, size: sz.coverTitle * 1pt, weight: "bold", fill: primary, m.cover.title))
      if subtitle != "" { par(txt(size: sz.h2 * 1pt, fill: muted, subtitle)) }
      v(10mm)
      if cover-style == "book-cover" { line(length: 24mm, stroke: (paint: accent, thickness: 3pt)); v(6mm) }
      par(txt(font: head-font, size: 16pt, m.company.name))
      if cover-style == "book-cover" {
        v(4mm)
        txt(size: sz.small * 1pt, fill: muted, (if m.kind == "handbook" { "Version " } else { "Document number " + m.control.docNo + ". Revision " }) + m.control.revision + ". Effective " + m.control.effectiveDate + ". Approved by " + m.control.approvedBy + ".")
      }
    }))
    if cover-style == "hazard-band" {
      place(bottom + left, dx: x, dy: -20mm, block(width: w - x - pad-x, {
        line(length: 100%, stroke: (paint: ink, thickness: 1.5pt))
        v(5mm)
        let pairs = if m.kind == "handbook" { (("Version", m.control.revision), ("Effective date", m.control.effectiveDate), ("Approved by", m.control.approvedBy)) } else { (("Document number", m.control.docNo), ("Revision", m.control.revision), ("Effective date", m.control.effectiveDate), ("Next review", m.control.nextReviewDate), ("Prepared by", m.control.preparedBy), ("Approved by", m.control.approvedBy)) }
        grid(columns: ((w - x - pad-x - 8mm) / 2, (w - x - pad-x - 8mm) / 2), row-gutter: 5mm, column-gutter: 8mm, ..pairs.map(((k, value)) => [#txt(size: sz.small * 1pt, fill: muted, k) \ #txt(value)]))
      }))
    }
  } else if cover-style == "control-sheet" {
    pad(x: pad-x, top: 20mm, bottom: 18mm, {
      grid(columns: (1fr, 46mm), align: (left + horizon, right + horizon),
        logo-or-name(height: 16mm),
        tight(sz.small * 1pt, table(columns: (1fr,), stroke: (paint: primary, thickness: 1pt), inset: (x: 8pt, y: 5pt), align: center,
          [#caps(copy-label, fill: primary) \ #txt(size: sz.small * 1pt, fill: muted, (if m.kind == "handbook" { "Version " } else { "Rev " }) + m.control.revision)])))
      v(46mm)
      caps(m.cover.eyebrow, fill: accent, size: sz.small * 1pt + 1.5pt)
      v(4pt)
      txt(font: head-font, size: sz.coverTitle * 1pt, weight: "bold", fill: primary, m.cover.title)
      v(4pt)
      txt(size: sz.h2 * 1pt + 1pt, fill: muted, m.cover.subtitle)
      v(6pt)
      line(length: 32mm, stroke: (paint: accent, thickness: 3pt))
      v(14mm)
      // At a glance: three figures in a shaded band.
      table(columns: (1fr, 1fr, 1fr), stroke: none, fill: soft, inset: (x: 10pt, y: 9pt),
        ..((str(m.stats.sopCount), L.stats.at(0)), (str(m.stats.departmentCount), L.stats.at(1)), (str(m.stats.siteCount), L.stats.at(2))).map(((n, label)) =>
          [#txt(font: head-font, size: half(sz.coverTitle * 0.8), weight: "bold", fill: primary, n) \ #txt(size: sz.small * 1pt + 0.5pt, fill: muted, label)]))
      v(1fr)
      control-grid()
    })
  } else if cover-style == "pillar-bands" {
    let band-h = h * 0.36
    let count(k) = m.chapters.filter(ch => ch.sops.len() > 0 and ch.sops.first().pillar == k).map(ch => ch.sops.len()).sum(default: 0)
    place(top + left, dx: pad-x, dy: 16mm, logo-or-name(height: 12mm))
    place(top + left, dy: 44mm, grid(columns: (w / 3, w / 3, w / 3),
      ..(("E", "Environmental"), ("S", "Social"), ("G", "Governance")).map(((k, label)) =>
        block(width: w / 3, height: band-h, fill: col(pal.pillars.at(k)), inset: (x: 8mm, y: 10mm), {
          txt(font: head-font, size: half(sz.coverTitle * 1.1), weight: "bold", fill: on-primary, str(count(k)))
          v(1fr)
          caps(label, fill: on-primary, size: sz.small * 1pt + 2pt)
          linebreak()
          txt(size: sz.small * 1pt + 0.5pt, fill: on-primary, if count(k) == 1 { "procedure" } else { "procedures" })
        }))))
    place(top + left, dy: 44mm + band-h, pad(x: pad-x, top: 16mm, {
      caps(m.cover.eyebrow, fill: primary, size: sz.small * 1pt + 1.5pt)
      v(4pt)
      txt(font: head-font, size: sz.coverTitle * 1pt, weight: "bold", fill: ink, m.cover.title)
      v(4pt)
      txt(size: sz.h2 * 1pt + 1pt, fill: muted, m.cover.subtitle)
    }))
    place(bottom + left, dx: pad-x, dy: -16mm, block(width: w - 2 * pad-x, control-grid()))
  } else if cover-style == "card-grid" {
    place(top + left, block(width: w, height: h * 0.42, fill: primary, inset: (x: pad-x, top: 20mm, bottom: 14mm), {
      box(fill: white, inset: 6pt, logo-or-name(height: 11mm))
      v(1fr)
      caps(m.cover.eyebrow, fill: accent, size: sz.small * 1pt + 1.5pt)
      v(4pt)
      txt(font: head-font, size: sz.coverTitle * 1pt, weight: "bold", fill: on-primary, m.cover.title)
    }))
    place(top + left, dy: h * 0.42, pad(x: pad-x, top: 12mm, {
      txt(size: sz.h2 * 1pt + 1pt, fill: ink, m.cover.subtitle)
      v(10mm)
      // Three stat cards, then the control details as smaller cards.
      table(columns: (1fr, 1fr, 1fr), stroke: (paint: white, thickness: 4pt), fill: soft, inset: (x: 10pt, y: 10pt),
        ..((str(m.stats.sopCount), L.cardStats.at(0)), (str(m.stats.departmentCount), L.cardStats.at(1)), (str(m.stats.siteCount), L.cardStats.at(2))).map(((n, label)) =>
          [#txt(font: head-font, size: sz.coverTitle * 1pt, weight: "bold", fill: primary, n) \ #txt(size: sz.small * 1pt + 0.5pt, fill: muted, label)]))
      v(4mm)
      control-grid()
    }))
  } else {
    // register-plate
    grid(columns: (14mm, 1fr),
      block(width: 14mm, height: h, fill: primary),
      pad(left: 14mm, right: pad-x, top: 22mm, bottom: 18mm, {
        logo-or-name(height: 12mm)
        v(30mm)
        caps(m.cover.eyebrow, fill: accent, size: sz.small * 1pt + 1pt)
        v(3pt)
        txt(font: head-font, size: sz.coverTitle * 1pt, weight: "bold", fill: ink, m.cover.title)
        v(3pt)
        txt(size: sz.h2 * 1pt, fill: muted, m.cover.subtitle)
        v(10mm)
        let listed = m.chapters.map(ch => ch.sops).flatten()
        tight(sz.small * 1pt, table(columns: (24mm, 1fr), stroke: (bottom: (paint: line-color, thickness: rule), rest: none), inset: (x: 0pt, y: 3.5pt),
          ..listed.slice(0, calc.min(listed.len(), 14)).map(s => (txt(size: sz.small * 1pt, weight: "bold", fill: primary, s.code), txt(size: sz.small * 1pt, s.title))).flatten()))
        if listed.len() > 14 { txt(size: sz.small * 1pt, fill: muted, "and " + str(listed.len() - 14) + " more") }
        v(1fr)
        control-grid()
      }))
  }
}

// ---------------------------------------------------------------- contents

#let page-ref(anchor-name) = context str(counter(page).at(label(anchor-name)).first())

// One contents line: a fixed lead column (number or SOP code), the title with
// a dot leader (Word: a right tab with dot leader), and the page number.
#let contents-row(left-text, title, anchor-name, color: ink) = {
  if d.contents == "ruled-index" {
    let cells = (par(justify: false, title), txt(fill: muted, page-ref(anchor-name)))
    table(columns: if m.kind == "handbook" { (1fr, 10mm) } else { (30mm, 1fr, 10mm) }, stroke: (bottom: (paint: line-color, thickness: rule), rest: none), inset: (x: 0pt, y: 5pt),
      ..(if m.kind == "handbook" { cells } else { (txt(size: sz.small * 1pt, fill: muted, left-text),) + cells }))
  } else {
  let lead = if d.contents == "dotted-leaders" { 10mm } else { 30mm }
  let leader = if d.contents == "dotted-leaders" or d.contents == "pillar-index" {
    // Word's dot leader: periods back to back, on the baseline.
    box(width: 1fr, baseline: 0.2em, repeat(txt(fill: muted, ".")))
  } else { h(1fr) }
  grid(columns: (lead, 1fr, 10mm), align: (left + bottom, left + bottom, right + bottom),
    txt(weight: "bold", fill: color, left-text),
    par(justify: false, [#title #leader]),
    txt(fill: if d.contents == "dotted-leaders" { ink } else { muted }, page-ref(anchor-name)))
  v(if d.contents == "register-columns" { 1pt } else { 3pt })
  }
}

#let contents-page() = {
  pagebreak(weak: true)
  part-title("Contents", "contents")
  if d.contents == "ruled-index" { data-table(if m.kind == "handbook" { ("Chapter", "Page") } else { ("Code", "Procedure", "Page") }, if m.kind == "handbook" { (10, 1) } else { (3, 10, 1) }, ()) }
  let gap = if d.contents == "register-columns" { 2pt } else { 4pt }
  for s in m.frontMatter { contents-row("", s.title, s.anchor) }
  v(gap * 2)
  for ch in m.chapters {
    if ch.label != "" {
      v(gap)
      if editorial { txt(weight: "bold", fill: primary, ch.label) } else if d.contents == "pillar-index" or d.contents == "banner-index" {
        table(columns: (1fr,), stroke: none, fill: if d.contents == "pillar-index" { col(ch.color) } else { soft }, inset: (x: 7pt, y: 3pt),
          caps(ch.label, fill: if d.contents == "pillar-index" { on-primary } else { primary }))
      } else {
        caps(ch.label, fill: col(ch.color), size: sz.small * 1pt + 1pt)
      }
      v(gap)
    }
    for sop in ch.sops {
      contents-row(if d.contents == "dotted-leaders" { sop.number + "." } else { sop.code }, sop.title, sop.anchor, color: col(ch.color))
    }
  }
  v(gap * 2)
  for s in m.closing.sections { contents-row("", s.title, s.anchor) }
  contents-row("", "Revision history", m.closing.anchors.revisions)
  contents-row("", "Approval", m.closing.anchors.approval)
  for s in m.closing.after { contents-row("", s.title, s.anchor) }
}

// ---------------------------------------------------------------- closing

#let approval-block() = {
  let a = m.closing.approval
  if m.kind == "handbook" {
    let s = a.signatories.first()
    if editorial { par("Approved by: " + m.control.approvedBy) } else { par("Approved by: " + (s.name, s.designation, s.date).filter(v => v != "").join(" | ")) }
  } else {
  if a.statement != "" { callout(par(a.statement)); v(after) }
  if d.approval == "signature-table" {
    data-table(("Role", "Name", "Designation", "Signature", "Date"), (1.1, 1.3, 1.3, 1.2, 0.9),
      a.signatories.map(s => (s.role, s.name, s.designation, "", s.date)))
  } else {
    grid(columns: (1fr,) * calc.max(1, a.signatories.len()), column-gutter: 8pt,
      ..a.signatories.map(s => tight(body-size, table(columns: (1fr,), stroke: none, fill: soft, inset: 9pt,
        [#caps(s.role, fill: primary) \ #v(16mm) #line(length: 100%, stroke: (paint: muted, thickness: rule)) \ #txt(weight: "bold", s.name) \ #txt(size: sz.small * 1pt, fill: muted, s.designation + (if s.date != "" { "  |  " + s.date } else { "" }))]))))
  }
}

}

// ---------------------------------------------------------------- document

#let full = m.mode == "full"
#if full {
  cover-page()
  pagebreak()
  contents-page()
  pagebreak(weak: true)
}
#for s in m.frontMatter {
  part-title(s.title, s.anchor)
  render-blocks(s.blocks)
  v(after)
}

#for ch in m.chapters {
  chapter-opener(ch)
  for (i, sop) in ch.sops.enumerate() {
    // A label band sits on the same page as the chapter's first SOP.
    render-sop(sop, new-page: not (i == 0 and ch.label != "" and d.chapterDivider == "label-band"))
  }
}

#if full {
  pagebreak(weak: true)
  [#metadata((code: "", title: "", color: pal.primary, pillarLabel: "")) <sop-meta>]
  for s in m.closing.sections {
    part-title(s.title, s.anchor)
    render-blocks(s.blocks)
    v(after)
  }
  part-title("Revision history", m.closing.anchors.revisions)
  // Reviewed by / Approved by columns appear only when some revision names someone.
  let extra = (("Reviewed by", "reviewedBy"), ("Approved by", "approvedBy")).filter(((_, key)) => m.closing.revisions.any(r => r.at(key, default: "") != ""))
  data-table(("Revision", "Date", "Description") + extra.map(((label, _)) => label), (if extra.len() > 0 { (0.8, 1.2, 2.6) } else { (0.8, 1, 3.2) }) + extra.map(_ => 1.3),
    m.closing.revisions.map(r => (r.revision, r.date, r.description) + extra.map(((_, key)) => r.at(key, default: ""))))
  v(after * 2)
  part-title("Approval", m.closing.anchors.approval)
  approval-block()
  for s in m.closing.after {
    pagebreak(weak: true)
    part-title(s.title, s.anchor)
    if editorial and s.kind == "acknowledgement" {
      render-blocks((s.blocks.first(),))
      for field in ("Employee name", "Employee number", "Department", "Signature", "Date") {
        v(9mm)
        txt(size: sz.small * 1pt, fill: muted, field)
        v(2mm)
        line(length: 100%, stroke: (paint: primary, thickness: rule))
      }
      v(5mm)
      callout(render-blocks((s.blocks.last(),)))
    } else { render-blocks(s.blocks) }
  }
}

// Read back by compile.ts so lists can show the page count without parsing the PDF.
#context [#metadata(counter(page).final().first()) <sop-page-count>]
// The physical page of every labelled heading, for the Word contents page.
#context [#metadata(query(heading).filter(h => h.has("label")).map(h => (str(h.label), h.location().page()))) <sop-anchor-pages>]
