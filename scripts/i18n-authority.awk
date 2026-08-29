# Strict parser for scripts/i18n-handoff-authority.tsv.
# Records are A<TAB>section<TAB>row. The parser owns the grammar and the
# allowlist so consumers cannot quietly invent a second permissive reader.

BEGIN {
  expected[1] = "locales"
  expected[2] = "direct-locales"
  expected[3] = "handoff-keys"

  n = split("en id de zh-CN zh-TW zh-HK pt-BR es-ES ru fa ar ja ko pl hu fr uk tr th it", rows, " ")
  for (i = 1; i <= n; i++) allowed_locales[rows[i]] = 1
  n = split("ar de es-ES fa fr hu id it ja ko pl pt-BR ru th tr uk zh-CN", rows, " ")
  for (i = 1; i <= n; i++) allowed_direct[rows[i]] = 1
  n = split("handoff.tabHint handoff.eyebrow handoff.subtitle handoff.statusNote handoff.backToSettings handoff.exportAria handoff.exportLabel handoff.copySelected handoff.copyAll handoff.exportSelected handoff.exportAll handoff.tokensTitle handoff.tokensDescription handoff.componentsTitle handoff.componentsDescription handoff.selectionCount handoff.searchAria handoff.searchPlaceholder handoff.bulkAria handoff.selectThisList handoff.selectAllMatches handoff.invertSelection handoff.clearSelection handoff.noMatches handoff.selectRow handoff.swatchAria handoff.privacyNote", rows, " ")
  for (i = 1; i <= n; i++) allowed_keys[rows[i]] = 1
  order = 0
  active = ""
  failed = 0
}

function fail(message) {
  if (!failed)
    print "E\t" message
  failed = 1
  exit 1
}

function allowed(section, row) {
  if (section == "locales") return allowed_locales[row]
  if (section == "direct-locales") return allowed_direct[row]
  if (section == "handoff-keys") return allowed_keys[row]
  return 0
}

{
  line = $0
  if (line == "")
    next
  if (line ~ /^#/) {
    if (line ~ /[[:space:]]$/)
      fail("malformed comment whitespace")
    next
  }
  if (line ~ /^\[[^]]+\]$/) {
    section = substr(line, 2, length(line) - 2)
    if (!(section in section_seen) && section != "locales" && section != "direct-locales" && section != "handoff-keys")
      fail("unknown section " section)
    if (section in section_seen)
      fail("duplicate section " section)
    order++
    if (order > 3 || section != expected[order])
      fail("section out of order: " section)
    section_seen[section] = 1
    active = section
    next
  }
  if (active == "")
    fail("data before the first section: " line)
  if (line ~ /[[:space:]]/)
    fail("malformed row whitespace: " line)
  if (!allowed(active, line))
    fail("unknown row in [" active "]: " line)
  id = active SUBSEP line
  if (row_seen[id]++)
    fail("duplicate row in [" active "]: " line)
  row_count[active]++
  print "A\t" active "\t" line
}

END {
  if (failed)
    exit 1
  if (order != 3)
    fail("missing required section")
  for (i = 1; i <= 3; i++)
    if (row_count[expected[i]] == 0)
      fail("empty required section [" expected[i] "]")
}
