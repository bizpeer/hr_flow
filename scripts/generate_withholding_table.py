"""Extract the official 2026 monthly withholding table from the law.go.kr PDF.

Usage: python scripts/generate_withholding_table.py path/to/official.pdf
Source: https://www.law.go.kr/LSW/flDownload.do?bylClsCd=110201&flSeq=161861245&gubun=
"""

import json
import sys
from pathlib import Path

import pdfplumber


SOURCE_URL = "https://www.law.go.kr/LSW/flDownload.do?bylClsCd=110201&flSeq=161861245&gubun="
OUTPUT = Path(__file__).resolve().parents[1] / "client/src/data/withholdingTaxTable2026.json"


def parse_number(value):
    if value is None or value.strip() == "-":
        return 0
    return int(value.replace(",", "").strip())


def main(pdf_path):
    brackets = []
    tax_at_10_million = None
    with pdfplumber.open(pdf_path) as document:
        for page in document.pages:
            for table in page.extract_tables():
                for row in table:
                    if len(row) != 13 or not row[0] or not row[1]:
                        if len(row) == 13 and row[0] and row[0].startswith("10,000") and row[1] is None and row[2] and row[2].replace(",", "").isdigit():
                            tax_at_10_million = [parse_number(value) for value in row[2:]]
                        continue
                    try:
                        minimum = parse_number(row[0])
                        maximum = parse_number(row[1])
                        taxes = [parse_number(value) for value in row[2:]]
                    except ValueError:
                        continue
                    if 770 <= minimum < maximum <= 10000:
                        brackets.append({"min": minimum, "max": maximum, "taxes": taxes})

    brackets.sort(key=lambda bracket: bracket["min"])
    assert len(brackets) == 646, f"Expected 646 brackets, found {len(brackets)}"
    assert brackets[0]["min"] == 770 and brackets[-1]["max"] == 10000
    assert all(len(bracket["taxes"]) == 11 for bracket in brackets)
    assert all(left["max"] == right["min"] for left, right in zip(brackets, brackets[1:]))
    assert next(row for row in brackets if row["min"] == 2300)["taxes"][:6] == [29160, 22160, 12550, 9180, 5800, 2430]
    assert tax_at_10_million == [1507400, 1431570, 1200840, 1170840, 1140840, 1110840, 1080840, 1050840, 1020840, 990840, 960840]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({"effectiveFrom": "2026-03-01", "sourceUrl": SOURCE_URL, "taxAt10Million": tax_at_10_million, "brackets": brackets}, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(brackets)} brackets to {OUTPUT}")


if __name__ == "__main__":
    main(sys.argv[1])
