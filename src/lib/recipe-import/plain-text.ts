import { load } from 'cheerio/slim'

export function plainText(markup: string): string {
  const $ = load(markup)
  $('script, style, template').remove()
  $('br, hr').replaceWith('\n')
  $('p, div, li, ul, ol, section, article, h1, h2, h3, h4, h5, h6, tr, blockquote')
    .before('\n')
    .after('\n')
  $('td, th').after(' ')
  return $.root()
    .text()
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}
