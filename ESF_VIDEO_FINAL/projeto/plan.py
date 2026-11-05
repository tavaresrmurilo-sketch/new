"""Roteiro de edição (EDL) das duas versões + legendas.

Tudo em tempo do ARQUIVO ORIGINAL (segundos). As legendas são definidas uma vez, no tempo da fala
original, e cada versão as herda automaticamente pelos cortes — por isso não há como dessincronizar.

Transcrição: consenso de várias passadas do Whisper (português e espanhol) + revisão manual.
A entrevistada fala uma mistura de espanhol e português; a legenda traz a fala em português do Brasil,
fiel ao conteúdo. Marcação: *palavra* = laranja, _palavra_ = rosa/magenta.

Trecho NÃO usado por incerteza de transcrição: final da fala da Manuela (101.3–105.5 s),
"...pra conseguir cada vez mais ajudar vocês a se [?] no Brasil" — a palavra após "se" não pôde ser
confirmada; o corte acontece numa pausa natural depois de "todas as pessoas".
"""

SPEAKERS = {"M": ("Manuela Cruvinel", "Entrevistadora"), "T": ("Thais Marques", "Entrevistada")}

# (início, fim, falante, texto, sublinhado de ponto/bordado no destaque laranja)
CAPTIONS = [
    (0.15, 1.70, "M", "Olá, eu sou a *Manuela*.", False),
    (1.76, 3.14, "M", "Como você se chama?", False),
    (3.61, 4.95, "T", "Me chamo *Thais Marques*.", False),
    (5.50, 7.30, "M", "Thais, quantos anos você tem?", False),
    (7.93, 8.80, "T", "*28*.", False),
    (9.20, 10.86, "M", "Você já trabalhou alguma vez,", False),
    (10.86, 12.87, "M", "no Brasil ou antes?", False),
    (13.40, 14.80, "T", "Estive no *México*.", False),
    (15.00, 17.70, "T", "Trabalhei como *camareira*", False),
    (17.75, 20.40, "T", "num hotel de gringos.", False),
    (21.70, 23.30, "M", "Quantos anos você trabalhou lá?", False),
    (23.90, 25.40, "T", "Um ano e meio.", False),
    (26.81, 28.71, "M", "Na sua chegada ao Brasil,", False),
    (29.24, 32.49, "M", "você já se imaginou *trabalhando*", False),
    (32.76, 36.50, "M", "ou fazendo alguma coisa que trouxesse *renda*,", False),
    (36.55, 38.12, "M", "ou era muito difícil?", False),
    (40.34, 44.26, "T", "Aqui, ainda não pensei em trabalhar,", False),
    (44.92, 45.95, "T", "por causa do _bebê_.", False),
    (46.20, 48.50, "T", "Mas a minha _expectativa_", False),
    (48.50, 50.63, "T", "é ter o meu *próprio negócio*,", True),
    (51.10, 53.25, "T", "seja de *bordado*,", True),
    (53.30, 55.53, "T", "de *manicure*, que eu gosto,", False),
    (55.80, 58.79, "T", "e qualquer outra coisa que aparecer.", False),
    (59.51, 62.79, "M", "E você acha que o Brasil", False),
    (63.13, 67.30, "M", "está sendo _acolhedor_ para você e para a sua família,", False),
    (67.30, 70.89, "M", "ou você acha que tem muitas outras dificuldades?", False),
    (71.10, 71.50, "T", "Não.", False),
    (71.70, 73.62, "T", "Me parece que *Brasília*", False),
    (73.62, 75.05, "T", "é uma cidade _espetacular_,", False),
    (75.45, 76.84, "T", "de muita *oportunidade*,", True),
    (77.28, 80.15, "T", "tanto para nós, os _venezuelanos_,", False),
    (80.20, 81.99, "T", "como para outras pessoas também.", False),
    (82.68, 84.78, "M", "O que você _espera_ do Brasil?", False),
    (85.85, 86.57, "T", "O que eu espero?", False),
    (88.76, 89.83, "T", "*Muitas coisas*.", True),
    (96.73, 99.27, "M", "E a gente espera _contribuir_ cada vez mais", False),
    (99.45, 101.25, "M", "pra você e pra *todas as pessoas*.", False),
    (105.69, 106.76, "M", "Muito _obrigada_!", False),
]

