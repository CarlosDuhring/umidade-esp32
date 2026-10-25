# ESP32 + Sensor de Umidade do Solo + Site

Projeto completo: o ESP32 lê o sensor, manda pela WiFi e um site mostra a umidade e diz
se precisa molhar. Pronto para rodar local e para publicar no **Render**.

## Estrutura

```
umidade-esp32/
├─ firmware/umidade_wifi/
│  ├─ umidade_wifi.ino      código do ESP32
│  ├─ secrets.h             WiFi, URL do servidor, API key (não vai pro Git)
│  └─ secrets.example.h     modelo
├─ server/
│  ├─ server.js             API + servidor do site
│  ├─ simulate.js           gera leituras falsas para testar
│  ├─ public/               o site (HTML, CSS, JS, gráfico)
│  └─ data/readings.json    histórico (criado sozinho)
└─ render.yaml              deploy no Render
```

## 1. Ligação do sensor

| Sensor | ESP32 | Observação |
|---|---|---|
| VCC | **3V3** | em 3,3 V o AOUT nunca passa de 3,3 V (seguro) |
| GND | GND | |
| AOUT | **GPIO 34** | ADC1 — funciona junto com o WiFi |

> Se um dia alimentar o módulo em **5 V**, o AOUT pode chegar a ~4,5 V e precisa de
> divisor 10k/20k antes do GPIO 34. **Nunca ligue 5 V direto no ADC.**

## 2. Firmware (já gravado neste PC)

**Site publicado:** <https://umidade-esp32.onrender.com>

O firmware já foi compilado e enviado para o ESP32 em **COM6** (ESP32-D0WD-V3), já
apontando para a URL do Render.

Para regravar depois de mudar algo:

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 "C:\Users\SENAI\Documents\umidade-esp32\firmware\umidade_wifi"
arduino-cli upload -p COM6 --fqbn esp32:esp32:esp32 "C:\Users\SENAI\Documents\umidade-esp32\firmware\umidade_wifi"
```

Na Arduino IDE: placa **ESP32 Dev Module**, porta **COM6**.

### Trocar rede / servidor
Edite `firmware/umidade_wifi/secrets.h`:

```cpp
#define WIFI_SSID "nome-da-rede"
#define WIFI_SENHA "senha-da-rede"
#define SERVIDOR_URL "http://192.168.1.17:3000/api/readings"  // ou https://SEU-APP.onrender.com/api/readings
#define API_KEY "troque-esta-chave"
#define DISPOSITIVO "estufa-senai"
```

> **Rede igual:** o ESP32 e o PC precisam estar na **mesma WiFi** para a URL local
> funcionar. Hoje o PC e o ESP32 estão em redes diferentes, então ele conecta mas não
> acha o servidor. Opções: colocar os dois na mesma WiFi, ou usar a URL do Render.

## 3. Rodar o site no PC

```powershell
cd C:\Users\SENAI\Documents\umidade-esp32\server
npm install
npm start
```

Abra <http://localhost:3000>. O site atualiza a cada 5 s.

Sem o ESP32 por perto, gere leituras falsas em outro terminal:

```powershell
cd C:\Users\SENAI\Documents\umidade-esp32\server
npm run simulate
```

### Variáveis de ambiente

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | 3000 | porta (o Render define sozinho) |
| `API_KEY` | `troque-esta-chave` | chave que o ESP32 manda no header `x-api-key` |
| `UMIDADE_MIN` | 35 | abaixo disso = **Atenção** |
| `UMIDADE_CRITICA` | 20 | abaixo disso = **Precisa molhar** |
| `CAL_SECO` | 2500 | ADC com o sensor seco |
| `CAL_UMIDO` | 1250 | ADC com o sensor na água |
| `OFFLINE_MS` | 180000 | tempo sem leitura para aparecer "Sem sinal" |

Exemplo no PowerShell:

```powershell
$env:API_KEY="minha-chave"; $env:PORT="3000"; npm start
```

## 4. Publicar no Render

**Já publicado:** <https://umidade-esp32.onrender.com> (serviço `umidade-esp32`, plano free).
O `render.yaml` do repositório define `rootDir: server`, `npm install` e `npm start`.

Para publicar do zero ou republicar:
2. No Render: **New → Blueprint** (ou **Web Service**) apontando para o repositório.
   O `render.yaml` já define `rootDir: server`, `npm install` e `npm start`.
3. Em **Environment**, defina `API_KEY` com a mesma chave do `secrets.h`.
4. Copie a URL gerada, ex.: `https://umidade-esp32.onrender.com`.
5. No `secrets.h`, troque `SERVIDOR_URL` por
   `https://umidade-esp32.onrender.com/api/readings` e regrave o ESP32.

Observações do plano free:
- O serviço **dorme** após ~15 min sem acesso; a primeira visita demora ~30 s.
- O disco é temporário: o histórico some a cada deploy/restart (o gráfico recomeça).
- HTTPS: o firmware usa `setInsecure()` (não valida certificado). Para produção de
  verdade, troque pelo certificado raiz do Render.

## 5. Calibração

O servidor converte o ADC em %:

```
% = (adc - CAL_SECO) / (CAL_UMIDO - CAL_SECO) * 100
```

Para calibrar:
1. Abra o Monitor Serial (115200) ou veja o campo **ADC bruto** no site.
2. Com o sensor **no ar**, anote o valor → `CAL_SECO` (ar = 0%).
3. Com o sensor em **solo encharcado**, anote → `CAL_UMIDO` (100%).
4. Ajuste as variáveis no Render (ou no `$env:` local). Não precisa regravar o ESP32.

> **Dedo não é referência!** Encostar nos dois garfos fecha o circuito e dá ~100% mesmo
> sem água. O sensor mede condutividade entre as hastes — use solo de verdade para calibrar.
> Valores atuais deste projeto: ar ≈ 2480 → 0%, dedo/água ≈ 1200-1300 → 100%.

## 6. API

```http
POST /api/readings
x-api-key: SUA_CHAVE
Content-Type: application/json

{ "adc": 2412, "device": "estufa-senai", "rssi": -58 }
```

```http
GET /api/status?limit=120
```

```json
{
  "latest": { "ts": 1760000000000, "adc": 2412, "percent": 33, "device": "estufa-senai", "rssi": -58 },
  "online": true,
  "status": { "level": "warning", "label": "Atencao", "advice": "O solo esta secando. Regue em breve." },
  "thresholds": { "min": 35, "critical": 20 },
  "calibration": { "seco": 3000, "umido": 1200 },
  "history": [{ "ts": 1760000000000, "percent": 33 }]
}
```

`GET /api/health` responde `{ ok: true }` (bom para monitorar no Render).

## 7. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Site em "Sem sinal" | ESP32 sem WiFi, ou PCs em redes diferentes |
| `Falha no POST: connection refused` | URL/porta errada ou servidor parado |
| `POST 401` | `API_KEY` diferente entre firmware e servidor |
| ADC sempre 0 ou 4095 | sensor sem VCC/GND, ou 5 V no AOUT sem divisor |
| Leitura invertida | troque `CAL_SECO` e `CAL_UMIDO` de lugar |
| Valores oscilando | aumente as amostras em `lerAdcMedia()` |
