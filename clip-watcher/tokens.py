"""Speichert Zugangs-Tokens, die sich erneuern (TikTok, Instagram), in runs/tokens.json.
Startwerte kommen aus config.env; danach gilt die gespeicherte, neuere Version."""
import json, os

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs", "tokens.json")

def get(key):
    try:
        v = json.load(open(PATH)).get(key)
    except (OSError, ValueError):
        v = None
    return v or os.environ.get(key)

def put(**kv):
    try:
        data = json.load(open(PATH))
    except (OSError, ValueError):
        data = {}
    data.update(kv)
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    with open(PATH + ".tmp", "w") as f:
        json.dump(data, f)
    os.chmod(PATH + ".tmp", 0o600)
    os.replace(PATH + ".tmp", PATH)
