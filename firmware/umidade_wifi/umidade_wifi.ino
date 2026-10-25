/*
  ============================================================
  Umidade do solo -> WiFi -> dashboard
  ============================================================
  Hardware:
    Sensor VCC  -> 3V3       (se usar o modulo em 5 V, use divisor no AOUT)
    Sensor GND  -> GND
    Sensor AOUT -> GPIO 34

  O ESP32 le o ADC e manda a leitura bruta para o servidor,
  que converte em % e decide se precisa molhar.

  Antes de gravar, edite o secrets.h:
    WIFI_SSID, WIFI_SENHA, SERVIDOR_URL, API_KEY, DISPOSITIVO

  Placa na Arduino IDE: "ESP32 Dev Module"
  ============================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"

const int PINO_SENSOR = 34;   // ADC1 - funciona junto com o WiFi
const int LED_STATUS = 2;     // LED azul da placa (GPIO 2)

const unsigned long INTERVALO_ENVIO = 10000;    // 1 leitura a cada 10 s
const unsigned long INTERVALO_RECONEXAO = 15000;

unsigned long ultimoEnvio = 0;

// ------------------------------------------------------------
// Leitura estavel: 31 amostras, descarta as 5 maiores e as 5 menores
// e faz a media das 21 do meio (corta picos e reduz ruido)
// ------------------------------------------------------------
int lerAdcEstavel(uint8_t amostras = 31) {
  int valores[31];
  if (amostras > 31) amostras = 31;
  if (amostras < 11) amostras = 11;

  for (uint8_t i = 0; i < amostras; i++) {
    valores[i] = analogRead(PINO_SENSOR);
    delay(3);
  }

  // ordenacao por insercao (lista pequena)
  for (uint8_t i = 1; i < amostras; i++) {
    int atual = valores[i];
    int j = i - 1;
    while (j >= 0 && valores[j] > atual) {
      valores[j + 1] = valores[j];
      j--;
    }
    valores[j + 1] = atual;
  }

  uint8_t corte = amostras / 6;  // 5 de 31
  long soma = 0;
  uint8_t n = 0;
  for (uint8_t i = corte; i < amostras - corte; i++) {
    soma += valores[i];
    n++;
  }

  return (int)(soma / n);
}

// ------------------------------------------------------------
void piscar(int vezes, int pausaMs = 120) {
  for (int i = 0; i < vezes; i++) {
    digitalWrite(LED_STATUS, HIGH);
    delay(pausaMs);
    digitalWrite(LED_STATUS, LOW);
    delay(pausaMs);
  }
}

// ------------------------------------------------------------
bool conectarWifi(unsigned long timeoutMs = 20000) {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.printf("Conectando em \"%s\" ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < timeoutMs) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK - IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("Nao conectou. Vou tentar de novo no proximo ciclo.");
  return false;
}

// ------------------------------------------------------------
bool enviarLeitura(int adc) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Sem WiFi, leitura nao enviada.");
    return false;
  }

  String url = SERVIDOR_URL;
  String corpo = "{\"adc\":" + String(adc) +
                 ",\"device\":\"" + String(DISPOSITIVO) + "\"" +
                 ",\"rssi\":" + String(WiFi.RSSI()) + "}";

  HTTPClient http;
  WiFiClient clienteSimples;
  WiFiClientSecure clienteSeguro;

  http.setConnectTimeout(30000);
  http.setTimeout(30000);

  bool iniciou;
  if (url.startsWith("https://")) {
    clienteSeguro.setInsecure();  // sem validar certificado (simples e suficiente aqui)
    iniciou = http.begin(clienteSeguro, url);
  } else {
    iniciou = http.begin(clienteSimples, url);
  }

  if (!iniciou) {
    Serial.println("Nao consegui iniciar a conexao HTTP.");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  int codigo = http.POST(corpo);

  if (codigo > 0) {
    Serial.printf("POST %d | resposta: %s\n", codigo, http.getString().c_str());
  } else {
    Serial.printf("Falha no POST: %s\n", http.errorToString(codigo).c_str());
  }

  http.end();
  return codigo == 200;
}

// ------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(400);

  pinMode(LED_STATUS, OUTPUT);
  digitalWrite(LED_STATUS, LOW);

  analogReadResolution(12);                        // 0..4095
  analogSetPinAttenuation(PINO_SENSOR, ADC_11db);  // le ate ~3,3 V

  Serial.println();
  Serial.println("=== Monitor de umidade do solo ===");
  Serial.printf("Servidor: %s\n", SERVIDOR_URL);

  conectarWifi();
  enviarLeitura(lerAdcEstavel());
  ultimoEnvio = millis();
}

// ------------------------------------------------------------
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - ultimoEnvio >= INTERVALO_RECONEXAO) {
      ultimoEnvio = millis();
      conectarWifi();
    }
    delay(200);
    return;
  }

  if (millis() - ultimoEnvio >= INTERVALO_ENVIO) {
    ultimoEnvio = millis();

    int adc = lerAdcEstavel();
    Serial.printf("ADC: %d\n", adc);

    bool ok = enviarLeitura(adc);
    piscar(ok ? 2 : 5);
  }

  delay(200);
}
