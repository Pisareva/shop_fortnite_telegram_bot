"use strict";

import fetch from "node-fetch";
import fs from "fs";
import Jimp from "jimp";
import "dotenv/config";

import gitUpload from "./src/github_upload.js";
import discordWebhook from "./src/discord_webhook.js";

if (!process.env.FNAPI_IO_TOKEN) throw new Error("required FNAPI_IO_TOKEN not found on env");

import { shopItem as shopItemImage, finishProgram } from "./src/utils.js";

console.log("[INFO] Verificando os itens da loja");

const requestHeaders = {};
if (process.env.FNAPI_IO_TOKEN) requestHeaders.Authorization = process.env.FNAPI_IO_TOKEN;

const shopData = await fetch("https://fortniteapi.io/v2/shop", {
  headers: requestHeaders,
})
  .then(async (res) => {
    if (res.ok) return await res.json();
    await finishProgram(
      `[ERROR] O Status Code recebido é diferente do esperado: ${res.status}`
    );
  })
  .catch((err) => {
    console.log(err);
  });

const currentDate = shopData.lastUpdate.date.replace(" ", "-").split(`-`);
let shopItems = shopData.shop;

// *** Фильтрация ненужных предметов ***
shopItems = shopItems.filter((shopItem) => {
  const allowedTypes = ['outfit', 'pickaxe', 'emote', 'wrap', 'glider', 'backbling']; // Разрешённые типы предметов
  return allowedTypes.includes(shopItem.mainType);
});

console.log(`[INFO] Loja verificada, ${shopItems.length} предметов найдено`);

console.log("[INFO] Генерация изображения предметов\n");

const missingItemImage = await Jimp.read("./src/images/QuestionMark.png");
const largeItemOverlay = await Jimp.read("./src/images/LargeOverlay.png");
const smallItemOverlay = await Jimp.read("./src/images/SmallOverlay.png");
const shopBackground = await Jimp.read("./src/images/Background.png");
const vbucksIcon = await Jimp.read("./src/images/VBucks.png");

const titleFont = await Jimp.loadFont("./src/fonts/burbark/burbark_200.fnt");
const dateFont = await Jimp.loadFont("./src/fonts/burbark/burbark_64.fnt");
const burbankFont20 = await Jimp.loadFont("./src/fonts/burbark/burbark_20.fnt");
const burbankFont16 = await Jimp.loadFont("./src/fonts/burbark/burbark_16.fnt");

const itemPromises = [];

shopItems.forEach((shopItem) => {
  itemPromises.push(
    new Promise(async (resolve) => {
      const firstItem = shopItem.granted[0];
      const itemRarity = shopItem.rarity?.id || firstItem.rarity?.id;
      const itemSeries = shopItem.series?.id || firstItem.series?.id;
      let itemBackground;
      let itemImage;

      try {
        if (itemSeries)
          itemBackground = await Jimp.read(
            `./src/images/series/${itemSeries}.png`
          );
        else
          itemBackground = await Jimp.read(
            `./src/images/rarities/${itemRarity}.png`
          );
      } catch {
        itemBackground = await Jimp.read("./src/images/rarities/Common.png");
      }

      try {
        itemImage = await Jimp.read(
          shopItem.displayAssets[0].url || firstItem.images.icon
        );
      } catch {
        itemImage = missingItemImage;
      }

      itemBackground.resize(256, 256).blit(itemImage.resize(256, 256), 0, 0);

      const itemText = shopItem.displayName.toUpperCase();
      const textHeight = Jimp.measureTextHeight(burbankFont20, itemText, 245);
      const PriceWidth =
        26 +
        5 +
        Jimp.measureText(burbankFont20, `${shopItem.price.finalPrice}`);

      let priceTextPos;

      if (textHeight <= 22) {
        itemBackground.blit(smallItemOverlay, 0, 0);
        priceTextPos = 198;
      } else {
        itemBackground.blit(largeItemOverlay, 0, 0);
        priceTextPos = 178;
      }

      if (shopItem.mainType === "bundle" || shopItem.granted.length >= 2) {
        const subItemsText = `${shopItem.mainType === "bundle"
          ? shopItem.granted.length
          : "+" + (shopItem.granted.length - 1)
          }`;
        const subItemsTextWidth = Jimp.measureText(burbankFont16, subItemsText);
        const subItemTag = new Jimp(subItemsTextWidth + 4, 20, 0x0);
        subItemTag.print(burbankFont16, 2, 4, subItemsText);
        itemBackground.blit(subItemTag, 243 - subItemsTextWidth, 226);
      }

      let priceTag = new Jimp(PriceWidth, 26, 0x0);
      priceTag.blit(vbucksIcon.resize(26, 26), 1, 0);

      itemBackground.print(
        burbankFont20,
        8,
        priceTextPos,
        {
          text: itemText,
          alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
        },
        240
      );

      priceTag.print(burbankFont20, 31, 5, {
        text: shopItem.price.finalPrice.toString(),
      });

      itemBackground.blit(priceTag, 128 - PriceWidth / 2, 220);

      console.log(`Item готов: "${itemText}"`);
      resolve(
        new shopItemImage(
          itemText,
          shopItem.mainType === "bundle",
          itemSeries,
          itemRarity,
          itemBackground
        )
      );
    })
  );
});

