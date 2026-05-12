def is_match(title: str, description: str, keywords: list, exclude: list) -> bool:
    text = (title + " " + description).lower()
    if keywords and not any(k.lower() in text for k in keywords):
        return False
    if any(e.lower() in text for e in exclude):
        return False
    return True
