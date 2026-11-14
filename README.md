<div align="center">

# PlantSpace · umidade-esp32

**Sensor de umidade do solo com ESP32, API em Node.js e dashboard em tempo real.**

[![Demo](https://img.shields.io/badge/demo-online-6D28D9?style=for-the-badge&logo=render&logoColor=white)](https://umidade-esp32.onrender.com)
![ESP32](https://img.shields.io/badge/ESP32-E7352C?style=for-the-badge&logo=espressif&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)

</div>

## Sobre

O ESP32 lê um sensor resistivo de umidade do solo, envia a leitura por Wi-Fi e um dashboard mostra o histórico e o estado da planta: **OK**, **Atenção** ou **Precisa molhar**.

O projeto tem duas camadas:

- **Demonstração pública** — o protótipo do ESP32 envia para `/api/readings` e qualquer visitante vê a leitura atual e o gráfico.
- **MVP autenticado (PlantSpace)** — login com Supabase, cada conta cadastra suas plantas e sensores e enxerga apenas os próprios dados, com **Row Level Security** no Postgres.

## Funcionalidades

- Leitura do sensor em tempo real e classificação por faixa de umidade
- Gráfico de histórico com estado de conexão (`online`/`offline`)
- Cadastro de plantas com espécie, local e limite de umidade editável
- Sensores vinculados por usuário, com chave de dispositivo própria
- Alertas no dashboard quando a umidade está baixa
- Retenção opcional de leituras antigas via função agendada no Postgres
- Simulador de leituras para testar sem hardware

## Arquitetura

```
ESP32 (sensor resistivo)
   │  POST /api/readings  (x-api-key)
   ▼
Node.js + Express ──► JSON local (demo) / Supabase Postgres (MVP)
   │
   ├─ GET /api/status        → dashboard público
   └─ /api/sensors, /api/device/readings, /api/reservations
                                 (autenticado / chave de dispositivo)
```

## Hardware

| Sensor | ESP32 | Observação |
|---|---|---|
| VCC | **3V3** | em 3,3 V o AOUT nunca passa de 3,3 V (seguro para o ADC) |
| GND | GND | |
| AOUT | **GPIO 34** | ADC1 — continua funcionando com o Wi-Fi ligado |

> Se alimentar o módulo em **5 V**, o AOUT pode chegar a ~4,5 V e precisa de um divisor 10k/20k antes do GPIO 34. **Nunca ligue 5 V direto no ADC.**

## Firmware

O sketch está em `firmware/umidade_wifi/umidade_wifi.ino` (Arduino IDE ou `arduino-cli`, placa **ESP32 Dev Module**).

Crie o `secrets.h` a partir do modelo:

```cpp
#define WIFI_SSID "nome-da-rede"
#define WIFI_SENHA "senha-da-rede"
#define SERVIDOR_URL "https://SEU-APP.onrender.com/api/readings"
#define API_KEY "troque-esta-chave"
#define DISPOSITIVO "PlantSpace"
```

Compilar e gravar:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/umidade_wifi
arduino-cli upload -p COM6 --fqbn esp32:esp32:esp32 firmware/umidade_wifi
```

> ESP32 e servidor precisam estar acessíveis entre si: use a URL pública do Render ou rode o servidor na mesma rede e aponte para o IP local do PC.

## Rodar localmente

```bash
cd server
npm install
npm start
```

Abra <http://localhost:3000>. Para gerar leituras falsas, em outro terminal:

```bash
npm run simulate
```

## Variáveis de ambiente

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3000` | porta HTTP (o Render define automaticamente) |
| `API_KEY` | `troque-esta-chave` | chave exigida no header `x-api-key` |
| `UMIDADE_MIN` | `35` | abaixo disso = **Atenção** |
| `UMIDADE_CRITICA` | `20` | abaixo disso = **Precisa molhar** |
| `CAL_SECO` | `2500` | ADC com o sensor seco |
| `CAL_UMIDO` | `1250` | ADC com o sensor na água |
| `OFFLINE_MS` | `3600000` | tempo sem leitura para considerar offline |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | — | login e dados do MVP |
| `SUPABASE_SERVICE_ROLE_KEY` | — | apenas no servidor; nunca no cliente |

## Deploy no Render

O `render.yaml` já define `rootDir: server`, `npm install` e `npm start`.

1. **New → Blueprint** apontando para o repositório.
2. Defina `API_KEY` (a mesma do `secrets.h`) e as variáveis do Supabase.
3. Copie a URL gerada e atualize `SERVIDOR_URL` no firmware.

No plano free o serviço **dorme** após ~15 min sem acesso — a primeira visita demora ~30 s. O disco é temporário: o histórico da demo pode sumir a cada deploy.

## Calibração

```
% = (adc - CAL_SECO) / (CAL_UMIDO - CAL_SECO) * 100
```

1. Com o sensor **no ar**, anote o ADC → `CAL_SECO` (0%).
2. Com o sensor em **solo encharcado**, anote o ADC → `CAL_UMIDO` (100%).
3. Ajuste as variáveis de ambiente — não precisa regravar o ESP32.

> **Dedo não é referência:** encostar nos dois garfos fecha o circuito e dá ~100% sem água nenhuma. Calibre com solo de verdade.

## API

| Método | Rota | Autenticação |
|---|---|---|
| `POST` | `/api/readings` | `x-api-key` (ESP32 da demo) |
| `GET` | `/api/status?limit=120` | pública |
| `POST` | `/api/sensors` | sessão Supabase |
| `POST` | `/api/device/readings` | `x-device-key` |
| `POST` | `/api/reservations` | pública (lista de interesse) |
| `GET` | `/config.js` | pública (URL e anon key do Supabase) |
| `GET` | `/api/health` | pública |

```http
POST /api/readings
x-api-key: SUA_CHAVE
Content-Type: application/json

{ "adc": 2412, "device": "PlantSpace", "rssi": -58 }
```

```json
{
  "latest": { "ts": 1760000000000, "adc": 2412, "percent": 33, "device": "PlantSpace", "rssi": -58 },
  "online": true,
  "status": { "level": "warning", "label": "Atencao", "advice": "O solo esta secando. Regue em breve." },
  "thresholds": { "min": 35, "critical": 20 },
  "calibration": { "seco": 2500, "umido": 1250 },
  "history": [{ "ts": 1760000000000, "percent": 33 }]
}
```

## Estrutura

```
umidade-esp32/
├─ firmware/umidade_wifi/    sketch do ESP32 + secrets.example.h
├─ server/
│  ├─ server.js              API + servidor do site
│  ├─ simulate.js            gera leituras falsas
│  ├─ public/                dashboard, landing, login e CSS
│  └─ supabase/              schema, migrations e retenção
├─ sites/faceclass-scan/     experimento de scanner facial (site estático)
└─ render.yaml               deploy no Render
```

## Limitações conhecidas

- A demo usa `setInsecure()` no TLS — para produção, valide o certificado raiz.
- Envio de alertas por e-mail/WhatsApp está previsto no schema, mas **não habilitado**.
- O dashboard autenticado exige as chaves e as migrations do Supabase configuradas.

## Roadmap

- [ ] Notificações por e-mail quando a umidade ficar crítica
- [ ] Histórico de irrigações por planta
- [ ] App mobile para acompanhar as plantas
- [ ] Suporte a múltiplos sensores por ESP32

---

<sub>Desenvolvido por **Carlos Eduardo Duhring** · [github.com/CarlosDuhring](https://github.com/CarlosDuhring)</sub>
