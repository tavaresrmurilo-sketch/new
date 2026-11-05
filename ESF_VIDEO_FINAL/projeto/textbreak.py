"""Quebra de linha profissional para legendas (máx. 2 linhas), usada no vídeo e no SRT.

Regras: só quebra se não couber numa linha; nunca deixa artigo, preposição, conjunção ou determinante no
fim da 1ª linha; prefere quebrar depois de vírgula; prefere linhas equilibradas ou 2ª linha um pouco maior
(formato de "pirâmide"); evita uma palavra solta na 2ª linha.
"""
from __future__ import annotations

FUNC = {
    "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no", "na", "nos",
    "nas", "por", "pelo", "pela", "para", "pra", "com", "e", "ou", "que", "se", "me", "te", "lhe", "nos", "é",
    "ao", "à", "todas", "todos", "toda", "todo", "meu", "minha", "seu", "sua", "muito", "muita", "muitas",
    "muitos", "mais", "já", "tão", "outra", "outras", "outro", "outros", "qualquer", "cada", "eu", "como",
}


def _key(w: str) -> str:
    return w.lower().strip(".,!?;:")


def best_break(words, widths, space, max_w):
    """Retorna a lista de linhas (listas de índices). widths em qualquer unidade (px ou caracteres)."""
    n = len(words)
    total = sum(widths) + space * (n - 1)
    if total <= max_w or n < 2:
        return [list(range(n))]
    best, best_cost = None, float("inf")
    for i in range(1, n):
        w1 = sum(widths[:i]) + space * (i - 1)
        w2 = sum(widths[i:]) + space * (n - i - 1)
        over = max(0.0, max(w1, w2) - max_w)
        cost = max(w1, w2) + over * 10
        last = words[i - 1]
        if _key(last) in FUNC and not last.endswith(","):
            cost += 0.60 * max_w
        if last.endswith((",", ".", "?", "!", ";", ":")):
            cost -= 0.12 * max_w
        if n - i == 1 and len(_key(words[-1])) < 9:
            cost += 0.18 * max_w
        if w1 > w2:
            cost += 0.15 * (w1 - w2)
        if cost < best_cost:
            best, best_cost = i, cost
    return [list(range(best)), list(range(best, n))]
