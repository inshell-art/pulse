// Server-only pre-load IP-country suppression. Not legal or RUM-colo qualification.
const countries = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));
export const DENIED_COUNTRIES = Object.freeze('AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH GB'.split(' '));
const denied = new Set(DENIED_COUNTRIES);
export function projectsRegionBit(request, documentEnvironment) {
  try {
    const url = new URL(request.url);
    if (documentEnvironment !== 'production' || url.origin !== 'https://pulse.inshell.art' ||
        url.username || url.password || url.pathname !== '/projects/' || /[?#]/.test(url.href) ||
        !['GET', 'HEAD'].includes(request.method)) return 'off';
    // Ignore caller headers/query parameters. Read no other request.cf property.
    const country = request.cf?.country;
    return typeof country === 'string' && countries.has(country) && !denied.has(country) ? 'eligible' : 'off';
  } catch { return 'off'; }
}
export function markMeasurementHtml(html, bit) {
  // Controlled first-party templates only. Missing/duplicate authored markers fail closed.
  const marker = `<meta name="pulse-measurement-region" content="${bit === 'eligible' ? 'eligible' : 'off'}">`;
  if (/pulse-measurement-region/i.test(html)) return html.replace(/<meta\b[^>]*\bname\s*=\s*(?:"pulse-measurement-region"|'pulse-measurement-region'|pulse-measurement-region(?=\s|\/?>))[^>]*>/gi, '');
  return html.replace('</head>', `${marker}\n</head>`);
}
