#pragma once

// Copie este arquivo para secrets.h e preencha os valores.
// O secrets.h nao deve ir para o GitHub (.gitignore).
//
// O ESP32 tenta as redes na ordem da lista. Use apenas redes 2,4 GHz
// (nomes terminados em "_5G" nao funcionam no ESP32).

struct RedeWiFi {
  const char* ssid;
  const char* senha;
};

static const RedeWiFi REDES_WIFI[] = {
  { "rede de casa",  "senha de casa"  },
  { "rede do curso", "senha do curso" },
};

static const uint8_t TOTAL_REDES_WIFI = sizeof(REDES_WIFI) / sizeof(REDES_WIFI[0]);

#define SERVIDOR_URL "http://192.168.0.10:3000/api/readings"
#define API_KEY "troque-esta-chave"
#define DISPOSITIVO "estufa-senai"
