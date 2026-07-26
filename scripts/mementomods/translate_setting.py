#!/usr/bin/env python3
"""
Translate fork-specific simple_form locale strings to all Mastodon-supported
languages via the DeepL Pro API.

Reads the API key from /tmp/deepl. Inserts a new key/value pair after the
specified anchor key in BOTH the `hints.defaults` and `labels.defaults`
sections of every `config/locales/simple_form.<lang>.yml`. Locales that DeepL
cannot translate to are skipped (Mastodon falls back to the English value).

Usage:
    python3 scripts/mementomods/translate_setting.py setting_use_stars \
        --label "Use stars instead of hearts for favourites" \
        --hint "Replace the favourite heart icon with a Twitter-style yellow star, with sparkle and ring animations" \
        [--anchor setting_system_scrollbars_ui]

The anchor key must already exist in both the hints.defaults and labels.defaults
sections of the target file (Mastodon's en.yml is always the source of truth for
which keys exist; non-en files mirror it). Files lacking the anchor are skipped.
"""
import argparse
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
LOCALES_DIR = REPO_ROOT / "config" / "locales"
KEY_FILE = pathlib.Path("/tmp/deepl")

# Mastodon locale code -> DeepL target language code.
# Locales not in this dict are skipped; Mastodon falls back to English.
MAPPING = {
    "af": "AF", "ar": "AR", "be": "BE", "bg": "BG", "bn": "BN", "bs": "BS",
    "ca": "CA", "cs": "CS", "cy": "CY", "da": "DA", "de": "DE", "el": "EL",
    "en-GB": "EN-GB", "eo": "EO", "es": "ES", "es-AR": "ES-419", "es-MX": "ES-419",
    "et": "ET", "eu": "EU", "fa": "FA", "fi": "FI", "fr": "FR", "fr-CA": "FR",
    "ga": "GA", "gl": "GL", "he": "HE", "hi": "HI", "hr": "HR", "hu": "HU",
    "hy": "HY", "id": "ID", "is": "IS", "it": "IT", "ja": "JA", "ka": "KA",
    "kk": "KK", "ko": "KO", "lt": "LT", "lv": "LV", "mk": "MK", "ml": "ML",
    "mr": "MR", "ms": "MS", "my": "MY", "ne": "NE", "nl": "NL", "no": "NB",
    "oc": "OC", "pa": "PA", "pl": "PL", "pt-BR": "PT-BR", "pt-PT": "PT-PT",
    "ro": "RO", "ru": "RU", "sa": "SA", "sk": "SK", "sl": "SL", "sq": "SQ",
    "sr": "SR", "sv": "SV", "ta": "TA", "te": "TE", "th": "TH", "tr": "TR",
    "tt": "TT", "uk": "UK", "ur": "UR", "uz": "UZ", "vi": "VI",
    "zh-CN": "ZH-HANS", "zh-HK": "ZH-HANT", "zh-TW": "ZH-HANT",
}


def read_api_key():
    text = KEY_FILE.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.startswith("DEEPL_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"DEEPL_API_KEY not found in {KEY_FILE}")


def deepl_translate(text, target_lang, api_key):
    data = urllib.parse.urlencode(
        {
            "text": text,
            "target_lang": target_lang,
            "source_lang": "EN",
            "preserve_formatting": "1",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.deepl.com/v2/translate",
        data=data,
        headers={"Authorization": f"DeepL-Auth-Key {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)["translations"][0]["text"]


def yaml_quote(text):
    """Quote a YAML scalar if needed."""
    needs_quote = (
        ":" in text
        or "#" in text
        or text != text.strip()
        or text.startswith(("'", '"', "[", "{", "&", "*", "!", "|", ">", "%", "@", "`", "-", "?"))
        or text.lower() in ("yes", "no", "true", "false", "null", "~", "on", "off")
    )
    if not needs_quote:
        return text
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def insert_after_anchors(file_path, anchor_key, new_key, hint_value, label_value):
    """Insert two lines into the YAML file:
    - hint_value after the FIRST occurrence of anchor_key (under hints.defaults)
    - label_value after the SECOND occurrence of anchor_key (under labels.defaults)

    Skips if new_key is already present anywhere in the file. Returns the number
    of lines inserted.
    """
    text = file_path.read_text(encoding="utf-8")
    lines = text.splitlines()

    new_re = re.compile(rf"^\s*{re.escape(new_key)}:")
    if any(new_re.match(l) for l in lines):
        return 0  # already present

    anchor_re = re.compile(rf"^(\s+){re.escape(anchor_key)}:\s")
    out_lines = []
    inserted = 0
    for line in lines:
        out_lines.append(line)
        m = anchor_re.match(line)
        if m and inserted < 2:
            indent = m.group(1)
            value = hint_value if inserted == 0 else label_value
            out_lines.append(f"{indent}{new_key}: {yaml_quote(value)}")
            inserted += 1

    if inserted == 0:
        return 0  # anchor not found in this file

    file_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    return inserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("setting_key", help="e.g. setting_use_stars")
    parser.add_argument("--label", required=True, help="English label text")
    parser.add_argument("--hint", required=True, help="English hint text")
    parser.add_argument(
        "--anchor",
        default="setting_system_scrollbars_ui",
        help="Existing key after which to insert (default: setting_system_scrollbars_ui)",
    )
    args = parser.parse_args()

    api_key = read_api_key()

    locale_files = sorted(LOCALES_DIR.glob("simple_form.*.yml"))
    print(f"Found {len(locale_files)} simple_form locale files")

    cache = {}
    for lf in locale_files:
        # simple_form.LANG.yml
        lang = lf.stem.split(".", 1)[1]
        if lang == "en":
            print(f"[en] source language, skipping")
            continue

        deepl_target = MAPPING.get(lang)
        if not deepl_target:
            print(f"[{lang}] no DeepL target, skipping (Mastodon falls back to en)")
            continue

        if deepl_target in cache:
            label_t, hint_t = cache[deepl_target]
        else:
            try:
                label_t = deepl_translate(args.label, deepl_target, api_key)
                hint_t = deepl_translate(args.hint, deepl_target, api_key)
            except urllib.error.HTTPError as e:
                print(f"[{lang}] DeepL HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:120]}")
                continue
            except urllib.error.URLError as e:
                print(f"[{lang}] DeepL network error: {e}")
                continue
            cache[deepl_target] = (label_t, hint_t)

        n = insert_after_anchors(lf, args.anchor, args.setting_key, hint_t, label_t)
        if n == 0:
            print(f"[{lang}] anchor '{args.anchor}' not found OR key already present")
        elif n == 1:
            print(f"[{lang}] inserted 1/2 (anchor only found once)")
        else:
            print(f"[{lang}] OK: '{label_t[:40]}...'")


if __name__ == "__main__":
    main()