# Texto animado de abertura (gancho). Cada linha: (texto, estilo, [(palavra, tempo_original), ...])
HOOK_A = [
    ("Me parece que", "small", [("Me", 71.72), ("parece", 71.88), ("que", 72.30)]),
    ("Brasília é uma cidade", "big", [("Brasília", 72.42), ("é", 73.26), ("uma", 73.40), ("cidade", 73.64)]),
    ("ESPETACULAR,", "huge_o", [("ESPETACULAR,", 73.98)]),
    ("de muita", "big", [("de", 75.50), ("muita", 75.62)]),
    ("OPORTUNIDADE.", "huge_r", [("OPORTUNIDADE.", 75.84)]),
]
HOOK_B = [
    ("O que você", "big", [("O", 82.70), ("que", 82.82), ("você", 82.96)]),
    ("ESPERA", "huge_o", [("ESPERA", 83.28)]),
    ("do Brasil?", "big", [("do", 83.80), ("Brasil?", 84.10)]),
    ("O que eu espero?", "small", [("O", 85.88), ("que", 86.00), ("eu", 86.12), ("espero?", 86.24)]),
    ("MUITAS COISAS.", "huge_r", [("MUITAS", 88.78), ("COISAS.", 89.24)]),
]

# Segmentos: ("clip", entrada, saída, falante, câmera_inicial, câmera_final, extras) | ("end", duração)
# Câmeras (camera.py): W/W2 conjunto · MT/MT2 Thais · MM/MM2 Manuela. Cortes "virtuais" = mesma fala
# contínua (saída de um = entrada do outro), só muda o enquadramento.
VERSION_A = {
    "name": "ESF_Entrevista_Final",
    "segments": [
        ("clip", 71.58, 76.92, "T", "MT", "MT2", {"hook": "A"}),
        ("clip", 0.00, 3.28, "M", "MM", "MM2", {"lt": ("M", 0.85, 3.22), "sting_before": True}),
        ("clip", 3.46, 5.08, "T", "MT", "MT2", {}),
        ("clip", 5.40, 7.42, "M", "MM2", "MM", {}),
        ("clip", 7.80, 8.88, "T", "MT2", "MT2", {}),
        ("clip", 9.10, 12.95, "M", "W", "W2", {}),
        ("clip", 13.30, 20.50, "T", "MT", "MT2", {"lt": ("T", 0.30, 3.90)}),
        ("clip", 21.62, 23.42, "M", "MM", "MM", {}),
        ("clip", 23.80, 25.50, "T", "MT2", "MT2", {}),
        ("clip", 26.70, 32.55, "M", "W", "W2", {}),
        ("clip", 32.55, 38.25, "M", "MM", "MM2", {}),
        ("clip", 40.22, 46.05, "T", "W2", "W", {}),
        ("clip", 46.05, 51.00, "T", "MT", "MT2", {}),
        ("clip", 51.00, 58.92, "T", "W", "W2", {}),
        ("clip", 59.40, 65.95, "M", "W", "W2", {}),
        ("clip", 65.95, 70.98, "M", "MM", "MM2", {}),
        ("clip", 71.00, 77.10, "T", "MT", "MT2", {}),
        ("clip", 77.10, 82.10, "T", "W2", "W", {}),
        ("clip", 82.56, 84.90, "M", "MM2", "MM2", {}),
        ("clip", 85.74, 90.00, "T", "MT", "MT2", {}),
        ("clip", 96.62, 101.25, "M", "W", "W2", {}),
        ("clip", 105.58, 106.74, "M", "W2", "W2", {}),
        ("end", 7.0),
    ],
}

VERSION_B = {
    "name": "ESF_Reels_Impacto",
    "segments": [
        ("clip", 82.56, 84.90, "M", "MM2", "MM", {"hook": "B"}),
        ("clip", 85.74, 86.62, "T", "MT2", "MT2", {"hook": "B"}),
        ("clip", 88.62, 90.00, "T", "MT2", "MT", {"hook": "B"}),
        ("clip", 9.10, 12.95, "M", "W", "W2", {"lt": ("M", 0.30, 3.30), "sting_before": True}),
        ("clip", 13.30, 20.50, "T", "MT", "MT2", {"lt": ("T", 0.30, 3.90)}),
        ("clip", 40.22, 44.40, "T", "W2", "W", {}),
        ("clip", 44.80, 51.00, "T", "MT", "MT2", {}),
        ("clip", 51.00, 58.92, "T", "W", "W2", {}),
        ("clip", 71.58, 77.10, "T", "MT", "MT2", {}),
        ("clip", 77.10, 82.10, "T", "W2", "W", {}),
        ("clip", 96.62, 101.25, "M", "W", "W2", {}),
        ("end", 6.0),
    ],
}

VERSIONS = {"A": VERSION_A, "B": VERSION_B}
