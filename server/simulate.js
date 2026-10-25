/*
  Gera leituras falsas para testar o dashboard sem o ESP32.

  Uso:
    npm run simulate                 -> envia para http://localhost:3000
    SERVIDOR=http://localhost:3000 API_KEY=minha-chave npm run simulate
*/

const SERVIDOR = process.env.SERVIDOR || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'troque-esta-chave';

// começa seco e vai molhando devagar, com umidade oscilando
let adc = 2950;

async function enviar() {
  adc += Math.random() * 90 - 70;
  adc = Math.max(1150, Math.min(3300, adc));

  const corpo = {
    adc: Math.round(adc),
    device: 'simulador',
    rssi: -55,
  };

  try {
    const resposta = await fetch(`${SERVIDOR}/api/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    console.log(resposta.status, JSON.stringify(dados));
  } catch (erro) {
    console.error('Falhou:', erro.message);
  }
}

console.log(`Enviando leituras para ${SERVIDOR} a cada 5 s (Ctrl+C para parar)`);
enviar();
setInterval(enviar, 5000);
