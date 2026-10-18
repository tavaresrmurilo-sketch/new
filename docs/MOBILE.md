# App Mixtour para Android e iOS

O Mixtour é um app de celular. Ele roda de três formas, sempre com o mesmo código:

| Forma | Como a pessoa usa | Onde está |
|---|---|---|
| **App nativo Android** | Google Play | `android/` (Capacitor 8) |
| **App nativo iOS** | App Store | `ios/` (Capacitor 8, Swift Package Manager) |
| **Web app instalável (PWA)** | navegador do celular → "Adicionar à tela inicial" | o próprio site |

## Como funciona

O app nativo é um shell (Capacitor) que carrega o Mixtour hospedado (`CAPACITOR_SERVER_URL`) num WebView
de tela cheia e acrescenta recursos do aparelho por plugins:

| Recurso | No app nativo | No site/PWA |
|---|---|---|
| Localização ("Perto de mim", local do evento, cidade do perfil) | GPS do aparelho (`@capacitor/geolocation`) | API de geolocalização do navegador |
| Notificações | Push nativo: FCM (Android) e APNs (iOS) | Web Push (VAPID) |
| Compartilhar evento | Folha de compartilhamento do sistema | Web Share / copiar link |
| Ingressos | Navegador embutido (Custom Tabs / Safari View) | nova aba |
| Toques em salvar/"Vou"/seguir | Vibração de confirmação | — |
| Links `https://<domínio>/evento/...` | Abrem direto no app (App Links / Universal Links) | — |
| Barra de status, splash, ícone | Nativos, na cor da marca | manifest do PWA |
| Sem internet | Tela offline própria (`mobile-shell/offline.html`) | página `/offline` (service worker) |

Por que carregar do servidor em vez de empacotar arquivos estáticos: o Mixtour renderiza no servidor
(SEO das páginas de eventos, Server Actions, sessão segura em cookie HttpOnly). Assim o app recebe as
melhorias no mesmo instante em que o site é publicado, sem nova revisão nas lojas — só mudanças nativas
(plugins, ícones, permissões) exigem nova versão.

Dentro do app, o servidor reconhece o WebView pelo user-agent (`MixtourApp`) e:
- esconde o "Continuar com Google" (o Google bloqueia login dentro de WebViews; e na App Store, oferecer login
  de terceiros exigiria também "Entrar com a Apple") — o login por e-mail funciona normalmente;
- não mostra o convite de instalação do PWA nem registra o service worker.

## Pré-requisitos

- Node 20.9+ e as dependências do projeto (`npm install`)
- **Android:** Android Studio (Ladybug ou mais recente) com SDK 36, JDK 21
- **iOS:** macOS com Xcode 16+, conta no Apple Developer Program

## Desenvolvimento

```bash
npm run dev                                   # servidor em http://localhost:3000
CAPACITOR_SERVER_URL=http://10.0.2.2:3000 npm run mobile:sync   # emulador Android (10.0.2.2 = seu computador)
npm run mobile:android                        # abre no Android Studio → Run
CAPACITOR_SERVER_URL=http://localhost:3000 npm run mobile:sync  # simulador iOS
npm run mobile:ios                            # abre no Xcode → Run
```
Em aparelho físico, use o IP do computador na rede (ex.: `http://192.168.0.10:3000`).

## Versão para as lojas

1. **Identidade do app** (definitivo depois de publicado):
   ```bash
   export CAPACITOR_APP_ID=br.com.suaempresa.mixtour      # ID do pacote (Android) / bundle (iOS)
   export CAPACITOR_SERVER_URL=https://seu-dominio.com.br  # obrigatório https
   npm run mobile:sync
   ```
   Atualize também o `applicationId` em `android/app/build.gradle` e o `PRODUCT_BUNDLE_IDENTIFIER`
   do target App no Xcode para o mesmo ID.
2. **Domínio para links** — `android/gradle.properties`: `mixtourHost=seu-dominio.com.br`; no Xcode,
   Build Settings do target App → `MIXTOUR_HOST = seu-dominio.com.br`.
3. **Versão**: `versionCode`/`versionName` (`android/app/build.gradle`) e `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION` (Xcode).
4. **Ícones e splash**: já gerados a partir da marca. Para refazer: `npm run mobile:assets`.

### Android (Google Play)
1. Android Studio → *Build → Generate Signed App Bundle* → crie a chave de upload (guarde-a com segurança).
2. Envie o `.aab` no Play Console (teste interno → produção). Ative a *Assinatura de apps do Google Play*.
3. **App Links**: no Play Console → *Integridade do app → Assinatura*, copie a impressão digital SHA-256
   e configure no servidor: `ANDROID_APP_ID=<id do pacote>` e `ANDROID_SHA256_CERT_FINGERPRINTS=<SHA-256>`
   (vários separados por vírgula). Confira em `https://seu-dominio/.well-known/assetlinks.json`.
4. Ficha da loja: categoria *Eventos* ou *Estilo de vida*; declare a coleta de localização aproximada/precisa
   (uso: funcionalidade do app, não compartilhada) e e-mail (conta). Política de privacidade: `https://seu-dominio/privacidade`.

### iOS (App Store)
1. No Xcode (target App → *Signing & Capabilities*): escolha seu time e confirme **Push Notifications** e
   **Associated Domains** (o arquivo `App/App.entitlements` já declara ambos).
2. *Product → Archive → Distribute App → App Store Connect*.
3. **Universal Links**: configure no servidor `APPLE_TEAM_ID` e `IOS_BUNDLE_ID`; confira em
   `https://seu-dominio/.well-known/apple-app-site-association`.
4. App Store Connect: privacidade — localização (funcionalidade), e-mail/nome (conta), identificadores de
   aparelho (notificações); não há rastreamento. Para a revisão, informe uma conta de teste.
   O app usa recursos nativos (push, localização, compartilhamento, vibração, links universais), o que atende
   à diretriz 4.2 (funcionalidade mínima).

## Notificações push nativas

O servidor envia direto pelas APIs oficiais, sem SDKs:

**Android — Firebase Cloud Messaging (HTTP v1)**
1. Crie um projeto no Firebase e adicione um app Android com o mesmo ID do pacote.
2. Baixe o `google-services.json` e coloque em `android/app/` (não versionar se o repositório for público).
3. Firebase → Configurações do projeto → Contas de serviço → *Gerar nova chave privada* (JSON) e configure:
   `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (o campo `private_key` do JSON; pode manter os `\n`).

**iOS — APNs**
1. Apple Developer → *Keys* → crie uma chave com **Apple Push Notifications service (APNs)** e baixe o `.p8`.
2. Configure: `APNS_KEY_ID`, `APPLE_TEAM_ID`, `APNS_PRIVATE_KEY` (conteúdo do `.p8`), `IOS_BUNDLE_ID`
   e `APNS_PRODUCTION=true` para builds da App Store/TestFlight (`false` para builds de desenvolvimento do Xcode).

O app pede permissão de notificação uma vez após o login, registra o aparelho em `POST /api/push/device` e
desliga o aparelho ao sair da conta. Tokens inválidos são removidos automaticamente. Lembretes de eventos,
novidades de organizadores seguidos e avisos de moderação usam o mesmo `notify()` do servidor (in-app,
e-mail, Web Push e push nativo, conforme as preferências da pessoa).

## CI

`.github/workflows/mobile.yml` compila o APK Android de depuração (artefato baixável) e o app iOS para
simulador a cada mudança em `android/`, `ios/` ou na configuração do Capacitor. Defina a variável de
repositório `CAPACITOR_SERVER_URL` ou informe a URL ao disparar o workflow manualmente.
