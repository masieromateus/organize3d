// Configure aqui a chave Pix do recebedor.
// Conta/agencia do banco nao geram QR Pix. Use uma chave Pix cadastrada:
// CPF/CNPJ, e-mail, telefone ou chave aleatoria.
const PIX_CONFIG = {
  key: "",
  merchantName: "ORGANIZE 3D",
  merchantCity: "SAO PAULO",
  description: "Organizador 3D",
};

const checkoutDimensions = document.querySelector("#checkoutDimensions");
const checkoutWall = document.querySelector("#checkoutWall");
const checkoutVolume = document.querySelector("#checkoutVolume");
const checkoutWeight = document.querySelector("#checkoutWeight");
const checkoutCompartments = document.querySelector("#checkoutCompartments");
const checkoutDividers = document.querySelector("#checkoutDividers");
const checkoutTotal = document.querySelector("#checkoutTotal");
const pixSetupMessage = document.querySelector("#pixSetupMessage");
const pixQrCode = document.querySelector("#pixQrCode");
const pixCopyPaste = document.querySelector("#pixCopyPaste");
const copyPixButton = document.querySelector("#copyPixButton");

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function sanitizePixText(value, maxLength) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 .,@+\-]/gi, "")
    .toUpperCase()
    .slice(0, maxLength);
}

function emv(id, value) {
  const text = String(value);
  return `${id}${String(text.length).padStart(2, "0")}${text}`;
}

function crc16(payload) {
  let crc = 0xffff;

  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function buildPixPayload(order) {
  const amount = Number(order?.estimate?.price || 0).toFixed(2);
  const txid = `ORG3D${Date.now().toString().slice(-10)}`;
  const merchantAccountInfo =
    emv("00", "br.gov.bcb.pix") +
    emv("01", PIX_CONFIG.key.trim()) +
    emv("02", sanitizePixText(PIX_CONFIG.description, 50));
  const additionalData = emv("05", txid);
  const payloadWithoutCrc =
    emv("00", "01") +
    emv("26", merchantAccountInfo) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", amount) +
    emv("58", "BR") +
    emv("59", sanitizePixText(PIX_CONFIG.merchantName, 25)) +
    emv("60", sanitizePixText(PIX_CONFIG.merchantCity, 15)) +
    emv("62", additionalData) +
    "6304";

  return payloadWithoutCrc + crc16(payloadWithoutCrc);
}

function loadOrder() {
  try {
    return JSON.parse(localStorage.getItem("organize3dCheckout"));
  } catch {
    return null;
  }
}

function renderOrder(order) {
  if (!order) {
    checkoutDimensions.textContent = "Nenhum pedido";
    checkoutWall.textContent = "--";
    checkoutVolume.textContent = "--";
    checkoutWeight.textContent = "--";
    checkoutCompartments.textContent = "--";
    checkoutDividers.textContent = "--";
    checkoutTotal.textContent = "R$ --";
    return;
  }

  const { config, estimate } = order;
  checkoutDimensions.textContent = `${config.width} x ${config.depth} x ${config.height} mm`;
  checkoutWall.textContent = `${config.wallThickness} mm`;
  checkoutVolume.textContent = `${estimate.volumeCm3.toFixed(1)} cm3`;
  checkoutWeight.textContent = `${estimate.estimatedGrams.toFixed(0)} g`;
  checkoutCompartments.textContent = String(estimate.compartmentCount);
  checkoutDividers.textContent = String(estimate.dividerCount);
  checkoutTotal.textContent = formatCurrency(estimate.price);
}

function renderPix(order) {
  if (!order) {
    pixSetupMessage.textContent = "Crie um organizador antes de finalizar o pagamento.";
    pixQrCode.hidden = true;
    pixCopyPaste.value = "";
    copyPixButton.disabled = true;
    return;
  }

  if (!PIX_CONFIG.key.trim()) {
    pixSetupMessage.textContent =
      "Configure a chave Pix no arquivo checkout.js para liberar o QR Code. Conta e agencia nao bastam para gerar Pix.";
    pixQrCode.hidden = true;
    pixCopyPaste.value = "";
    copyPixButton.disabled = true;
    return;
  }

  const payload = buildPixPayload(order);
  pixSetupMessage.textContent = "Escaneie o QR Code ou copie o Pix copia e cola.";
  pixQrCode.hidden = false;
  pixQrCode.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(payload)}`;
  pixCopyPaste.value = payload;
  copyPixButton.disabled = false;
}

copyPixButton.addEventListener("click", async () => {
  if (!pixCopyPaste.value) {
    return;
  }

  await navigator.clipboard.writeText(pixCopyPaste.value);
  copyPixButton.textContent = "PIX COPIADO";
  setTimeout(() => {
    copyPixButton.textContent = "COPIAR PIX";
  }, 1800);
});

const order = loadOrder();
renderOrder(order);
renderPix(order);
