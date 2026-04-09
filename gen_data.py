import json, math

# GDP data (billions USD current prices) per country per year 1990-2023
# Sources: World Bank WDI NY.GDP.MKTP.CD
GDP = {
  "United States": [5980,6174,6539,6879,7309,7664,8100,8608,9089,9661,10285,10622,10978,11511,12275,13094,13856,14478,14719,14419,14964,15518,16155,16692,17393,18121,18745,19543,20612,21428,20894,23315,25744,27360],
  "China":         [361,384,489,613,559,728,856,953,1029,1083,1211,1340,1471,1641,1932,2257,2752,3550,4598,5101,6087,7552,8561,9570,10476,11062,11138,12238,13894,14280,14688,17734,17963,18500],
  "Germany":       [1547,1613,1980,1979,1968,2254,2253,2143,2174,1950,1950,1881,2000,2428,2728,2772,2901,3328,3625,3404,3310,3628,3527,3752,3890,3357,3467,3693,3996,3861,3806,4260,4082,4200],
  "India":         [327,274,293,280,333,366,392,424,428,457,477,494,524,618,722,834,949,1239,1224,1341,1676,1823,1827,1857,2040,2103,2290,2651,2702,2869,2671,3150,3385,3550],
  "Japan":         [3133,3584,4021,4454,4906,5333,4815,4411,3916,4433,4731,4159,3980,4303,4656,4572,4356,4356,4849,5035,5495,6157,6203,5156,4850,4395,4923,4872,4953,5082,5040,4940,4231,4200],
  "Russia":        [517,509,460,435,396,396,391,405,271,196,260,307,345,431,591,764,990,1300,1661,1222,1525,2051,2170,2230,2060,1363,1283,1578,1658,1700,1484,1776,2244,2100],
  "Canada":        [594,622,592,670,733,810,882,905,1027,899,1076,1160,1166,1099,1237,1365,1566,1466,1542,1371,1613,1792,1824,1843,1799,1556,1528,1640,1713,1736,1644,1988,2140,2140],
  "South Korea":   [283,327,355,392,463,559,603,558,345,483,562,533,576,644,722,845,1012,1123,1002,901,1094,1202,1223,1305,1411,1382,1415,1530,1619,1647,1631,1799,1665,1710],
  "United Kingdom":[1091,1075,1126,1052,1132,1340,1388,1497,1630,1528,1662,1664,1760,1912,2241,2367,2561,2779,2833,2412,2408,2706,2707,2781,3064,2886,2658,2638,2855,2830,2711,3131,3081,3090],
  "Brazil":        [469,408,387,430,546,769,840,870,844,588,644,554,506,553,664,882,1089,1397,1696,1668,2209,2614,2461,2467,2344,1800,1795,2055,1915,1874,1444,1609,1920,1920],
  "Saudi Arabia":  [117,131,139,143,160,157,165,165,146,161,188,183,189,215,250,315,376,415,520,429,527,671,735,804,756,646,644,686,779,793,700,834,1109,1100],
}

COUNTRIES = [
  ("United States","USA"),("China","CHN"),("Germany","DEU"),("India","IND"),
  ("Japan","JPN"),("Russia","RUS"),("Canada","CAN"),("South Korea","KOR"),
  ("United Kingdom","GBR"),("Brazil","BRA"),("Saudi Arabia","SAU"),
]

YEARS = list(range(1990, 2024))  # 34 years

# Load existing data
with open("data/co2_data.json") as f:
    data = json.load(f)

# Build lookup by (country, year)
lookup = {(d["country"], d["year"]): d for d in data}

# Rebuild with GDP added
new_data = []
for country, code in COUNTRIES:
    gdp_list = GDP[country]
    for i, year in enumerate(YEARS):
        key = (country, year)
        if key in lookup:
            rec = dict(lookup[key])
            rec["gdp"] = round(gdp_list[i], 1)
            new_data.append(rec)

# Forecast 2024-2030 using linear extrapolation from 2020-2023 slope
FORECAST_YEARS = list(range(2024, 2031))

# Emissions data for slope calc (2020-2023)
EMISS_2023 = {(d["country"], d["year"]): d["emissions"] for d in data}
POP_2023   = {(d["country"], d["year"]): d["population"] for d in data}

def extrapolate(v2020, v2023, step):
    slope = (v2023 - v2020) / 3
    return round(v2023 + slope * step, 1)

for country, code in COUNTRIES:
    gdp_list = GDP[country]
    e2020 = EMISS_2023.get((country, 2020), EMISS_2023.get((country, 2019), 0))
    e2023 = EMISS_2023.get((country, 2023), e2020)
    p2020 = POP_2023.get((country, 2020), POP_2023.get((country, 2019), 0))
    p2023 = POP_2023.get((country, 2023), p2020)
    g2023 = gdp_list[33]  # 2023 GDP
    g2020 = gdp_list[30]  # 2020 GDP

    for step, year in enumerate(FORECAST_YEARS, 1):
        e = max(0, extrapolate(e2020, e2023, step))
        p = max(0, extrapolate(p2020, p2023, step))
        g = max(0, extrapolate(g2020, g2023, step))
        new_data.append({
            "country": country, "code": code, "year": year,
            "emissions": round(e), "population": round(p, 1),
            "gdp": round(g, 1), "forecast": True
        })

with open("data/co2_data.json", "w") as f:
    json.dump(new_data, f, separators=(',', ':'))
    f.write("\n")

print(f"Done. Total records: {len(new_data)}")
