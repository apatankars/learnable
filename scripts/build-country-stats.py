"""Build src/data/countryStats.json — structured key facts per country.

The hand-written fun facts live separately in src/data/facts/<region>.json.

Sources (download first, then pass the paths):
  mledoze/countries  https://raw.githubusercontent.com/mledoze/countries/master/countries.json
  World Bank SP.POP.TOTL  https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?date=2024&format=json&per_page=400

Usage: python3 scripts/build-country-stats.py mledoze.json worldbank-pop.json
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
mledoze_path, pop_path = sys.argv[1], sys.argv[2]

countries = json.load(open(ROOT / 'src/data/countries.json'))
mledoze = {c['cca3']: c for c in json.load(open(mledoze_path))}
mledoze['XKX'] = mledoze.get('UNK')  # Kosovo uses a user-assigned code
pop = {r['countryiso3code']: r['value'] for r in json.load(open(pop_path))[1] if r['value']}
# Not covered by the World Bank — Wikipedia estimates.
pop.setdefault('TWN', 23_400_000)
pop.setdefault('VAT', 882)

# Corrections where the source data is stale or misleading (checked against
# the countries' Wikipedia infoboxes, Oct 2026).
CURRENCY_OVERRIDES = {
    'ZWE': 'Zimbabwe Gold (ZiG)',
    'FSM': 'United States dollar',
    'CUB': 'Cuban peso',
    'GMB': 'Gambian dalasi',
    'GEO': 'Georgian lari',
    'MKD': 'Macedonian denar',
}
LANGUAGE_OVERRIDES = {
    'IND': ['Hindi', 'English'],
    'AUT': ['German'],
    'ARG': ['Spanish'],
    'CZE': ['Czech'],
    'MDA': ['Romanian'],
    'CHN': ['Mandarin Chinese'],
    'TWN': ['Mandarin Chinese'],
    'IRN': ['Persian'],
    'TJK': ['Tajik', 'Russian'],
    'TKM': ['Turkmen'],
    'UZB': ['Uzbek'],
    'NOR': ['Norwegian', 'Sami'],
    'CHE': ['German', 'French', 'Italian', 'Romansh'],
    'BLZ': ['English'],
    'IRQ': ['Arabic', 'Kurdish'],
    'ISR': ['Hebrew'],
    'NRU': ['Nauruan', 'English'],
    'MDV': ['Dhivehi'],
    'SGP': ['English', 'Malay', 'Mandarin Chinese', 'Tamil'],
}

# Hand-curated from each country's Wikipedia infobox ("Government" row), simplified.
government = json.load(open(ROOT / 'scripts/government.json'))

out = {}
for c in countries:
    m = mledoze[c['id']]
    currencies = [v['name'] for v in (m.get('currencies') or {}).values()]
    if c['id'] in CURRENCY_OVERRIDES:
        currencies = [CURRENCY_OVERRIDES[c['id']]]
    area = m['area'] if c['id'] != 'VAT' else 0.49
    out[c['id']] = {
        'population': pop[c['id']],
        'government': government[c['id']],
        'area': round(area) if area >= 10 else round(area, 2),
        'languages': LANGUAGE_OVERRIDES.get(c['id']) or list((m.get('languages') or {}).values()),
        'currency': currencies[0] if currencies else None,
        'demonym': (m.get('demonyms') or {}).get('eng', {}).get('m'),
        'landlocked': m['landlocked'],
        'subregion': m.get('subregion') or c['region'],
    }

dest = ROOT / 'src/data/countryStats.json'
dest.write_text(json.dumps(out, ensure_ascii=False, indent=0, separators=(',', ':')) + '\n')
print(f'wrote {len(out)} countries to {dest}')
