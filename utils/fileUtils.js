const fs = require("fs").promises;
const path = require("path");

// Функция для транслитерации и очистки имени файла
function sanitizeFileName(name) {
  return name
    .replace(/[^a-zA-Zа-яА-Я0-9\s]/g, "") // Удаляем спецсимволы
    .replace(/\s+/g, " ") // Заменяем множественные пробелы на один
    .trim();
}

// Функция для получения названия месяца на русском
function getRussianMonthName(date) {
  const months = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  return months[date.getMonth()];
}

// Функция для генерации уникального имени файла
async function generateUniqueFileName(baseName, directory, extension = "pdf") {
  let counter = 1;
  let fileName = `${baseName}.${extension}`;
  let filePath = path.join(directory, fileName);

  // Проверяем, существует ли файл с таким именем
  while (true) {
    try {
      await fs.access(filePath);
      // Файл существует, генерируем новое имя
      counter++;
      fileName = `${baseName} (${counter}).${extension}`;
      filePath = path.join(directory, fileName);
    } catch (error) {
      // Файл не существует, можно использовать это имя
      break;
    }
  }

  return { fileName, filePath };
}

// Функция для создания структуры папок по дате
async function createDateFolderStructure(baseDate) {
  const date = new Date(baseDate);
  const year = date.getFullYear().toString();
  const month = getRussianMonthName(date);

  const yearPath = path.join("uploads", year);
  const monthPath = path.join(yearPath, month);

  // Создаем папки если их нет
  try {
    await fs.mkdir(yearPath, { recursive: true });
    await fs.mkdir(monthPath, { recursive: true });
  } catch (error) {
    // Папка уже существует - это нормально
    if (error.code !== "EEXIST") {
      throw error;
    }
  }

  return monthPath;
}

// Функция для сохранения файла с правильной структурой
async function saveFileWithStructure(file, date, organization, fileType) {
  if (!file) return null;

  // Создаем структуру папок
  const directory = await createDateFolderStructure(date);

  // Форматируем дату для имени файла
  const dateStr = new Date(date)
    .toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\./g, ".");

  // Очищаем название организации
  const cleanOrgName = sanitizeFileName(organization);

  // Базовое имя файла
  const baseName = `${dateStr} ${cleanOrgName} ${fileType}`;

  // Генерируем уникальное имя файла
  const { fileName, filePath } = await generateUniqueFileName(
    baseName,
    directory
  );

  // Сохраняем файл
  await fs.writeFile(filePath, file.buffer);

  // Возвращаем относительный путь от корня проекта
  return path.relative(process.cwd(), filePath);
}

module.exports = {
  sanitizeFileName,
  getRussianMonthName,
  generateUniqueFileName,
  createDateFolderStructure,
  saveFileWithStructure,
};