const collumsCount =
  shopItems.length > 18 ? (shopItems.length > 21 ? 8 : 7) : 6;

shopBackground.resize(
  256 * collumsCount + 15 * (collumsCount - 1) + 100,
  256 * Math.ceil(shopItems.length / collumsCount) +
  15 * (Math.ceil(shopItems.length / collumsCount) - 1) +
  350
);

const titleText = "ITEM SHOP";
const leftWatermark = "";
const rightWatermark = "";
const dateText = `DIA ${currentDate[2]}/${currentDate[1]}/${currentDate[0]}`;

const titleWidth = Jimp.measureText(titleFont, titleText);
const dateWidth = Jimp.measureText(dateFont, dateText);
const watermarkWidth = Jimp.measureText(burbankFont20, rightWatermark);

shopBackground.print(
  titleFont,
  shopBackground.bitmap.width / 2 - titleWidth / 2,
  35,
  titleText
);
shopBackground.print(
  dateFont,
  shopBackground.bitmap.width / 2 - dateWidth / 2,
  215,
  dateText
);

shopBackground.print(
  burbankFont20,
  10,
  shopBackground.bitmap.height - 30,
  leftWatermark
);
shopBackground.print(
  burbankFont20,
  shopBackground.bitmap.width - watermarkWidth - 10,
  shopBackground.bitmap.height - 30,
  rightWatermark
);

let currentShopRow = 0;
let currentShopColumn = 0;
let lastLineOffset = 0;

const itemImages = await Promise.all(itemPromises);

itemImages.sort((a, b) => {
  const namePoints =
    a.itemName > b.itemName ? 1 : a.itemName < b.itemName ? -1 : 0;
  return b.sortPoints - a.sortPoints + namePoints;
});

console.log("\n[INFO] Генерация изображения магазина");

itemImages.forEach(({ image }) => {
  if (
    lastLineOffset === 0 &&
    currentShopRow === Math.floor(itemImages.length / collumsCount)
  )
    lastLineOffset =
      (256 * (collumsCount - (itemImages.length % collumsCount)) +
        (collumsCount - (itemImages.length % collumsCount)) * 15) / 2;

  shopBackground.blit(
    image,
    lastLineOffset + 256 * currentShopColumn + 15 * currentShopColumn + 50,
    256 * currentShopRow + 15 * currentShopRow + 300
  );

  if ((currentShopColumn + 1) % collumsCount === 0) {
    currentShopRow += 1;
    currentShopColumn = 0;
  } else currentShopColumn += 1;
});


import axios from 'axios';
import FormData from 'form-data';  // Импортируем FormData

const savePath = './ImagensGeradas/';
// Проверим, существует ли директория, если нет — создадим её
if (!fs.existsSync(savePath)) {
  fs.mkdirSync(savePath, { recursive: true });
}

function saveImage(version = 1) {
  return new Promise(async (resolve, reject) => {
    const fileName = `${String(currentDate[2]).padStart(2, '0')}-${String(currentDate[1]).padStart(2, '0')}-${String(currentDate[0]).padStart(2, '0')}_v${version}.png`;
    if (fs.existsSync(savePath + fileName)) return resolve(await saveImage(version + 1));
    await shopBackground.writeAsync(savePath + fileName);
    resolve(fileName);
  });
}

// Функция для отправки изображения в Telegram
async function sendImageToTelegram(filePath) {
  const formData = new FormData();
  formData.append('chat_id', process.env.TELEGRAM_CHAT_ID);  // Используем ID чата из переменной окружения
  formData.append('photo', fs.createReadStream(filePath));   // Читаем файл изображения
  formData.append('caption', "Ежедневный магазин предметов Fortnite");  // Заголовок для изображения

  try {
    const response = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, formData, {
      headers: formData.getHeaders()  // Устанавливаем заголовки формы
    });
    console.log("Изображение отправлено в Telegram:", response.data);
  } catch (error) {
    console.error("Ошибка при отправке изображения в Telegram:", error.response ? error.response.data : error.message);
  }
}
