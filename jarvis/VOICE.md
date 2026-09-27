# VOICE — pipeline de voz do Jarvis

A voz é a interface principal. Tudo roda **localmente** por padrão; nada de áudio sai do computador a menos que você escolha a transcrição na nuvem (OpenAI) **e** autorize provedores externos.

```
microfone ─► getUserMedia (cancelamento de eco, supressão de ruído, AGC)
          ─► AudioWorklet pcm-capture (mono, reamostragem anti-alias → 16 kHz, quadros Int16 de 20 ms)
          ─► VAD de energia com piso de ruído adaptativo (renderer)          ── alimenta o núcleo LISTENING
          ─► trecho de fala (pré-roll 320 ms, fim após 750 ms de silêncio, máx. 15 s)
          ─► WebSocket (frame binário) ─► engine
          ─► Silero VAD (faster-whisper, 2º estágio) + faster-whisper (STT local, int8)
          ─► palavra de ativação ("Jarvis") / janela de continuação
          ─► JarvisCore (intenção → plano → ferramentas → resposta)
          ─► TTS por frase (streaming) ─► player com AnalyserNode ─► alto-falante escolhido
                                                   └─ waveform SPEAKING sincronizado com o sinal real
```

## Palavra de ativação

| Motor | Frase | Como funciona | Custo |
|---|---|---|---|
| **whisper** (padrão) | “Jarvis” | cada trecho de fala detectado pelo VAD é transcrito localmente; o texto precisa começar com (ou conter) *Jarvis* e variações comuns de pronúncia (jarbas, djarvis, jervis…). Permite comandos em uma frase: “Jarvis, abra o Spotify”. | STT só roda quando há fala |
| **openWakeWord** | “Hey Jarvis” | detector contínuo com o modelo aberto pré-treinado `hey_jarvis` (~5 MB, baixado dos releases do openWakeWord quando você ativa). O renderer envia lotes de 80 ms enquanto está ocioso. | muito baixo; STT só roda após a detecção |

**Privacidade:** fala que não contém a palavra de ativação (fora da janela de continuação) é descartada — não aparece na interface, não é salva no histórico e não vai para o registro de atividade (`voice.ignored` informa só o motivo).

**Continuação:** depois de uma resposta, durante `follow_up_seconds` (padrão 8 s) você fala sem repetir “Jarvis”. O núcleo mostra LISTENING nesse período. Confirmações (“sim”/“não”) também dispensam a palavra de ativação enquanto há um pedido de permissão aberto.

**Sem palavra de ativação:** desligando-a, o microfone só captura depois de um gesto explícito (clique no núcleo, botão do microfone ou atalho global `Ctrl+Shift+Espaço`).

## Reconhecimento (STT)

- **faster-whisper** local: modelos `tiny` (75 MB), `base` (145 MB, padrão), `small` (485 MB), `medium`, `large-v3`, `large-v3-turbo`. O download acontece **somente** quando você clica em “Baixar modelo” (onboarding ou Configurações › Voz). Com GPU NVIDIA, `device="auto"` usa CUDA automaticamente.
- Decodificação com `beam_size=1`, `vad_filter=True`, `hotwords="Jarvis"` e `initial_prompt` para favorecer a grafia correta da palavra de ativação.
- **OpenAI Whisper** (opcional, nuvem): requer `OPENAI_API_KEY` no `.env.local` e consentimento em Privacidade. O indicador “Enviando a OpenAI” aparece na barra superior.

## Voz do Jarvis (TTS)

- **Voz do sistema (padrão, sem download):** `speechSynthesis` do Chromium, que no Windows usa as vozes SAPI instaladas. Os eventos de fronteira de palavra animam o waveform.
- **Piper (neural, local):** vozes abertas do projeto Piper — recomendadas `pt_BR-faber-medium`, `pt_BR-cadu-medium`, `en_GB-alan-medium`, `en_US-ryan-high`. Baixadas sob demanda do repositório oficial. O áudio é sintetizado **frase a frase** enquanto o modelo de IA ainda está gerando o texto, reduzindo a latência até a primeira fala.
- Nenhuma fala ou som dos filmes é usado. Os sons de interface (ativação, confirmação, erro, conclusão) são sintetizados em tempo real com Web Audio (`app/src/audio/sounds.ts`) e podem ser desligados.

## Interrupção (barge-in)

Enquanto o Jarvis fala, o limiar do VAD é multiplicado por 2,4 (é preciso falar mais alto que o eco residual). Ao detectar sua voz, a reprodução para imediatamente, o engine cancela as frases ainda não sintetizadas (`voice.interrupt`) e o que você disse é tratado como comando. “Pare”, “cancelar” e “esquece” cancelam também tarefas em andamento e pedidos de permissão. `Esc` e clique no núcleo também interrompem.

## Dispositivos e calibração

- Microfone e alto-falante selecionáveis (Configurações › Voz ou onboarding). A saída usa `AudioContext.setSinkId` (vozes Piper); a voz do sistema usa o dispositivo padrão do Windows.
- **Calibrar ruído ambiente:** mede 3 s de silêncio, grava `noise_floor` (percentil 80) e define `vad_threshold = 3 × piso`.
- Medidor de nível em tempo real com o limiar desenhado.

## Estados do núcleo

| Estado | Origem | Visual |
|---|---|---|
| IDLE | nada acontecendo | rotação lenta, respiração, ~30 fps |
| LISTENING | VAD detectou fala, comando armado ou janela de continuação | partículas deslocadas pelo espectro real do microfone, anel de waveform |
| THINKING | transcrevendo ou o engine está processando | anéis e arcos aceleram, partículas espiralam |
| EXECUTING | ferramenta em execução | feixes do núcleo em direção aos painéis |
| SPEAKING | reprodução de TTS | waveform do sinal real de saída |
| ERROR | falha recente (volta a IDLE em 4 s) | âmbar/vermelho discreto, um único pulso |

## Latência (medida e exibida em Configurações › Voz)

`sttMs` (decodificação), `transcribeTotalMs` (até o comando chegar ao core) e `ttsFirstMs` (primeira frase sintetizada pelo Piper).

## Limitações honestas

- Validado neste repositório com áudio sintetizado (espeak-ng → openWakeWord detecta “hey jarvis” com score maior que uma frase neutra) e com a lógica de wake word/continuação/barge-in em testes. O reconhecimento faster-whisper e as vozes Piper dependem de downloads do HuggingFace, que não estavam acessíveis no ambiente de desenvolvimento; teste-os no seu Windows após baixar os modelos.
- Cancelamento de eco depende do Chromium/placa de som; em alto-falantes muito altos, prefira fones ou desative “Permitir interromper a fala”.
